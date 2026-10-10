import { onScopeDispose } from 'vue'
import { createRedeliver, useClientEvents } from '~~/lib/events/client-side'

/**
 * Starts this seat's own clock on a subject (`round-play`): an audio play tap,
 * Empire's tap beat, a gate's or the gauntlet's opening card dismissed. Once
 * per subject, kept alive past `update`'s ack batch by the one redeliver home —
 * the server only ever pulls a deadline in, so a late repeat changes nothing.
 */
export const useSeatClockStart = () => {
  const { gameStore, update, seatEcho } = useClientEvents()
  const redeliver = createRedeliver('seat clock')
  onScopeDispose(() => redeliver.dispose())
  const started = new Set<string>()
  return (subject: string) => {
    if (gameStore.watching || !subject || started.has(subject)) return
    started.add(subject)
    void redeliver.deliver(() => update({ event: 'round-play', ...seatEcho(subject) }))
  }
}
