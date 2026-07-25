import { generateTiles } from '~~/lib/tiles'
import { verifyPlayerSecret } from '~~/lib/player-secret'
import type { EventHandler } from '~~/server/middleware/socket.server'
import { createPlayer } from '../../../lib/player'

import { enqueueGameTask, fetchSecrets, saveSecrets, useServerSideEvents } from '../server-side'
import { enterMovementPhaseHandler } from './enter-movement-phase.handler'

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
      tiles: generateTiles('medium'),
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

  // Safety logic for returning players
  const index = game.rounds.length - 1
  if (index !== -1) {
    console.log('There are rounds')
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
  // screen), or a saved 'moving' phase nobody is walking. Rejoining is the
  // recovery moment: re-enter the movement flow, which is safe to repeat.
  const rejoining = game.players[playerId]
  const orphanedInChallenge =
    ['individual-challenge', 'final-challenge'].includes(rejoining.phase) &&
    rejoining.moves.length === 0
  const wedgedMoving = rejoining.phase === 'moving'

  if (game.started && (orphanedInChallenge || wedgedMoving)) {
    console.warn(`Healing wedged player ${playerId} (phase: ${rejoining.phase})`)
    // The walk guard rejects 'moving' re-entry; hand the phase back first
    if (wedgedMoving) rejoining.phase = 'group-scores'

    setTimeout(() => {
      enqueueGameTask(gameId, () =>
        enterMovementPhaseHandler({
          io,
          redis,
          socket,
          eventTarget,
          eventKey: 'enter-movement-phase',
          eventData: { event: 'enter-movement-phase' },
        })
      )
    }, 1500)
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
