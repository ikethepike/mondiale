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
  position: { x: 0, y: 0, z: 0, set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z } },
  scale: { x: 1, y: 1, z: 1, setScalar(v: number) { this.x = v; this.y = v; this.z = v }, set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z } },
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

/**
 * The mover reads the walk generation from live state on every memory write,
 * so tests hand it a mutable holder rather than a fixed number — that is the
 * whole point: a walk dealt to an ALREADY-MOUNTED board bumps the generation
 * with no restore() in sight, and the stamp has to follow.
 */
const moverFor = (memoryKey: string, walk = { seq: 1 }) => {
  const pawn = stubPawn()
  return createPawnMover({
    pawnFor: () => pawn as never,
    tileFor,
    memoryKey,
    walkSeqFor: () => walk.seq,
    slotRadius: 1,
    hopHeight: 1,
  })
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

let gameCounter = 0
/** A fresh game id per test — module memory is cleared when the key changes. */
const freshKey = () => `game-${++gameCounter}`

beforeEach(() => {
  resetTrace()
})

afterEach(() => {
  delete (globalThis as { __pawnTrace?: PawnTraceEntry[] }).__pawnTrace
})

describe('restore', () => {
  it('never retreats onto a gate it truthfully stands short of', () => {
    const key = freshKey()
    // First mount walks the pawn out to tile 5 and remembers it there
    const first = moverFor(key)
    first.restore(PLAYER, 5)
    drainHops()
    first.dispose()

    // The gate is lost: the pawn truthfully stands at 4. The stale memory (5)
    // must not drag it back onto the gate and hop it backwards.
    resetTrace()
    const second = moverFor(key)
    second.restore(PLAYER, 4)
    drainHops()

    expect(hoppedTiles()).toEqual([])
    second.dispose()
  })

  it('ignores a memory from an older walk generation', () => {
    const key = freshKey()
    const first = moverFor(key, { seq: 1 })
    first.restore(PLAYER, 8)
    drainHops()
    first.dispose()

    // A new round deals a fresh walk: last round's tile is not an origin.
    resetTrace()
    const second = moverFor(key, { seq: 2 })
    second.restore(PLAYER, 12)
    drainHops()

    expect(hoppedTiles()).toEqual([])
    second.dispose()
  })

  it('replays a walk dealt while the board was already mounted', () => {
    const key = freshKey()
    // Mounted under generation 1 and settled at tile 5.
    const walk = { seq: 1 }
    const first = moverFor(key, walk)
    first.restore(PLAYER, 5)
    drainHops()

    // The round settles and startWalk deals a NEW walk — the board is still
    // mounted, so the pawn walks live through the position watcher and no
    // restore() runs. Every tile it covers belongs to generation 2.
    walk.seq = 2
    first.moveTo(PLAYER, 8)
    drainHops()
    first.dispose()

    // Board unmounts for the challenge view, then remounts still on
    // generation 2. Tiles 9…11 are movement the player never saw and is
    // still owed — stamping memory at restore() time instead of live would
    // discard them as a generation mismatch.
    resetTrace()
    const second = moverFor(key, walk)
    second.restore(PLAYER, 11)
    drainHops()

    expect(hoppedTiles()).toEqual([9, 10, 11])
    second.dispose()
  })

  it('replays owed movement on a first mount at a real generation', () => {
    const key = freshKey()
    // A pawn placed before any restore() — every real player is already on
    // walkSeq >= 1, so a memory stamped 0 would read as a stale generation
    // and silently swallow the walk.
    const walk = { seq: 1 }
    const first = moverFor(key, walk)
    first.place(PLAYER, 3)
    drainHops()
    first.dispose()

    resetTrace()
    const second = moverFor(key, walk)
    second.restore(PLAYER, 6)
    drainHops()

    expect(hoppedTiles()).toEqual([4, 5, 6])
    second.dispose()
  })

  it('still replays a win leap the player never saw', () => {
    const key = freshKey()
    const first = moverFor(key)
    first.restore(PLAYER, 5)
    drainHops()
    first.dispose()

    // Gate won while the board was covered: the earned leap must play out.
    resetTrace()
    const second = moverFor(key)
    second.restore(PLAYER, 7)
    drainHops()

    expect(hoppedTiles()).toEqual([6, 7])
    second.dispose()
  })

  it('places without replay when there is nothing left to walk', () => {
    const key = freshKey()
    const mover = moverFor(key)
    // No prior memory at all (a hard reload): straight placement.
    mover.restore(PLAYER, 9)
    drainHops()

    expect(hoppedTiles()).toEqual([])
    mover.dispose()
  })

  it('snaps rather than replaying an over-long backlog', () => {
    const key = freshKey()
    const first = moverFor(key)
    first.restore(PLAYER, 2)
    drainHops()
    first.dispose()

    // A gap this size is a reconnect after a long absence, not owed movement.
    resetTrace()
    const second = moverFor(key)
    second.restore(PLAYER, 30)
    drainHops()

    expect(hoppedTiles()).toEqual([])
    second.dispose()
  })

  it('cuts a failed gate off AT the gate — forfeited steps are never walked', () => {
    const key = freshKey()
    // The walk was dealt 10 tiles but a gate stands at 5. The pawn walks to 4
    // and is blocked, so the board displays it ON the gate at 5.
    const first = moverFor(key)
    first.restore(PLAYER, 5)
    drainHops()
    first.dispose()

    // The gate is lost: the server clears the moves and the pawn stays at 4.
    // The five forfeited tiles (6…10) must never appear, and neither may the
    // gate itself — the pawn's progress ends here.
    resetTrace()
    const second = moverFor(key)
    second.restore(PLAYER, 4)
    drainHops()

    expect(hoppedTiles()).toEqual([])
    // Nothing beyond the blocking gate is ever rendered
    const rendered = traceSink()
      .filter(entry => entry.fn === 'place' || entry.fn === 'hop')
      .map(entry => entry.to)
    expect(Math.max(...rendered)).toBeLessThan(5)
    second.dispose()
  })

  it('does not walk a forfeited stretch when the board never saw the gate', () => {
    const key = freshKey()
    // Board covered for the whole turn: last seen back at the walk's start.
    const first = moverFor(key, { seq: 1 })
    first.restore(PLAYER, 1)
    drainHops()
    first.dispose()

    // A new walk is dealt, run into a gate, and lost — the pawn ends at 4.
    // The replay may cover the tiles it genuinely walked (2…4) but must stop
    // dead there: the gate and everything past it were forfeited.
    resetTrace()
    const second = moverFor(key, { seq: 2 })
    second.restore(PLAYER, 4)
    drainHops()

    const rendered = traceSink()
      .filter(entry => entry.fn === 'place' || entry.fn === 'hop')
      .map(entry => entry.to)
    expect(Math.max(...rendered)).toBe(4)
    second.dispose()
  })
})

describe('moveTo', () => {
  it('still plays the live bounce off a failed gate', () => {
    const key = freshKey()
    const mover = moverFor(key)
    mover.restore(PLAYER, 5)
    drainHops()

    // Mounted and live: the knock-back off the gate is a real gameplay beat
    // and must survive the restore-side clamp.
    resetTrace()
    mover.moveTo(PLAYER, 4)
    drainHops()

    expect(hoppedTiles()).toEqual([4])
    mover.dispose()
  })
})
