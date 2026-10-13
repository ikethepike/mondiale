import { computed, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { useClientEvents } from '~~/lib/events/client-side'
import { unmaskDossierKey } from '~~/lib/unmask-pace'
import { useServerNow } from '~~/lib/use-server-now'

/** How long a short reply waits before the dossier is asked again. */
const RETRY_MS = 400

/**
 * An Unmask round's dossier for this socket. It asks whenever the round clock
 * has reached a rung the dossier does not hold yet, or once `revealed` wants
 * the answer, and the targeted 'unmask-dossier' emit fills it in. The server
 * decides what is due; while a reply is short, the server-clock ticker asks
 * again every `RETRY_MS`.
 */
export const useUnmaskDossier = (
  round: MaybeRefOrGetter<number | undefined>,
  due: MaybeRefOrGetter<number>,
  revealed: MaybeRefOrGetter<boolean>
) => {
  const { gameStore, update } = useClientEvents()
  const { now } = useServerNow()
  const dossier = computed(() => {
    const index = toValue(round)
    return gameStore.game && index !== undefined
      ? gameStore.unmaskDossiers[unmaskDossierKey(gameStore.game.id, index)]
      : undefined
  })

  const short = computed(() => {
    const held = dossier.value
    if (toValue(revealed)) return !held?.reveal
    return (held?.clues.length ?? -1) < toValue(due)
  })
  const retryBeat = computed(() => (short.value ? Math.floor(now.value / RETRY_MS) : 0))

  let asking = false
  watch(
    () => [toValue(round), short.value, retryBeat.value] as const,
    async ([index, wanted]) => {
      if (asking || index === undefined || !wanted) return
      asking = true
      await update({ event: 'fetch-unmask-dossier', round: index }).catch(() => false)
      asking = false
    },
    { immediate: true }
  )

  return dossier
}
