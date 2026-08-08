import { generateTiles } from '~~/lib/tiles'
import type { Player } from '~~/types/player.type'
import { verifyPlayerSecret } from '~~/lib/player-secret'
import type { EventHandler } from '~~/server/middleware/socket.server'
import { createPlayer, joinVerdict } from '../../../lib/player'

import { fetchSecrets, saveSecrets, useServerSideEvents } from '../server-side'
import { scheduleMovementPhase, tableIsSettled } from './enter-movement-phase.handler'
import { revealHoldMsFor, SETTLED_PHASES } from '~~/lib/round-beats'
import { movesForScoredPoints, startWalk } from './moves'
import { rearmLiveRound } from './rearm-round'

/**
 * A seat whose answer is banked but whose phase advance was lost. The table
 * cannot advance past it (`readyForNextTurn` needs every seat settled), and
 * the submit handler's own heal only fires if the client sends a duplicate —
 * which a client that exhausted its ack retries, or closed its tab, never
 * does. Rejoining is the recovery moment.
 */
export const isStrandedSubmitter = ({
  phase,
  answered,
}: {
  phase: Player['phase']
  answered: boolean
}): boolean => phase === 'group-challenge' && answered

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
      allowSpectators: true,
      challengeOverrides: {},
      tiles: generateTiles('medium', gameId),
    }

    game.players[playerId] = createPlayer(playerId)

    await server.updateGameState(game)
  }

  // One admission rule for every join shape (see joinVerdict): seat, watch,
  // or refuse. Refusals emit straight to this socket — it never joined the
  // gameId room, so a room broadcast would reach everyone except the one
  // player the message is about — and close only once the frame is on the
  // wire. The exception: a spectatable room-full keeps the socket CONNECTED,
  // so "Watch instead" is a plain re-emit of join, no reconnect dance.
  const admission = joinVerdict(game, playerId, eventData.asSpectator === true)

  if (admission.admit === 'refuse') {
    console.warn(`Refusing ${playerId} in ${gameId}: ${admission.reason}`)
    if (admission.reason === 'room-full') {
      socket.emit(
        'room-full',
        { event: 'room-full', spectatable: admission.spectatable },
        eventTarget
      )
      if (!admission.spectatable) socket.disconnect(false)
    } else {
      socket.emit(admission.reason, { event: admission.reason }, eventTarget)
      socket.disconnect(false)
    }
    return
  }

  // Watchers live in the socket room (every broadcast is a room broadcast, so
  // this alone makes spectating live), never in `players`, never own a pawn.
  // The upsert keeps re-joins idempotent, exactly like player joins. A record
  // stamped `joinedAtRound: 0` was on the balcony before the start. Watchers
  // skip the healing/re-arm tail below — they have no seat to heal.
  if (admission.admit === 'spectate') {
    game.spectators ??= {}
    game.spectators[playerId] ??= { id: playerId, joinedAtRound: game.rounds.length }

    await socket.join(gameId)
    socket.data.playerId = playerId
    socket.data.gameId = gameId

    await server.updateGameState(game)
    server.emit({ event: 'player-joined', game }, eventTarget)
    return
  }

  // Seat verdict: hand a newcomer a colour nobody else has
  if (!game.players[playerId] && !game.started) {
    const takenColors = Object.values(game.players).map(existing => existing.color)
    game.players[playerId] = createPlayer(playerId, takenColors)
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

  // An answer banked while the phase advance was LOST: the seat sits in
  // 'group-challenge' forever, and because `readyForNextTurn` needs every
  // seat settled, that one seat freezes the whole table. The submit handler
  // heals this when a duplicate arrives — but a client that gave up (its
  // ack retries exhausted, or the tab closed) sends no duplicate, so the
  // refresh has to be the cure. Same recipe as the handler's heal: read the
  // banked score, never recompute it.
  const banked = game.rounds[index]?.playerTurns[playerId]?.points
  const strandedSubmitter = isStrandedSubmitter({
    phase: rejoining.phase,
    answered: !!game.rounds[index]?.groupAnswers[playerId],
  })

  // On a kind with a reveal beat, answer-banked-but-still-in-challenge is
  // the NORMAL mid-hold state — the flip task (or rearmClassicRound's
  // banked-seat sweep below) owns the advance, and healing here would yank
  // the rejoiner to the scorecard mid-beat. Only heal where the flip is
  // inline (hold 0) and the state really is a lost advance.
  const midRevealHold = !!revealHoldMsFor(game.rounds[index]?.groupChallenge)
  if (game.started && strandedSubmitter && !midRevealHold) {
    console.warn(`Healing stranded submitter ${playerId} on rejoin (answer banked, phase was not)`)
    rejoining.phase = 'group-scores'
    startWalk(
      rejoining,
      await movesForScoredPoints({ game, player: rejoining, scored: banked?.scored ?? 0 })
    )
  }

  if (game.started && (orphanedInChallenge || wedgedMoving || tableSettledButStuck)) {
    console.warn(`Healing wedged player ${playerId} (phase: ${rejoining.phase})`)
    // A heal is server-originated: it travels as a continuation, which may
    // re-enter ANY walkable phase — including 'moving' directly, where it
    // steps or arrives in place. (The old phase reset to 'group-scores' was
    // a relic of the pre-continuation guard, and it flashed a healthy
    // walker back to their scorecard on every mid-walk reconnect.) A
    // surviving step chain beside this heal is deduped by the single-stepper
    // latch. No walkSeq — the heal targets whatever generation is current.
    scheduleMovementPhase(1500, { io, redis, socket, eventTarget }, { continuation: true })
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
