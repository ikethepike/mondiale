import { defineGameHandler } from '../server-side'

/** Denylist bound: lobbyKicks rides every broadcast snapshot (same argument
 *  as MAX_SPECTATORS), so a churn-heavy lobby must not grow it forever.
 *  Oldest entries fall off — a 48h-TTL room never meaningfully recycles
 *  sixty-four kicked ids. */
const LOBBY_KICKS_MAX = 64

/**
 * Host-only, lobby-only: remove a seated player and free their chair. The
 * kicked id lands on `lobbyKicks`, which joinVerdict checks first — neither
 * door readmits them, so their tab's automatic re-join bounces. Fire-and-
 * forget by design: a lost kick is a visible non-event the host re-clicks.
 */
export const kickPlayerHandler = defineGameHandler('kick-player', async context => {
  const { game, server, eventData, eventTarget, io } = context
  if (game.host !== eventTarget.playerId)
    return console.warn(`Non-host tried to kick: ${eventTarget.playerId}`)
  if (game.started) return console.warn(`Ignoring mid-race kick in ${game.id}`)

  const { targetId } = eventData
  if (typeof targetId !== 'string' || !game.players[targetId])
    return console.warn(`Invalid kick target for ${game.id}`)
  if (targetId === game.host) return console.warn(`Host cannot kick themselves in ${game.id}`)
  // Bots go through remove-bot: a bot id can never rejoin (the join door
  // refuses the prefix), so denylisting it here only burns lobbyKicks slots
  // until genuinely kicked humans fall off the 64-entry cap and re-enter.
  if (game.players[targetId]?.bot) return console.warn(`Bot kick routed wrong in ${game.id}`)

  game.players = Object.fromEntries(Object.entries(game.players).filter(([id]) => id !== targetId))
  game.lobbyKicks ??= []
  if (!game.lobbyKicks.includes(targetId)) game.lobbyKicks.push(targetId)
  if (game.lobbyKicks.length > LOBBY_KICKS_MAX) {
    game.lobbyKicks = game.lobbyKicks.slice(-LOBBY_KICKS_MAX)
  }

  await server.updateGameState(game)
  // Whole-snapshot event: the lobby sees the seat free up.
  server.emit({ event: 'player-joined', game }, eventTarget)

  // Tell the kicked tab directly BEFORE evicting it from the room, so it
  // lands on the removed card via `rejected` rather than puzzling over a
  // snapshot it is no longer part of — then close, like every terminal
  // refusal (see join.event.ts).
  const sockets = await io.in(eventTarget.gameId).fetchSockets()
  for (const roomSocket of sockets) {
    if (roomSocket.data.playerId !== targetId) continue
    roomSocket.emit('removed-from-room', { event: 'removed-from-room' }, eventTarget)
    roomSocket.leave(eventTarget.gameId)
    roomSocket.disconnect(false)
  }
})
