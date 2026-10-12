import { computed, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { useClientEvents } from '~~/lib/events/client-side'
import { twoTruthsReceiptKey } from '~~/lib/two-truths'

/**
 * A Two Truths round's receipts and the table's banked sheets for this socket,
 * delivered by the targeted 'two-truths-receipts' emit. The server answers
 * only once the socket may see them and declines silently before that, so an
 * ask is spent per `moment` — the caller's word for the table's state (who has
 * banked, whether the round settled) — and asked again when that moves.
 */
export const useTwoTruthsReceipts = (
  round: MaybeRefOrGetter<number | undefined>,
  wanted: MaybeRefOrGetter<'none' | 'reveal' | 'all'>,
  moment: MaybeRefOrGetter<string>
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
    () => [key.value, toValue(wanted), toValue(moment)] as const,
    async ([receiptKey, want, at]) => {
      const index = toValue(round)
      if (!receiptKey || want === 'none' || index === undefined) return
      const ask = `${receiptKey}:${want}:${at}`
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
