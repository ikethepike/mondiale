import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive, ref } from 'vue'
import { testCursor } from '~~/lib/events/server/test-seat'
import { gateClockDeadline, gateDeadline, gateVerdictLeadMs } from '~~/lib/gate-timing'
import { GATE_RESULT_HOLD_MS, INTERSTITIAL_TOTAL_MS } from '~~/lib/round-beats'
import { seatSubject } from '~~/lib/seat-transitions'
import type { SeatCursor, SeatVerdict } from '~~/types/seat.types'
import type { PreviewVerdict } from '~~/store/game.store'

/**
 * The gate shell's hold on its gate, which is what keeps a still-mounted
 * ViewIndividualChallenge from stranding a verdict.
 *
 * The freeze it guards against: a win's leap can land the pawn at (or past) the
 * next gate's stop tile, so the next gate arrives while the answered one is
 * still on screen. The shell is keyed on the gate's subject — it latches its
 * gate at mount, reads its verdict and hold off the seat cursor for THAT
 * subject only, and lets go the moment the cursor names another subject.
 */
const serverNow = ref(0)
const seatCursor = ref<SeatCursor>()
const currentMove = ref<unknown>()
const map = reactive({
  status: undefined as PreviewVerdict | undefined,
  reveal: undefined as string | undefined,
  highlighted: new Set<string>(),
})
const gameStore = reactive({
  watching: false,
  game: undefined,
  map,
  get previewStatus() {
    const preview = map.status
    return preview && preview.subject === seatCursor.value?.subject ? preview.value : undefined
  },
})
const update = vi.fn(async () => true)
const stub = {
  currentMove,
  gameStore,
  seatCursor,
  update,
  seatEcho: (subject: string) => ({ subject, seq: seatCursor.value?.seq ?? 0 }),
  previewVerdict: (value: PreviewVerdict['value'] | undefined) => {
    const subject = seatCursor.value?.subject
    map.status = value && subject ? { subject, value } : undefined
  },
}

// The shell runs in a bare effect scope, not a component: provide() has no
// instance to attach to, so the context is handed straight to inject().
const shellContext = vi.hoisted(() => ({ value: undefined as unknown }))
vi.mock('vue', async importOriginal => ({
  ...(await importOriginal<typeof import('vue')>()),
  provide: vi.fn((_key: unknown, value: unknown) => (shellContext.value = value)),
  inject: vi.fn(() => shellContext.value),
}))

vi.mock('~~/lib/events/client-side', () => ({
  REDELIVER_MAX_BATCHES: 15,
  REDELIVER_PAUSE_MS: 4000,
  // The real loop shape, minus pacing detail the shell tests don't assert.
  createRedeliver: () => ({
    deliver: (send: () => Promise<boolean>) => send().catch(() => false),
    dispose: () => {},
  }),
  useClientEvents: () => stub,
}))

vi.mock('~~/lib/use-server-now', () => ({
  useServerNow: () => ({ now: serverNow, offset: ref(0) }),
}))

const { provideGateChallenge, useGateClock } = await import('~~/lib/use-gate-challenge')

const gate = (
  position: number,
  country: 'FI' | 'PE' | 'SE',
  variant = 'rosetta',
  extra: Record<string, unknown> = {}
) => ({
  endTile: { position, type: 'flag' },
  challenge: { _type: 'individual-challenge', id: 'isoCode', country, variant, ...extra },
})

const RULING = { partyLogo: { image: '', name: '', ask: 'ruling' } }

const FIRST = seatSubject.gate(1, 5)
const NEXT = seatSubject.gate(1, 8)

const onGate = (subject: string, seq: number, variant = 'rosetta'): SeatCursor =>
  testCursor('gate', {
    subject,
    seq,
    enteredAt: serverNow.value,
    deadline: gateDeadline({ variant } as never, serverNow.value),
  })

const gateVerdict = (
  subject: string,
  correct: boolean,
  seq: number,
  timedOut = false
): SeatCursor => {
  const verdict: SeatVerdict = {
    kind: 'gate',
    subject,
    correct,
    timedOut,
    submitted: correct ? 'FI' : 'SE',
    steps: correct ? 3 : 0,
    browsable: false,
  }
  return testCursor('gate-verdict', {
    subject,
    seq,
    enteredAt: serverNow.value,
    holdUntil: serverNow.value + GATE_RESULT_HOLD_MS,
    verdict,
  })
}

/** The shell, mounted in its own scope so unmount is a real teardown. */
const mountShell = () => {
  const scope = effectScope()
  const shell = scope.run(() => provideGateChallenge())!
  return { ...shell, unmount: () => scope.stop() }
}

/** The shell with a variant's clock riding it, as a timed `Gate*` mounts one. */
const mountClock = () => {
  const onExpire = vi.fn()
  const scope = effectScope()
  const shell = scope.run(() => {
    const context = provideGateChallenge()
    return { ...context, clock: useGateClock({ onExpire }) }
  })!
  return { ...shell, onExpire, unmount: () => scope.stop() }
}

const roundPlays = () =>
  (update.mock.calls as unknown as [{ event: string }][]).filter(
    ([payload]) => payload.event === 'round-play'
  )

beforeEach(() => {
  vi.useFakeTimers()
  serverNow.value = 1_000_000
  map.status = undefined
  map.reveal = undefined
  map.highlighted.clear()
  gameStore.watching = false
  update.mockClear()
  currentMove.value = gate(5, 'FI')
  seatCursor.value = onGate(FIRST, 10)
})

afterEach(() => vi.useRealTimers())

describe('the gate shell holds exactly its own gate', () => {
  it('latches the head gate at mount; the next gate is a fresh mount, interstitial and all', () => {
    const first = mountShell()
    expect(first.challenge.value?.country).toBe('FI')
    expect(first.subject).toBe(FIRST)
    expect(first.showInterstitial.value).toBe(true)

    currentMove.value = gate(8, 'PE')
    expect(first.challenge.value?.country).toBe('FI')
    first.unmount()

    seatCursor.value = onGate(NEXT, 11)
    const next = mountShell()
    expect(next.challenge.value?.country).toBe('PE')
    expect(next.subject).toBe(NEXT)
    expect(next.showInterstitial.value).toBe(true)
    expect(next.status.value).toBeUndefined()
    next.unmount()
  })

  it('never re-arms for a fresh snapshot identity of the SAME gate', () => {
    // Every full broadcast rebuilds the blob — same gate, new objects. A
    // rejoin's resync (or another seat's cap settling) mid-answer must not
    // replay the interstitial or swap the gate under the variant component.
    const { challenge, showInterstitial, subject, deadline, unmount } = mountShell()
    showInterstitial.value = false
    const before = challenge.value

    currentMove.value = gate(5, 'FI')
    seatCursor.value = { ...seatCursor.value! }

    expect(showInterstitial.value).toBe(false)
    expect(challenge.value).toBe(before)
    expect(subject).toBe(FIRST)
    expect(deadline.value).toBe(seatCursor.value.deadline)
    unmount()
  })

  it('never replays the interstitial on a remount mid-verdict, nor in the booth', () => {
    seatCursor.value = gateVerdict(FIRST, true, 11)
    const midHold = mountShell()
    expect(midHold.showInterstitial.value).toBe(false)
    expect(midHold.status.value).toBe('correct')
    midHold.unmount()

    seatCursor.value = onGate(FIRST, 10)
    gameStore.watching = true
    const booth = mountShell()
    expect(booth.showInterstitial.value).toBe(false)
    booth.unmount()
  })

  it('reads the verdict and its hold off the cursor, then lets go when the next gate arrives', async () => {
    const { challenge, status, holdUntil, submittedISOCode, unmount } = mountShell()

    seatCursor.value = gateVerdict(FIRST, true, 11)
    await nextTick()
    expect(status.value).toBe('correct')
    expect(submittedISOCode.value).toBe('FI')
    expect(holdUntil.value).toBe(serverNow.value + GATE_RESULT_HOLD_MS)
    expect(map.reveal).toBe('FI')

    // The leap covered the walk to the next gate: no walk step ever names a
    // board subject in between, so the cursor alone must clear this shell.
    currentMove.value = gate(8, 'PE')
    seatCursor.value = onGate(NEXT, 12)

    expect(challenge.value?.country).toBe('FI')
    expect(status.value).toBeUndefined()
    expect(holdUntil.value).toBeUndefined()
    unmount()
  })

  it('ends the beat when the answered gate was the players last move', () => {
    const { status, holdUntil, submitAnswer, unmount } = mountShell()

    submitAnswer('SE')
    seatCursor.value = gateVerdict(FIRST, false, 11)
    expect(status.value).toBe('incorrect')

    // No next gate: the hold ends on the board, not on another gate.
    currentMove.value = undefined
    seatCursor.value = testCursor('settled', { seq: 12 })

    expect(status.value).toBeUndefined()
    expect(holdUntil.value).toBeUndefined()
    unmount()
  })

  it('shows the answer at once, before any snapshot arrives, and sends it for this gate', () => {
    const { status, submitAnswer, submittedISOCode, holdUntil, unmount } = mountShell()

    submitAnswer('SE')

    expect(status.value).toBe('incorrect')
    expect(submittedISOCode.value).toBe('SE')
    expect(holdUntil.value).toBeUndefined()
    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'submit-individual-challenge-answer',
        isoCode: 'SE',
        subject: FIRST,
        seq: 10,
      })
    )

    submitAnswer('FI')
    expect(update).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('holds the verdict for ONE beat, not two — the server’s stamp, never restarted', () => {
    const { submitAnswer, holdUntil, unmount } = mountShell()

    // The beat starts at the server's verdict. A next gate arriving mid-hold
    // (as a move, before the cursor moves) must not restart the clock — that
    // double-hold parked the verdict for ~10.75s.
    submitAnswer('SE')
    seatCursor.value = gateVerdict(FIRST, false, 11)
    const stamped = holdUntil.value

    serverNow.value += GATE_RESULT_HOLD_MS - 1
    currentMove.value = gate(8, 'PE')

    expect(stamped).toBe(seatCursor.value.holdUntil)
    expect(holdUntil.value).toBe(stamped)
    unmount()
  })

  it('arms no local timer for the beat — the server’s hold is the only exit', async () => {
    const { submitAnswer, unmount } = mountShell()

    submitAnswer('SE')
    seatCursor.value = gateVerdict(FIRST, false, 11)
    await vi.advanceTimersByTimeAsync(GATE_RESULT_HOLD_MS * 2)
    expect(vi.getTimerCount()).toBe(0)

    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('swaps to the result card only after the variant’s lead, counted from the grade', async () => {
    const ruling = gate(5, 'FI', 'logo-politics', RULING)
    currentMove.value = ruling
    const lead = gateVerdictLeadMs(ruling.challenge as never)
    expect(lead).toBeGreaterThan(0)
    const { status, verdictShown, submitAnswer, unmount } = mountShell()

    submitAnswer('SE')
    await nextTick()
    expect(status.value).toBe('incorrect')
    expect(verdictShown.value).toBe(false)

    serverNow.value += lead - 1
    expect(verdictShown.value).toBe(false)
    serverNow.value += 1
    expect(verdictShown.value).toBe(true)
    unmount()
  })
})

describe('the opening card fronts the gate’s clock', () => {
  it('a remount once the clock has started skips the card', () => {
    seatCursor.value = testCursor('gate', {
      subject: FIRST,
      seq: 10,
      enteredAt: serverNow.value - INTERSTITIAL_TOTAL_MS,
      deadline: gateDeadline({ variant: 'rosetta' }, serverNow.value - INTERSTITIAL_TOTAL_MS),
    })
    const late = mountShell()
    expect(late.showInterstitial.value).toBe(false)
    late.unmount()

    seatCursor.value = testCursor('gate', {
      subject: FIRST,
      seq: 11,
      enteredAt: serverNow.value - 900,
      deadline: gateClockDeadline({ variant: 'rosetta' }, serverNow.value - 100),
    })
    const tapped = mountShell()
    expect(tapped.showInterstitial.value).toBe(false)
    tapped.unmount()
  })

  it('dismissing the card starts a timed gate’s clock on the server, once', async () => {
    const { showInterstitial, unmount } = mountShell()
    showInterstitial.value = false
    await nextTick()
    showInterstitial.value = true
    await nextTick()
    showInterstitial.value = false
    await nextTick()
    expect(roundPlays()).toEqual([[{ event: 'round-play', subject: FIRST, seq: 10 }]])
    unmount()
  })

  it('an untimed gate and the booth start nothing', async () => {
    currentMove.value = gate(5, 'FI', 'find')
    seatCursor.value = onGate(FIRST, 10, 'find')
    const untimed = mountShell()
    untimed.showInterstitial.value = false
    await nextTick()
    untimed.unmount()

    currentMove.value = gate(5, 'FI')
    seatCursor.value = onGate(FIRST, 10)
    gameStore.watching = true
    const booth = mountShell()
    booth.showInterstitial.value = false
    await nextTick()
    booth.unmount()
    expect(roundPlays()).toEqual([])
  })
})

describe('the gate clock’s expiry runs once, whichever end sees it first', () => {
  it('a gate mounting on a spent clock expires at once', () => {
    seatCursor.value = testCursor('gate', {
      subject: FIRST,
      seq: 10,
      deadline: serverNow.value - 1,
    })
    const { onExpire, unmount } = mountClock()
    expect(onExpire).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('a server timeout verdict landing first still runs the cleanup', async () => {
    const { onExpire, unmount } = mountClock()
    expect(onExpire).not.toHaveBeenCalled()
    seatCursor.value = gateVerdict(FIRST, false, 11, true)
    await nextTick()
    expect(onExpire).toHaveBeenCalledTimes(1)

    serverNow.value += 60_000
    await nextTick()
    expect(onExpire).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('a local expiry followed by the timeout verdict cleans up once', async () => {
    const { onExpire, unmount } = mountClock()
    serverNow.value = seatCursor.value!.deadline! + 1
    await nextTick()
    expect(onExpire).toHaveBeenCalledTimes(1)

    seatCursor.value = gateVerdict(FIRST, false, 11, true)
    await nextTick()
    expect(onExpire).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('an answered gate never expires', async () => {
    const { submitAnswer, onExpire, unmount } = mountClock()
    submitAnswer('SE')
    serverNow.value = seatCursor.value!.deadline! + 1
    await nextTick()
    expect(onExpire).not.toHaveBeenCalled()
    unmount()
  })
})

describe('the verdict lead', () => {
  it('a timeout shows the result card at once — there is no wash to read', async () => {
    currentMove.value = gate(5, 'FI', 'logo-politics', RULING)
    seatCursor.value = onGate(FIRST, 10, 'logo-politics')
    const { verdictShown, unmount } = mountShell()
    seatCursor.value = gateVerdict(FIRST, false, 11, true)
    await nextTick()
    expect(verdictShown.value).toBe(true)
    unmount()
  })

  it('an origin question shows it at once too', async () => {
    currentMove.value = gate(5, 'FI', 'logo-politics', {
      partyLogo: { image: '', name: '', ask: 'origin' },
    })
    seatCursor.value = onGate(FIRST, 10, 'logo-politics')
    const { verdictShown, submitAnswer, unmount } = mountShell()
    submitAnswer('SE')
    await nextTick()
    expect(verdictShown.value).toBe(true)
    unmount()
  })
})
