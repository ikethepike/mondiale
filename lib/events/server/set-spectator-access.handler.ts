import { defineGameHandler } from '../server-side'

/**
 * Host-only door policy for watchers, togglable at ANY point — before the
 * start (from the lobby settings) or mid-race (from the host's victory
 * report). Closing the door also ejects current spectators: it's the only
 * eviction lever a host has against a lurker.
 */
export const setSpectatorAccessHandler = defineGameHandler(
  'set-spectator-access',
  async ({ game, server, eventData, eventTarget, io }) => {
    if (game.host !== eventTarget.playerId)
      return console.warn(`Non-host tried to set spectator access: ${eventTarget.playerId}`)

    // Never assign an unchecked client value into game state — a crafted
    // non-boolean would land in the snapshot every client reads.
    if (typeof eventData.allowed !== 'boolean')
      return console.warn(`Invalid spectator-access payload for ${game.id}`)

    game.allowSpectators = eventData.allowed

    const ejected = eventData.allowed ? [] : Object.keys(game.spectators ?? {})
    if (!eventData.allowed) delete game.spectators

    await server.updateGameState(game)
    // Whole-snapshot event (like configuration-updated): the change is
    // game-level, and ejected spectators must see themselves gone.
    server.emit({ event: 'configuration-updated', game }, eventTarget)

    // Drop ejected spectators from the socket room AFTER the broadcast, so
    // they learn the door closed — server-side, so a misbehaving client
    // can't keep listening to the race.
    if (ejected.length) {
      const sockets = await io.in(eventTarget.gameId).fetchSockets()
      for (const roomSocket of sockets) {
        const boundId = roomSocket.data.playerId
        if (boundId && ejected.includes(boundId)) roomSocket.leave(eventTarget.gameId)
      }
    }
  }
)
