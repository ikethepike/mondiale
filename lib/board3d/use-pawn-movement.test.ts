import { gsap } from 'gsap'
import { Vector3 } from 'three'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPawnMover, type PawnTraceEntry } from './use-pawn-movement'
import type { TileTransform } from './path'

/**
 * The board must only ever animate the walk a pawn has LEFT. These drive the
 * mover directly and read its trace seam — the same one the pawn-replay e2e
 * uses — so the invariant is pinned without a canvas.
 */

// A straight line of tiles is enough: only the tile INDEX matters here.
const tileFor = (index: number): TileTransform | undefined =>
  index >= 0 && index < 40
    ? { position: new Vector3(index, 0, 0), tangent: new Vector3(1, 0, 0) }
    : undefined

/** Minimal stand-in for a pawn Group — the mover only touches these. */
const stubPawn = () => ({
  position: {
    x: 0,
    y: 0,
    z: 0,
    set(x: number, y: number, z: number) {
      this.x = x
      this.y = y
      this.z = z
    },
  },
  scale: {
    x: 1,
    y: 1,
    z: 1,
    setScalar(v: number) {
      this.x = v
      this.y = v
      this.z = v
    },
    set(x: number, y: number, z: number) {
      this.x = x
      this.y = y
      this.z = z
    },
  },
})

const PLAYER = 'p1'

const traceSink = () => (globalThis as { __pawnTrace?: PawnTraceEntry[] }).__pawnTrace ?? []
const resetTrace = () => {
  ;(globalThis as { __pawnTrace?: PawnTraceEntry[] }).__pawnTrace = []
}
/** Tiles the mover actually animated onto, in order. */
const hoppedTiles = () =>
  traceSink()
    .filter(entry => entry.fn === 'hop')
    .map(entry => entry.to)

const moverFor = (options: { pressTowardFor?: (playerId: string) => number | undefined } = {}) => {
  const pawn = stubPawn()
  const mover = createPawnMover({
    pawnFor: () => pawn as never,
    tileFor,
    pressTowardFor: options.pressTowardFor,
    slotRadius: 1,
    hopHeight: 1,
  })
  return { mover, pawn }
}

/**
 * Run gsap forward far enough to drain any queued hops. Bare node has no rAF,
 * so ticking does nothing — driving the global timeline is what advances
 * tweens here. Hops chain (each onComplete starts the next), so step the clock
 * repeatedly rather than jumping once.
 */
let clock = 0
const drainHops = () => {
  for (let step = 0; step < 200; step++) {
    clock += 0.05
    gsap.globalTimeline.totalTime(clock)
  }
}

beforeEach(() => {
  resetTrace()
})

afterEach(() => {
  delete (globalThis as { __pawnTrace?: PawnTraceEntry[] }).__pawnTrace
})

describe('moveTo', () => {
  it('replays owed movement one visible hop per tile, in order', () => {
    const { mover } = moverFor()
    mover.place(PLAYER, 3)

    // The sync-on-show pass: steps banked while the stage was hidden.
    resetTrace()
    mover.moveTo(PLAYER, 6)
    drainHops()

    expect(hoppedTiles()).toEqual([4, 5, 6])
    mover.dispose()
  })

  it('is idempotent against the committed destination', () => {
    const { mover } = moverFor()
    mover.place(PLAYER, 5)

    resetTrace()
    mover.moveTo(PLAYER, 5)
    drainHops()

    expect(hoppedTiles()).toEqual([])
    mover.dispose()
  })

  it('snaps rather than replaying an over-long backlog', () => {
    const { mover } = moverFor()
    mover.place(PLAYER, 2)

    // A gap this size is a reconnect after a long absence, not owed movement.
    resetTrace()
    mover.moveTo(PLAYER, 30)
    drainHops()

    expect(hoppedTiles()).toEqual([])
    const placed = traceSink().filter(entry => entry.fn === 'place')
    expect(placed[placed.length - 1]?.to).toBe(30)
    mover.dispose()
  })

  it('plays the live bounce off a failed gate as a single backward hop', () => {
    const { mover } = moverFor()
    mover.place(PLAYER, 5)

    resetTrace()
    mover.moveTo(PLAYER, 4)
    drainHops()

    expect(hoppedTiles()).toEqual([4])
    mover.dispose()
  })

  it('treats a deep backward jump as a reset and snaps', () => {
    const { mover } = moverFor()
    mover.place(PLAYER, 20)

    resetTrace()
    mover.moveTo(PLAYER, 3)
    drainHops()

    expect(hoppedTiles()).toEqual([])
    const placed = traceSink().filter(entry => entry.fn === 'place')
    expect(placed[placed.length - 1]?.to).toBe(3)
    mover.dispose()
  })
})

describe('press-in', () => {
  it('rests a blocked pawn nudged toward its gate, never on it', () => {
    const { mover, pawn } = moverFor({ pressTowardFor: () => 6 })
    mover.place(PLAYER, 5)
    drainHops()

    // Tiles sit 1 apart on x here: pressed past the stop tile's centre but
    // clearly short of the gate's.
    expect(pawn.position.x).toBeGreaterThan(5)
    expect(pawn.position.x).toBeLessThan(5.5)
    mover.dispose()
  })

  it('keeps a free pawn centred on its tile', () => {
    const { mover, pawn } = moverFor({ pressTowardFor: () => undefined })
    mover.place(PLAYER, 5)
    drainHops()

    expect(pawn.position.x).toBe(5)
    mover.dispose()
  })
})
