import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { GATE_RESULT_HOLD_MS, GATE_RESULT_WIRE_GRACE_MS } from '~~/lib/events/server/turn-timing'

/**
 * The gate shell's relatch, which is the only thing that hands a still-mounted
 * ViewIndividualChallenge its NEXT gate.
 *
 * The freeze it guards against: a win's leap can land the pawn at (or past) the
 * next gate's stop tile, and then the server has nothing to walk — it settles
 * straight back into 'individual-challenge'. No phase change, no unmount, so
 * the result beat's `status` never clears on its own. A relatch that merely
 * DROPPED the arrival left the shell showing the answered gate's verdict for
 * the rest of the game while the server waited on the next gate.
 */
const stub = vi.hoisted(() => {
  const map: { status?: 'correct' | 'incorrect'; reveal?: string; highlighted: Set<string> } = {
    status: undefined,
    reveal: undefined,
    highlighted: new Set(),
  }
  return {
    currentMove: { value: undefined as unknown },
    gameStore: { watching: false, game: undefined, map },
    update: vi.fn(async () => true),
    clearBoard: vi.fn(() => {
      map.status = undefined
      map.reveal = undefined
      map.highlighted.clear()
    }),
  }
})

vi.mock('~~/lib/events/client-side', () => ({
  REDELIVER_MAX_BATCHES: 15,
  REDELIVER_PAUSE_MS: 4000,
  useClientEvents: () => stub,
}))

const { provideGateChallenge } = await import('~~/lib/use-gate-challenge')

const gate = (position: number, country: 'FI' | 'PE') => ({
  endTile: { position, type: 'flag' },
  challenge: { _type: 'individual-challenge', id: 'isoCode', country, variant: 'rosetta' },
})

/** The shell, mounted in its own scope so unmount is a real teardown. */
const mountShell = () => {
  const scope = effectScope()
  const shell = scope.run(() => provideGateChallenge())!
  return { ...shell, unmount: () => scope.stop() }
}

beforeEach(() => {
  vi.useFakeTimers()
  stub.gameStore.map.status = undefined
  stub.currentMove.value = gate(5, 'FI')
})

afterEach(() => vi.useRealTimers())

describe('the gate shell relatches its next gate', () => {
  it('swaps immediately when no result beat is on screen', () => {
    const { challenge, gateSeq, relatch, unmount } = mountShell()
    expect(challenge.value?.country).toBe('FI')

    stub.currentMove.value = gate(8, 'PE')
    relatch()

    expect(challenge.value?.country).toBe('PE')
    expect(gateSeq.value).toBe(1)
    unmount()
  })

  it('holds the beat, then takes the arrival the walk never came to collect', async () => {
    const { challenge, gateSeq, status, showInterstitial, relatch, unmount } = mountShell()

    // Answered: the verdict is on screen, and the server has already shifted
    // the answered move off — so the next gate arrives at once, mid-beat.
    stub.gameStore.map.status = 'correct'
    showInterstitial.value = false
    stub.currentMove.value = gate(8, 'PE')
    relatch()

    expect(challenge.value?.country).toBe('FI')
    expect(status.value).toBe('correct')

    // The leap covered the walk to gate 8, so no phase change ever unmounts
    // this shell. The beat's own hold has to end it.
    await vi.advanceTimersByTimeAsync(GATE_RESULT_HOLD_MS + GATE_RESULT_WIRE_GRACE_MS + 10)

    expect(challenge.value?.country).toBe('PE')
    expect(status.value).toBeUndefined()
    expect(gateSeq.value).toBe(1)
    expect(showInterstitial.value).toBe(true)
    unmount()
  })

  it('leaves no timer behind when the walk does unmount the shell', async () => {
    const { relatch, unmount } = mountShell()

    stub.gameStore.map.status = 'correct'
    stub.currentMove.value = gate(8, 'PE')
    relatch()
    unmount()

    await vi.advanceTimersByTimeAsync(GATE_RESULT_HOLD_MS + GATE_RESULT_WIRE_GRACE_MS + 10)
    expect(vi.getTimerCount()).toBe(0)
  })
})
