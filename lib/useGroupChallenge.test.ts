import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive, ref } from 'vue'
import { testCursor } from '~~/lib/events/server/test-seat'
import type { PreviewVerdict } from '~~/store/game.store'
import type { SeatCursor } from '~~/types/seat.types'

/**
 * The group round's mount-time reads: whether its opening card still fronts a
 * clock, the seat-window start it sends, the booth's view of the followed
 * seat's answer, and the subject its previews are tagged with.
 */
const serverNow = ref(0)
const seatCursor = ref<SeatCursor>()
const round = reactive({
  groupChallenge: { _type: 'anthem-buzz-challenge', durationSeconds: 20 },
  groupAnswers: {} as Record<string, { submitted: string[] }>,
  playerTurns: {},
  playStartsAt: undefined as number | undefined,
})
const currentRound = ref({ round })
const map = reactive({ status: undefined as PreviewVerdict | undefined, liveGuesses: [] })
const gameStore = reactive({
  watching: false,
  seatId: 'a',
  spectateHideSpoilers: false,
  game: { players: {} as Record<string, { cursor: SeatCursor }> },
  map,
})
const update = vi.fn(async () => true)
const stub = {
  gameStore,
  update,
  currentRound,
  seatCursor,
  clearBoard: () => {},
  seatEcho: (subject: string) => ({ subject, seq: seatCursor.value?.seq ?? 0 }),
  previewVerdict: (value: PreviewVerdict['value'] | undefined, subject: string) => {
    map.status = value ? { subject, value } : undefined
  },
}

const provided = vi.hoisted(() => new Map<unknown, unknown>())
vi.mock('vue', async importOriginal => ({
  ...(await importOriginal<typeof import('vue')>()),
  provide: vi.fn((key: unknown, value: unknown) => provided.set(key, value)),
  onBeforeUnmount: vi.fn(),
}))

vi.mock('~~/lib/events/client-side', () => ({
  createRedeliver: () => ({
    deliver: (send: () => Promise<boolean>) => send().catch(() => false),
    dispose: () => {},
  }),
  useClientEvents: () => stub,
}))

vi.mock('~~/lib/use-server-now', () => ({
  useServerNow: () => ({ now: serverNow, offset: ref(0) }),
}))

const { useGroupChallenge } = await import('~~/lib/useGroupChallenge')

const mount = () => {
  const scope = effectScope()
  const view = scope.run(() => useGroupChallenge('anthem-buzz-challenge'))!
  return { ...view, unmount: () => scope.stop() }
}

const spentInterstitial = () => [...provided.values()].at(-1)

beforeEach(() => {
  vi.useFakeTimers()
  provided.clear()
  serverNow.value = 1_000_000
  round.playStartsAt = serverNow.value + 6000
  round.groupAnswers = {}
  gameStore.watching = false
  gameStore.spectateHideSpoilers = false
  gameStore.game.players = {}
  map.status = undefined
  update.mockClear()
  seatCursor.value = testCursor('round', { seq: 4 })
})

afterEach(() => vi.useRealTimers())

describe('the opening card', () => {
  it('plays while the round’s clock has yet to start', () => {
    const view = mount()
    expect(view.showInterstitial.value).toBe(true)
    expect(spentInterstitial()).toBe(false)
    view.unmount()
  })

  it('dismisses itself on a remount once the clock is running', () => {
    round.playStartsAt = serverNow.value - 1
    const view = mount()
    expect(spentInterstitial()).toBe(true)
    view.unmount()
  })
})

describe('the seat’s own window', () => {
  it('starts once, on the subject the view mounted on', async () => {
    const view = mount()
    view.startSeatClock()
    view.startSeatClock()
    await nextTick()
    expect(update.mock.calls).toEqual([[{ event: 'round-play', subject: view.subject, seq: 4 }]])
    view.unmount()
  })

  it('never starts from the booth', () => {
    gameStore.watching = true
    const view = mount()
    view.startSeatClock()
    expect(update).not.toHaveBeenCalled()
    view.unmount()
  })
})

describe('previews', () => {
  it('tag the subject the view answered, not whatever the cursor shows now', () => {
    const view = mount()
    seatCursor.value = testCursor('scores', { seq: 5 })
    view.previewVerdict('correct')
    expect(map.status).toEqual({ subject: view.subject, value: 'correct' })
    view.unmount()
  })
})

describe('the booth’s answer', () => {
  it('is the followed seat’s banked answer, and nothing for a racer', () => {
    round.groupAnswers = { a: { submitted: ['SE'] } }
    const racer = mount()
    expect(racer.boothAnswer.value).toBeUndefined()
    racer.unmount()

    gameStore.watching = true
    const booth = mount()
    expect(booth.boothAnswer.value).toEqual({ submitted: ['SE'] })
    booth.unmount()
  })

  it('waits for the whole table under hide-spoilers', () => {
    gameStore.watching = true
    gameStore.spectateHideSpoilers = true
    round.groupAnswers = { a: { submitted: ['SE'] } }
    gameStore.game.players = { b: { cursor: testCursor('round') } }
    const booth = mount()
    expect(booth.boothAnswer.value).toBeUndefined()
    gameStore.game.players = { b: { cursor: testCursor('scores') } }
    expect(booth.boothAnswer.value).toEqual({ submitted: ['SE'] })
    booth.unmount()
  })
})
