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
