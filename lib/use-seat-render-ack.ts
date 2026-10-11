import { onScopeDispose, ref, shallowRef, watch } from 'vue'
import { seatViewKey } from '~~/lib/seat-view'
import { useClientEvents } from '~~/lib/events/client-side'
import type { ClientEventData } from '~~/types/events.types'
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
  const { update, _instance: socket } = useClientEvents()
  const rendered = shallowRef<RenderedCursor>()
  let lastAck: Extract<ClientEventData, { event: 'seat-rendered' }> | undefined
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
      lastAck = { event: 'seat-rendered', seatId: current.id, seq, step, subject, view: key }
      void update(lastAck)
    },
    { immediate: true, flush: 'post' }
  )

  // An ack buffered across a disconnect flushes on reconnect BEFORE the
  // socket is bound again and is refused; a join's broadcast comes after the
  // binding, so the screen is acked once more then.
  const resend = () => lastAck && void update(lastAck)
  watch(
    socket,
    (next, previous) => {
      previous?.off('player-joined', resend)
      next?.on('player-joined', resend)
    },
    { immediate: true }
  )
  onScopeDispose(() => socket.value?.off('player-joined', resend))

  return { rendered }
}
