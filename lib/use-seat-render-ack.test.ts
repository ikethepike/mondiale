import { effectScope, nextTick, ref, shallowRef } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { testCursor, testSeat } from '~~/lib/events/server/test-seat'
import type { Player } from '~~/types/player.type'

const sent: unknown[] = []
const listeners = new Map<string, Set<() => void>>()
const fakeSocket = {
  on: (event: string, fn: () => void) => {
    listeners.set(event, (listeners.get(event) ?? new Set()).add(fn))
  },
  off: (event: string, fn: () => void) => listeners.get(event)?.delete(fn),
}
const socket = shallowRef<typeof fakeSocket | undefined>(fakeSocket)

vi.mock('~~/lib/events/client-side', () => ({
  useClientEvents: () => ({
    update: async (data: unknown) => {
      sent.push(data)
      return true
    },
    _instance: socket,
  }),
}))

const { useSeatRenderAck } = await import('./use-seat-render-ack')

const joined = () => listeners.get('player-joined')?.forEach(fn => fn())

describe('useSeatRenderAck', () => {
  afterEach(() => {
    sent.length = 0
    listeners.clear()
  })

  const mount = (seat: { value: Player }, key: { value: string | undefined }) => {
    const scope = effectScope()
    scope.run(() =>
      useSeatRenderAck(
        () => seat.value,
        () => key.value
      )
    )
    return scope
  }

  it('acks a mounted view once, and again after a rejoin rebinds the socket', async () => {
    const seat = ref(testSeat('a', 'round'))
    const key = ref<string | undefined>('round:round:0')
    const scope = mount(seat, key)
    await nextTick()
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ event: 'seat-rendered', seatId: 'a', subject: 'round:0' })

    joined()
    expect(sent).toHaveLength(2)
    expect(sent[1]).toEqual(sent[0])
    scope.stop()
  })

  it('re-sends the latest screen, never an earlier one', async () => {
    const seat = ref(testSeat('a', 'round'))
    const key = ref<string | undefined>('round:round:0')
    const scope = mount(seat, key)
    await nextTick()
    seat.value = { ...seat.value, cursor: testCursor('scores', { seq: 2, deadline: 1 }) }
    key.value = 'scores:scores:0'
    await nextTick()
    joined()
    expect(sent.at(-1)).toMatchObject({ step: 'scores', seq: 2, view: 'scores:scores:0' })
    scope.stop()
  })

  it('stops listening when its view goes away', async () => {
    const seat = ref(testSeat('a', 'round'))
    const key = ref<string | undefined>('round:round:0')
    mount(seat, key).stop()
    await nextTick()
    const before = sent.length
    joined()
    expect(sent).toHaveLength(before)
  })
})
