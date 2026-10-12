import { computed, onScopeDispose } from 'vue'
import { createRedeliver, useClientEvents } from '~~/lib/events/client-side'

/**
 * Records a fact on this seat's cursor for one subject — a hint bought
 * (`buy-hint`), an option spent (`spend-pick`), a gauntlet stage's name taken
 * (`final-light`) — once per
 * value, kept alive past `update`'s ack batch by the one redeliver home. The
 * server's record is what the grade reads; the view only shows it.
 */
export const useSeatRecord = () => {
  const { gameStore, update, seatEcho } = useClientEvents()
  const redeliver = createRedeliver('seat record')
  onScopeDispose(() => redeliver.dispose())
  const sent = new Map<string, Promise<boolean>>()
  /** Resolves true once the server holds the record; a repeat shares the first. */
  const once = (subject: string, key: string, send: () => Promise<boolean>) => {
    if (gameStore.watching || !subject) return Promise.resolve(false)
    const id = `${subject}|${key}`
    const held = sent.get(id)
    if (held) return held
    const pending = redeliver.deliver(send).then(delivered => {
      if (!delivered) sent.delete(id)
      return delivered
    })
    sent.set(id, pending)
    return pending
  }
  return {
    buyHint: (subject: string, hint: string) =>
      once(subject, `hint|${hint}`, () =>
        update({ event: 'buy-hint', hint, ...seatEcho(subject) })
      ),
    spendPick: (subject: string, pick: string) =>
      once(subject, `pick|${pick}`, () =>
        update({ event: 'spend-pick', pick, ...seatEcho(subject) })
      ),
    lightFinal: (subject: string, name: string) =>
      once(subject, `light|${name}`, () =>
        update({ event: 'final-light', name, ...seatEcho(subject) })
      ),
  }
}

/**
 * A gauntlet stage's `final-light`, on the subject the stage mounted on, and
 * the names the server refused there (too late) for the stage to un-light.
 */
export const useFinalLight = () => {
  const { seatCursor, gameStore } = useClientEvents()
  const subject = seatCursor.value?.subject ?? ''
  const { lightFinal } = useSeatRecord()
  return {
    light: (name: string) => lightFinal(subject, name),
    refused: computed(() => gameStore.refusedLights[subject] ?? []),
  }
}
