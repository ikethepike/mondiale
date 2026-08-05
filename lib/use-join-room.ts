import { useClientEvents } from '~~/lib/events/client-side'
import { gameVariants, isValidGameVariant } from '~~/types/game.types'

/**
 * The one join trigger. Reads the room id from the route, folds it into the
 * handshake auth (which already carries playerId + secret from the socket
 * plugin) so a reconnect re-presents all three, and emits `join` with the
 * store's watch intent. Callers: the room page (mount + reconnect) and the
 * dead-end card's "Watch instead" — a spectatable room-full refusal leaves
 * the socket connected, so the retry is this same plain emit. The
 * `connect()` belt covers the disconnected shapes (socket.io buffers the
 * emit and flushes it once the connection is up).
 */
export const useJoinRoom = () => {
  const route = useRoute()
  const { update, gameStore } = useClientEvents()

  return () => {
    const socket = gameStore.socket
    const roomId = route.params.roomId
    if (socket && typeof roomId === 'string') {
      socket.auth = { ...(socket.auth as Record<string, unknown>), gameId: roomId }

      // The room id must also ride the connection URL (manager query) — the
      // server's routing layer (game-routing.ts) reads it there to steer the
      // socket to the machine that owns this game. A socket connected under
      // another (or no) room re-connects so the handshake passes the router;
      // the join emit below is buffered and flushes once the new connection
      // is up.
      const manager = socket.io
      const query = (manager.opts.query ?? {}) as Record<string, string>
      if (query.gameId !== roomId) {
        manager.opts.query = { ...query, gameId: roomId }
        if (socket.connected) socket.disconnect()
      }
    }
    if (socket?.disconnected) socket.connect()

    const { variant } = route.query
    update({
      event: 'join',
      variant: isValidGameVariant(variant) ? variant : gameVariants[0],
      ...(gameStore.joinAsSpectator ? { asSpectator: true } : {}),
    })
  }
}
