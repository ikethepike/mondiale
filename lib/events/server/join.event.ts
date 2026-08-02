import { generateTiles } from '~~/lib/tiles'
import { verifyPlayerSecret } from '~~/lib/player-secret'
import type { EventHandler } from '~~/server/middleware/socket.server'
import { createPlayer } from '../../../lib/player'

import { fetchSecrets, saveSecrets, useServerSideEvents } from '../server-side'
import {
  scheduleMovementPhase,
  SETTLED_PHASES,
  tableIsSettled,
} from './enter-movement-phase.handler'
import { rearmLiveRound } from './rearm-round'

/** A room stops admitting watchers past this — a bound on the "N watching"
 *  count and, more importantly, on the spectator records that ride every
 *  broadcast snapshot. Rejected joins get the same door-closed dead end. */
const MAX_SPECTATORS = 20

export const joinEventHandler: EventHandler = async ({
  io,
  redis,
  socket,
  eventData,
  eventTarget,
}) => {
  if (eventData.event !== 'join') return
  console.log({ playerId: eventTarget.playerId })

  const server = useServerSideEvents({ socket, redis, io })

  const { gameId, playerId } = eventTarget

  // Bind-time authorization: the presented secret (from the handshake, never
  // the broadcast) must match the one on file for this id, or this is an
  // impersonation attempt. See lib/player-secret.ts for the verdict rules.
  const presentedSecret =
    typeof socket.handshake.auth?.secret === 'string' ? socket.handshake.auth.secret : undefined
  const secrets = await fetchSecrets(redis, gameId)
  const verdict = verifyPlayerSecret(secrets[playerId], presentedSecret)
  if (verdict === 'reject') {
    console.warn(`Rejected join: secret mismatch for ${playerId} in ${gameId}`)
    socket.emit('game-already-started', { event: 'game-already-started' }, eventTarget)
    socket.disconnect(false)
    return
  }
  if (verdict === 'claim' && presentedSecret) {
    secrets[playerId] = presentedSecret
    await saveSecrets(redis, gameId, secrets)
  }

  let game = await server.fetchGame(gameId)

  // Game does not exist, we have to create it
  if (!game) {
    const { variant } = eventData
    console.log(`Creating room: ${gameId} - ${variant}`)
    game = {
      variant,
      id: gameId,
      rounds: [],
      players: {},
      started: false,
      host: playerId,
      length: 'medium',
      difficulty: 'normal',
      liveGuesses: true,
      challengeOverrides: {},
      tiles: generateTiles('medium', gameId),
    }

    game.players[playerId] = createPlayer(playerId)

    await server.updateGameState(game)
  }

  // Player connecting to existing game — hand them a colour nobody else has
  if (!game.players[playerId] && !game.started) {
    const takenColors = Object.values(game.players).map(existing => existing.color)
    game.players[playerId] = createPlayer(playerId, takenColors)
  }

  // Game already started: latecomers fork on the spectator door. With it open
  // they watch — in the socket room (every broadcast is a room broadcast, so
  // this alone makes spectating live), never in `players`, never own a pawn.
  // The upsert keeps re-joins idempotent, exactly like player joins.
  if (!game.players[playerId] && game.started) {
    if (game.allowSpectators) {
      // Cap new watchers: spectator records ride every broadcast, so an
      // unbounded set inflates the snapshot for the whole room. Returning
      // watchers (already in the set) always get back in.
      const alreadyWatching = !!game.spectators?.[playerId]
      const watching = Object.keys(game.spectators ?? {}).length
      if (!alreadyWatching && watching >= MAX_SPECTATORS) {
        console.warn(`Spectator cap reached for ${gameId} — refusing ${playerId}`)
        socket.emit('game-already-started', { event: 'game-already-started' }, eventTarget)
        socket.disconnect(false)
        return
      }

      game.spectators ??= {}
      game.spectators[playerId] ??= { id: playerId, joinedAtRound: game.rounds.length }

      await socket.join(gameId)
      socket.data.playerId = playerId
      socket.data.gameId = gameId

      await server.updateGameState(game)
      server.emit({ event: 'player-joined', game }, eventTarget)
      return
    }

    // Door closed. Emit straight to this socket: it never joined the gameId
    // room, so a room broadcast would reach everyone except the one player
    // the message is about. Close only once the frame is on the wire.
    socket.emit('game-already-started', { event: 'game-already-started' }, eventTarget)
    socket.disconnect(false)
    return
  }

  // Safety logic for returning players: someone who left before answering owes
  // the live round an answer, so hand them back the challenge. Guarded on the
  // answer being ABSENT — a player whose answer is already banked has finished
  // the round, and demoting them would strand the table on a seat that can
  // never submit again (the duplicate guard heals that case, but this must not
  // manufacture it) — and on NO round being mid-stage: during the 2s settle
  // pause the latest round exists but is unrevealed, and flipping a seat early
  // would fail the reveal's tableIsSettled check with `pendingRoundStart` left
  // true forever (the watchdog refuses to arm while it is set).
  const index = game.rounds.length - 1
  if (index !== -1 && !game.pendingRoundStart) {
    const latestRound = game.rounds[index]
    if (
      game.players[playerId].phase === 'movement-summary' &&
      !latestRound.groupAnswers[playerId]
    ) {
      game.players[playerId].phase = 'group-challenge'
    }
  }

  // Movement pacing runs on in-memory timers — a server restart mid-pause
  // orphans the player: a challenge phase with no move to show (blank
  // screen), a saved 'moving' phase nobody is walking, or a `resolving`
  // latch whose 5s result beat died before clearing it (the seat can never
  // submit again and, with a move still queued, matches no other heal).
  // Rejoining is the recovery moment: re-enter the movement flow, which is
  // safe to repeat — it clears the latch and re-lands the player on their
  // gate or resumes their walk.
  const rejoining = game.players[playerId]
  const orphanedInChallenge =
    ['individual-challenge', 'final-challenge'].includes(rejoining.phase) &&
    (rejoining.moves.length === 0 || rejoining.resolving === true)
  const wedgedMoving = rejoining.phase === 'moving'

  // Every seat settled but the round never staged: the advance is driven by a
  // client flag held in browser memory, so a refresh (or a board chunk that
  // failed to load) can leave the whole table parked on "Finished this turn"
  // with nobody able to ask the server to move on. Rejoining is the recovery
  // moment — re-entering is idempotent, so make the refresh the escape hatch.
  // Any settled seat may be the one refreshing (a winner's re-check re-enters
  // as a pure advance check), so the guard is the settled set, not one phase.
  const tableSettledButStuck =
    SETTLED_PHASES.includes(rejoining.phase) && tableIsSettled(Object.values(game.players))

  if (game.started && (orphanedInChallenge || wedgedMoving || tableSettledButStuck)) {
    console.warn(`Healing wedged player ${playerId} (phase: ${rejoining.phase})`)
    // The walk guard rejects 'moving' re-entry; hand the phase back first
    if (wedgedMoving) rejoining.phase = 'group-scores'

    scheduleMovementPhase(1500, { io, redis, socket, eventTarget })
  }

  // The clocked round engines pace themselves on in-memory timers too — a
  // restart mid-round leaves a shot clock, reveal hold, or briefing cap that
  // nobody will ever fire. Re-arm whatever the live round is waiting on;
  // idempotent alongside live timers (see rearm-round.ts). Never while a
  // round is staged-but-unrevealed (its clocks only stamp at the reveal).
  // Open tutorials (the forced round-1 seam) gate ONLY the briefing caps —
  // a cap must not force-start under a rules card, but every other shape
  // (shot clock, reveal hold, settle) must recover even mid-round-1, or one
  // AFK tutorial seat disables the whole safety net.
  // Arming BEFORE this handler's save is safe — the armed tasks re-fetch and
  // join's pending mutations never touch engine state — but it is an
  // exception to the engines' "arm AFTER the save" contract, not a pattern
  // to copy.
  const tutorialsUp = Object.values(game.players).some(entry => entry.phase === 'tutorial')
  if (game.started && !game.pendingRoundStart) {
    rearmLiveRound({ io, redis, socket, eventTarget }, game, { armBriefingCaps: !tutorialsUp })
  }

  await socket.join(gameId)

  // Bind this socket to the player id it just claimed. The dispatch layer
  // rejects any later event whose eventTarget.playerId doesn't match, so one
  // client can't forge another player's actions (rename, recolor, score,
  // move, knock out). `join` is the only handler allowed to establish this.
  socket.data.playerId = eventTarget.playerId
  socket.data.gameId = gameId

  await server.updateGameState(game)

  server.emit({ event: 'player-joined', game }, eventTarget)
}
