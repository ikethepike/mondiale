import { computed, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { useClientEvents } from '~~/lib/events/client-side'
import { vintageStoryKey } from '~~/lib/vintage-story'

/**
 * A Vintage round's story for this socket: asked for once `ready` (the seat
 * is graded, or the round is behind the table), delivered by the targeted
 * 'vintage-story' emit. A request that never left is asked again on the
 * next change.
 */
export const useVintageStory = (
  round: MaybeRefOrGetter<number | undefined>,
  ready: MaybeRefOrGetter<boolean>
) => {
  const { gameStore, update } = useClientEvents()
  const key = computed(() => {
    const index = toValue(round)
    return gameStore.game && index !== undefined
      ? vintageStoryKey(gameStore.game.id, index)
      : undefined
  })
  const asked = new Set<string>()
  watch(
    () => [key.value, toValue(ready)] as const,
    async ([wanted, isReady]) => {
      const index = toValue(round)
      if (!wanted || !isReady || index === undefined) return
      if (gameStore.vintageStories[wanted] || asked.has(wanted)) return
      asked.add(wanted)
      const sent = await update({ event: 'fetch-vintage-story', round: index }).catch(() => false)
      if (!sent) asked.delete(wanted)
    },
    { immediate: true }
  )
  return computed(() => (key.value ? gameStore.vintageStories[key.value] : undefined))
}
