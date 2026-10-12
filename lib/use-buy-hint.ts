import { onScopeDispose } from 'vue'
import { createRedeliver, useClientEvents } from '~~/lib/events/client-side'

/**
 * Records a bought hint on this seat's subject (`buy-hint`), once per hint,
 * kept alive past `update`'s ack batch by the one redeliver home. The server's
 * record is what docks the pay; the view only shows the hint.
 */
export const useBuyHint = () => {
  const { gameStore, update, seatEcho } = useClientEvents()
  const redeliver = createRedeliver('hint purchase')
  onScopeDispose(() => redeliver.dispose())
  const bought = new Set<string>()
  return (subject: string, hint: string) => {
    const key = `${subject}|${hint}`
    if (gameStore.watching || !subject || bought.has(key)) return
    bought.add(key)
    void redeliver.deliver(() => update({ event: 'buy-hint', hint, ...seatEcho(subject) }))
  }
}
