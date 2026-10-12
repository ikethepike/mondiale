import { onScopeDispose } from 'vue'
import { createRedeliver, useClientEvents } from '~~/lib/events/client-side'

/**
 * Records a fact on this seat's cursor for one subject — a hint bought
 * (`buy-hint`), a gauntlet stage's name taken (`final-light`) — once per
 * value, kept alive past `update`'s ack batch by the one redeliver home. The
 * server's record is what the grade reads; the view only shows it.
 */
export const useSeatRecord = () => {
  const { gameStore, update, seatEcho } = useClientEvents()
  const redeliver = createRedeliver('seat record')
  onScopeDispose(() => redeliver.dispose())
  const sent = new Set<string>()
  const once = (subject: string, key: string, send: () => Promise<boolean>) => {
    if (gameStore.watching || !subject || sent.has(`${subject}|${key}`)) return
    sent.add(`${subject}|${key}`)
    void redeliver.deliver(send)
  }
  return {
    buyHint: (subject: string, hint: string) =>
      once(subject, `hint|${hint}`, () =>
        update({ event: 'buy-hint', hint, ...seatEcho(subject) })
      ),
    lightFinal: (subject: string, name: string) =>
      once(subject, `light|${name}`, () =>
        update({ event: 'final-light', name, ...seatEcho(subject) })
      ),
  }
}

/** A gauntlet stage's `final-light`, on the subject the stage mounted on. */
export const useFinalLight = () => {
  const { seatCursor } = useClientEvents()
  const subject = seatCursor.value?.subject ?? ''
  const { lightFinal } = useSeatRecord()
  return (name: string) => lightFinal(subject, name)
}
