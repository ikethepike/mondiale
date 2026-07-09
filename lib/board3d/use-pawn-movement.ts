import { gsap } from 'gsap'
import type { Object3D } from 'three'
import { prefersReducedMotion } from '~~/lib/motion'
import type { TileTransform } from './path'

interface PawnState {
  displayed: number
  /** Tile the active hop tween is heading to (displayed only advances on completion). */
  hopTarget?: number
  queue: number[]
  hopping: boolean
  activeTween?: gsap.core.Tween
  pendingLanding?: ReturnType<typeof setTimeout>
}

export interface PawnMover {
  /** Instantly place a pawn (initial mount, board rebuilds, reconnects). */
  place(playerId: string, tileIndex: number): void
  /** Queue animated hops toward a new tile index. */
  moveTo(playerId: string, tileIndex: number): void
  /**
   * Mount-time placement that replays movement missed while the board was
   * unmounted (challenge win leaps, walks started before the scene loaded):
   * the pawn appears where it was last SEEN and hops to where it IS.
   */
  restore(playerId: string, tileIndex: number): void
  dispose(): void
}

/**
 * Where each pawn was last shown, per game — module state so it survives the
 * board unmounting for challenge views. Without it a remounted board places
 * pawns at their latest position and any steps in between are never seen.
 */
const displayedMemory = new Map<string, Map<string, number>>()

const PAWN_REST_Y = 0.6
const SHARED_TILE_SCALE = 0.72

/**
 * How long a pawn waits on a tile with an empty queue before it counts as
 * having *landed* (squash + ripple). Server steps arrive ~500ms apart, so the
 * queue is briefly empty between every step — the debounce keeps the landing
 * flourish for the true end of a run.
 */
const LANDING_SETTLE_MS = 650

/**
 * Turns server-pushed `currentPosition` updates (one socket message per
 * 500ms step) into hop-arc tweens. Hops are queued per pawn so bursts
 * (reconnects, +2 jumps) play back smoothly; long backlogs fast-forward.
 *
 * The mover also owns tile occupancy: a pawn alone on a tile sits centered
 * at full size, co-located pawns spread radially and shrink, and everyone
 * re-layouts when a pawn arrives or leaves.
 */
export const createPawnMover = (options: {
  pawnFor: (playerId: string) => Object3D | undefined
  tileFor: (tileIndex: number) => TileTransform | undefined
  /** Radial distance between co-located pawns and the tile center. */
  slotRadius: number
  hopHeight: number
  /** Fired when a pawn settles at the end of a run of hops. */
  onLand?: (playerId: string, tile: TileTransform) => void
  /** Key for cross-mount position memory (the game id). */
  memoryKey?: string
}): PawnMover => {
  const states = new Map<string, PawnState>()

  const memory = (() => {
    if (!options.memoryKey) return undefined
    if (!displayedMemory.has(options.memoryKey)) {
      // One game per client — starting a new game drops stale memories
      displayedMemory.clear()
      displayedMemory.set(options.memoryKey, new Map())
    }
    return displayedMemory.get(options.memoryKey)
  })()
  // Held for dispose(); killing an already-finished tween is a no-op.
  // NOTE: never use tween.eventCallback('onComplete', ...) for cleanup here —
  // it REPLACES a tween's own onComplete (the hop chain lives in there).
  const tweens = new Set<gsap.core.Tween>()

  const track = (tween: gsap.core.Tween) => {
    tweens.add(tween)
    return tween
  }

  /**
   * The furthest tile this pawn is already committed to: queue tail, else the
   * in-flight hop's target, else where it rests. Using `displayed` while a
   * hop is in flight would re-queue the in-flight step and produce phantom
   * hops-in-place.
   */
  const destinationOf = (state: PawnState) => {
    if (state.queue.length) return state.queue[state.queue.length - 1]
    if (state.hopping && state.hopTarget !== undefined) return state.hopTarget
    return state.displayed
  }

  /** Deterministic slot on a tile, shared-aware: same result on every client. */
  const slotFor = (playerId: string, tileIndex: number) => {
    const cohabitants = [...states.entries()]
      .filter(([, state]) => destinationOf(state) === tileIndex)
      .map(([id]) => id)
    if (!cohabitants.includes(playerId)) cohabitants.push(playerId)
    cohabitants.sort()

    if (cohabitants.length <= 1) return { x: 0, z: 0, scale: 1 }

    const angle = (cohabitants.indexOf(playerId) / cohabitants.length) * Math.PI * 2 - Math.PI / 2
    return {
      x: Math.cos(angle) * options.slotRadius,
      z: Math.sin(angle) * options.slotRadius,
      scale: SHARED_TILE_SCALE,
    }
  }

  const restingPosition = (playerId: string, tileIndex: number) => {
    const tile = options.tileFor(tileIndex)
    if (!tile) return undefined
    const slot = slotFor(playerId, tileIndex)
    return {
      x: tile.position.x + slot.x,
      y: tile.position.y + PAWN_REST_Y,
      z: tile.position.z + slot.z,
      scale: slot.scale,
    }
  }

  /** Ease every settled pawn to its (possibly new) slot after occupancy changes. */
  const relayout = (exceptId?: string) => {
    for (const [playerId, state] of states) {
      if (playerId === exceptId || state.hopping || state.queue.length) continue
      const pawn = options.pawnFor(playerId)
      const resting = restingPosition(playerId, state.displayed)
      if (!pawn || !resting) continue

      if (prefersReducedMotion()) {
        pawn.position.set(resting.x, resting.y, resting.z)
        pawn.scale.setScalar(resting.scale)
        continue
      }

      track(
        gsap.to(pawn.position, {
          x: resting.x,
          y: resting.y,
          z: resting.z,
          duration: 0.25,
          ease: 'power2.out',
          overwrite: 'auto',
        })
      )
      track(
        gsap.to(pawn.scale, {
          x: resting.scale,
          y: resting.scale,
          z: resting.scale,
          duration: 0.25,
          ease: 'power2.out',
          overwrite: 'auto',
        })
      )
    }
  }

  const cancelLanding = (state: PawnState) => {
    if (state.pendingLanding) {
      clearTimeout(state.pendingLanding)
      state.pendingLanding = undefined
    }
  }

  /** Squash + landing callback, debounced so mid-run pauses don't count. */
  const scheduleLanding = (playerId: string, state: PawnState) => {
    cancelLanding(state)
    state.pendingLanding = setTimeout(() => {
      state.pendingLanding = undefined
      if (state.hopping || state.queue.length) return

      const pawn = options.pawnFor(playerId)
      const tile = options.tileFor(state.displayed)
      if (!pawn || !tile) return

      const scale = pawn.scale.x
      track(
        gsap.fromTo(
          pawn.scale,
          { y: scale * 0.82 },
          { y: scale, duration: 0.14, ease: 'power2.out' }
        )
      )
      relayout(playerId)
      options.onLand?.(playerId, tile)
    }, LANDING_SETTLE_MS)
  }

  const stopActiveHop = (state: PawnState) => {
    state.activeTween?.kill()
    state.activeTween = undefined
    state.hopping = false
    state.hopTarget = undefined
  }

  const place = (playerId: string, tileIndex: number) => {
    const existing = states.get(playerId)
    if (existing) {
      stopActiveHop(existing)
      cancelLanding(existing)
    }

    states.set(playerId, { displayed: tileIndex, queue: [], hopping: false })
    memory?.set(playerId, tileIndex)

    const pawn = options.pawnFor(playerId)
    const resting = restingPosition(playerId, tileIndex)
    if (!pawn || !resting) return

    pawn.position.set(resting.x, resting.y, resting.z)
    pawn.scale.setScalar(resting.scale)
    relayout(playerId)
  }

  const hopNext = (playerId: string) => {
    const state = states.get(playerId)
    const pawn = options.pawnFor(playerId)
    if (!state || !pawn || state.hopping) return

    const next = state.queue.shift()
    if (next === undefined) return

    cancelLanding(state)

    const from = {
      x: pawn.position.x,
      y: pawn.position.y,
      z: pawn.position.z,
      scale: pawn.scale.x,
    }
    const to = restingPosition(playerId, next)
    if (!to) {
      state.displayed = next
      return
    }

    state.hopping = true
    state.hopTarget = next
    const proxy = { t: 0 }
    state.activeTween = track(
      gsap.to(proxy, {
        t: 1,
        duration: 0.38,
        ease: 'power1.inOut',
        onUpdate() {
          const t = proxy.t
          pawn.position.x = from.x + (to.x - from.x) * t
          pawn.position.z = from.z + (to.z - from.z) * t
          pawn.position.y = from.y + (to.y - from.y) * t + Math.sin(t * Math.PI) * options.hopHeight
          const scale = from.scale + (to.scale - from.scale) * t
          pawn.scale.set(scale, scale, scale)
        },
        onComplete() {
          state.displayed = next
          memory?.set(playerId, next)
          state.hopping = false
          state.hopTarget = undefined
          state.activeTween = undefined

          if (state.queue.length) {
            hopNext(playerId)
          } else {
            scheduleLanding(playerId, state)
          }
        },
      })
    )
  }

  const moveTo = (playerId: string, tileIndex: number) => {
    const state = states.get(playerId)
    if (!state) return place(playerId, tileIndex)

    const committed = destinationOf(state)
    if (tileIndex === committed) return

    if (tileIndex < committed) {
      // A short retreat is a real gameplay beat — a pawn bounced off a failed
      // challenge — so play it as a single backward hop. Bigger jumps back
      // are resets (reconnects) and just snap.
      if (committed - tileIndex <= 2 && !prefersReducedMotion()) {
        state.queue = [tileIndex]
        return hopNext(playerId)
      }

      state.queue = []
      return place(playerId, tileIndex)
    }

    for (let step = committed + 1; step <= tileIndex; step++) {
      state.queue.push(step)
    }

    if (prefersReducedMotion() || state.queue.length > 4) {
      // Fast-forward: snap to the destination with a single landing
      state.queue = []
      const tile = options.tileFor(tileIndex)
      place(playerId, tileIndex)
      if (tile) options.onLand?.(playerId, tile)
      return
    }

    hopNext(playerId)
  }

  const restore = (playerId: string, tileIndex: number) => {
    const remembered = memory?.get(playerId)
    if (remembered === undefined || remembered === tileIndex) {
      return place(playerId, tileIndex)
    }

    // Reappear where the pawn was last seen, then walk the missed stretch
    // (moveTo fast-forwards long backlogs and plays short retreats)
    place(playerId, remembered)
    moveTo(playerId, tileIndex)
  }

  return {
    place,
    moveTo,
    restore,
    dispose() {
      for (const state of states.values()) {
        cancelLanding(state)
      }
      tweens.forEach(tween => tween.kill())
      tweens.clear()
      states.clear()
    },
  }
}
