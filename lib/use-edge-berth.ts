import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue'
import { useClientEvents } from '~~/lib/events/client-side'
import { BERTH_GAP_PX, claimMapBerth, type Berth } from '~~/lib/map-berth'

/**
 * Reserve the band from one screen edge to the far side of an element, so the
 * camera frames its subject clear of it: the prompt from the top, a side
 * panel from the left or right. `active` drops the claim.
 */
export const useEdgeBerth = (
  element: Ref<HTMLElement | undefined>,
  edge: keyof Berth,
  active: () => boolean = () => true,
  key: string = edge
) => {
  const { gameStore } = useClientEvents()
  let closed = false
  let observer: ResizeObserver | undefined

  const reach = (rect: DOMRect) => {
    const root = document.documentElement
    switch (edge) {
      case 'top':
        return rect.bottom
      case 'bottom':
        return root.clientHeight - rect.top
      case 'left':
        return rect.right
      case 'right':
        return root.clientWidth - rect.left
    }
  }

  const reserve = () =>
    nextTick(() => {
      if (closed) return
      const rect = element.value?.getBoundingClientRect()
      const extent = rect?.width && rect.height ? reach(rect) : 0
      claimMapBerth(
        gameStore,
        key,
        extent > 0 && active() ? { [edge]: Math.round(extent) + BERTH_GAP_PX } : undefined
      )
    })

  watch(
    [element, active],
    ([target]) => {
      observer?.disconnect()
      observer = undefined
      reserve()
      if (!target) return
      observer = new ResizeObserver(reserve)
      observer.observe(target)
    },
    { immediate: true }
  )

  onBeforeUnmount(() => {
    closed = true
    observer?.disconnect()
    claimMapBerth(gameStore, key, undefined)
  })
}
