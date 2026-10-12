import { computed, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { useClientEvents } from '~~/lib/events/client-side'
import { twoTruthsReceiptKey } from '~~/lib/two-truths'

/**
 * A Two Truths round's receipts for this socket, by card: asked for when the
 * seat bought its reveal and again once it may see every card, delivered by
 * the targeted 'two-truths-receipts' emit. A request that never left is asked
 * again on the next change.
 */
export const useTwoTruthsReceipts = (
  round: MaybeRefOrGetter<number | undefined>,
  wanted: MaybeRefOrGetter<'none' | 'reveal' | 'all'>
) => {
  const { gameStore, update } = useClientEvents()
  const key = computed(() => {
    const index = toValue(round)
    return gameStore.game && index !== undefined
      ? twoTruthsReceiptKey(gameStore.game.id, index)
      : undefined
  })
  const asked = new Set<string>()
  watch(
    () => [key.value, toValue(wanted)] as const,
    async ([receiptKey, want]) => {
      const index = toValue(round)
      if (!receiptKey || want === 'none' || index === undefined) return
      const ask = `${receiptKey}:${want}`
      if (asked.has(ask)) return
      asked.add(ask)
      const sent = await update({ event: 'fetch-two-truths-receipts', round: index }).catch(
        () => false
      )
      if (!sent) asked.delete(ask)
    },
    { immediate: true }
  )
  return computed(() => (key.value ? gameStore.twoTruthsReceipts[key.value] : undefined))
}
