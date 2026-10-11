import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue'
import { useClientEvents } from '~~/lib/events/client-side'
import { BERTH_GAP_PX, claimMapBerth } from '~~/lib/map-berth'

/**
 * The header-side sibling of `useFooterBerth`: reserve the band down to the
 * prompt's bottom edge, so a subject framed edge to edge on the vertical axis
 * never stands under the title pills. `active` drops the claim — a reveal
 * that reframes to its own subject, a briefing with no prompt on screen.
 */
export const usePromptBerth = (
  prompt: Ref<HTMLElement | undefined>,
  active: () => boolean = () => true,
  key = 'prompt'
) => {
  const { gameStore } = useClientEvents()
  let closed = false
  let observer: ResizeObserver | undefined

  const reserve = () =>
    nextTick(() => {
      if (closed) return
      const bottom = prompt.value?.getBoundingClientRect().bottom
      claimMapBerth(
        gameStore,
        key,
        bottom && active() ? { top: Math.round(bottom) + BERTH_GAP_PX } : undefined
      )
    })

  watch(
    [prompt, active],
    ([element]) => {
      observer?.disconnect()
      observer = undefined
      reserve()
      if (!element) return
      observer = new ResizeObserver(reserve)
      observer.observe(element)
    },
    { immediate: true }
  )

  onBeforeUnmount(() => {
    closed = true
    observer?.disconnect()
    claimMapBerth(gameStore, key, undefined)
  })
}
