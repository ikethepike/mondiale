import { MANHUNT_TAUNTS } from '~~/lib/manhunt'
import type { ClientSideEventHandler } from '~~/lib/events/client-registry'

/**
 * A relayed taunt lands in the live-guess ticker as its own kind — the text
 * resolves from MANHUNT_TAUNTS by role and index, never from the wire.
 *
 * Unlike live guesses the self-echo is KEPT (the cheer-relay precedent): a
 * taunt is speech, not a guess, and the sender seeing their own line land is
 * the delivery receipt — the view keeps no local copy.
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
