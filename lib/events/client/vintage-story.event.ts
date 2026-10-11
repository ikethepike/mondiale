import type { ClientSideEventHandler } from '~~/lib/events/client-registry'
import { vintageStoryKey } from '~~/lib/vintage-story'

/** Vintage: one round's story, delivered to this socket alone once its seat
 *  is graded (no `game` payload — the years never ride a snapshot). */
export const vintageStoryEvent: ClientSideEventHandler = async ({ gameStore, payload }) => {
  if (payload.event !== 'vintage-story' || !gameStore.game) return
  gameStore.vintageStories = {
    ...gameStore.vintageStories,
    [vintageStoryKey(gameStore.game.id, payload.round)]: payload.story,
  }
}
