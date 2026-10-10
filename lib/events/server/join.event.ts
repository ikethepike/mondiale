import { generateTiles } from '~~/lib/tiles'
import { verifyPlayerSecret } from '~~/lib/player-secret'
import type { EventHandler } from '~~/server/middleware/socket.server'
import { createPlayer, joinVerdict } from '../../../lib/player'
import { isBotId } from '~~/lib/bots'
import { noteSeatPresence, releaseAutopilot } from './bot-brain'

import { fetchSecrets, saveSecrets, useServerSideEvents } from '../server-side'
import { rearmLiveRound } from './rearm-round'

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

  // Bot seats are server-played and have no bearer secret — without this
  // refusal, a tab presenting a bot's public id would land in 'claim' below
  // and walk off with the seat. 'removed-from-room' is the honest terminal
  // card for both game states; "already started" would lie about a lobby.
  if (isBotId(playerId)) {
    console.warn(`Refusing socket claiming bot id ${playerId} in ${gameId}`)
    socket.emit('removed-from-room', { event: 'removed-from-room' }, eventTarget)
    socket.disconnect(false)
    return
  }

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

  // In-memory timers die with a restart; Redis outlives them. Rejoining is
  // the recovery moment: every seat re-arms the one timer its cursor implies,
  // and the live round's engine re-arms its own clocks. Idempotent beside
  // live timers. Open tutorials gate ONLY the briefing caps — a cap must not
  // force-start under a rules card.
  const tutorialsUp = Object.values(game.players).some(entry => entry.cursor.step === 'tutorial')
  if (game.started) {
    rearmLiveRound({ io, redis, socket, eventTarget }, game, { armBriefingCaps: !tutorialsUp })
  }

  await socket.join(gameId)

  // The autopilot's release moment: the player is back, so the brain lets go
  // — every pending bot act dies on its brain-seat guard — and the catch-up
  // summary goes out. AFTER socket.join, or the returning tab (the one
  // client the summary is FOR) is not yet in the room to receive it; the
  // save below carries the cleared latch.
  const rejoining = game.players[playerId]
  if (game.started && rejoining.autopilot) {
    releaseAutopilot({ io, redis, socket, eventTarget }, game, rejoining)
  }

  // Bind this socket to the player id it just claimed. The dispatch layer
  // rejects any later event whose eventTarget.playerId doesn't match, so one
  // client can't forge another player's actions (rename, recolor, score,
  // move, knock out). `join` is the only handler allowed to establish this.
  socket.data.playerId = eventTarget.playerId
  socket.data.gameId = gameId

  // The AFK takeover's "reconnected since I armed?" stamp: without it, a
  // player who came back mid-grace and happened to be mid-refresh at fire
  // time read as still gone (no live socket) and lost their seat to the
  // autopilot one second into an ordinary reload.
  //
  // Stamped AFTER the rearm above ON PURPOSE. `rearmAfkTakeovers` runs before
  // this socket is in the room, so it can still arm a takeover for the very
  // seat now rejoining — that pending act stands down only because the stamp
  // written here is strictly LATER than the `armedAt` it captured. Move the
  // stamp above the rearm and the timestamps tie, and a rejoining player can
  // lose their seat to the autopilot they just outran.
  noteSeatPresence(gameId, playerId)

  await server.updateGameState(game)

  server.emit({ event: 'player-joined', game }, eventTarget)
}
