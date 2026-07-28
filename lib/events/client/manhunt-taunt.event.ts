import { MANHUNT_TAUNTS } from '~~/lib/manhunt'
import type { ClientSideEventHandler } from '~~/plugins/socket.client'

/**
 * A relayed taunt lands in the live-guess ticker as its own kind — the text
 * resolves from MANHUNT_TAUNTS by role and index, never from the wire.
 */
export const manhuntTauntEvent: ClientSideEventHandler = async ({ gameStore, payload }) => {
  if (payload.event !== 'manhunt-taunt') return
  const line = MANHUNT_TAUNTS[payload.role]?.[payload.index]
  if (!line) return
  gameStore.map.liveGuesses = [
    ...gameStore.map.liveGuesses.slice(-11),
    {
      entryId: payload.entryId,
      playerId: payload.playerId,
      kind: 'taunt',
      label: line,
      at: payload.at,
    },
  ]
}
