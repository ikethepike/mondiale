import { onScopeDispose, ref, shallowRef, watch } from 'vue'
import { seatViewKey } from '~~/lib/seat-view'
import { useClientEvents } from '~~/lib/events/client-side'
import type { Player } from '~~/types/player.type'
import type { SeatStep } from '~~/types/seat.types'

export interface RenderedCursor {
  seat: string
  seq: number
  step: SeatStep
  subject: string
}

/**
 * Tell the server what this viewer actually has on screen: once the view for
 * a seat's cursor is mounted (its enter transition finished), every change of
 * step or subject is acked with `seat-rendered`. Walk steps on one subject are
 * progress, not a new screen, and are not acked. The server's auditor flags a
 * seat whose own player never catches up. A hidden tab runs no transitions and
 * shows nothing to lag behind: it acks the view its cursor names.
 */
export const useSeatRenderAck = (
  seat: () => Player | undefined,
  mountedKey: () => string | undefined
) => {
  const { update } = useClientEvents()
  const rendered = shallowRef<RenderedCursor>()
  const hidden = ref(typeof document !== 'undefined' && document.hidden)
  if (typeof document !== 'undefined') {
    const sync = () => (hidden.value = document.hidden)
    document.addEventListener('visibilitychange', sync)
    onScopeDispose(() => document.removeEventListener('visibilitychange', sync))
  }
  const shownKey = (current: Player | undefined) =>
    mountedKey() ?? (hidden.value && current?.cursor ? seatViewKey(current.cursor) : undefined)

  watch(
    () => {
      const current = seat()
      const key = shownKey(current)
      if (!current?.cursor || !key || seatViewKey(current.cursor) !== key) return undefined
      return `${current.id}|${current.cursor.step}|${current.cursor.subject}|${key}`
    },
    identity => {
      const current = seat()
      const key = shownKey(current)
      if (!identity || !current || !key) return
      const { seq, step, subject } = current.cursor
      rendered.value = { seat: current.id, seq, step, subject }
      void update({ event: 'seat-rendered', seatId: current.id, seq, step, subject, view: key })
    },
    { immediate: true, flush: 'post' }
  )

  return { rendered }
}
