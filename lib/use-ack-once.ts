import { ref } from 'vue'
import { useClientEvents } from '~~/lib/events/client-side'
import type { ClientEventData } from '~~/types/events.types'

/**
 * A one-shot ack button's delivery discipline — the briefing cards' "got it"
 * and the browsable reveals' Continue all press through this: latch on send
 * so a double-tap can't double-spend a critical event, RE-OPEN when delivery
 * fails so a lost ack never strands the seat behind a dead button, and never
 * send from the booth. The latch is UX only — the server handler stays the
 * idempotency authority (ready arrays, the settle latch, the beat stamp),
 * which is what makes a redelivered duplicate harmless.
 *
 * `payload` is a thunk so events with echoes (a turn counter) read them at
 * press time, not at setup.
 */
export const useAckOnce = (payload: () => ClientEventData) => {
  const { gameStore, update } = useClientEvents()
  const sent = ref(false)

  const send = () => {
    if (gameStore.watching || sent.value) return
    sent.value = true
    void update(payload()).then(delivered => {
      if (!delivered) sent.value = false
    })
  }

  return { sent, send }
}
