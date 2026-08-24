import { ref } from 'vue'
import { clamp } from './number'

/**
 * Pinch-to-scale and drag-to-move for one transformed object, as one gesture.
 *
 * Everything here works in the CALLER'S coordinate space, never screen pixels:
 * a view hands in points it has already projected (an SVG stage does that
 * exactly with `getScreenCTM()`), and gets back a scale and an offset to write
 * straight into a transform. That is what keeps the math testable and keeps
 * the projection — the one thing a view legitimately owns — in the view.
 *
 * The object is drawn as `translate(offset) scale(scale)` about its own centre.
 */

export type PinchPoint = [number, number]

export interface PinchPanState {
  scale: number
  offset: PinchPoint
}

/** What a set of live pointers looks like as one gesture: where it is, and how
 *  far apart it has spread. */
export interface PinchPanFrame {
  centre: PinchPoint
  /** Mean distance from the centre — the distance between two fingers, halved,
   *  and the same measure for three or more. Zero for a single pointer, which
   *  is what makes a one-finger drag a pure pan through the same math. */
  spread: number
}

export const pinchFrame = (points: readonly PinchPoint[]): PinchPanFrame => {
  const centre: PinchPoint = [
    points.reduce((total, [x]) => total + x, 0) / (points.length || 1),
    points.reduce((total, [, y]) => total + y, 0) / (points.length || 1),
  ]
  const spread =
    points.length < 2
      ? 0
      : points.reduce((total, [x, y]) => total + Math.hypot(x - centre[0], y - centre[1]), 0) /
        points.length
  return { centre, spread }
}

/**
 * One step of a gesture: where the fingers were, where they are now.
 *
 * The point of the object that sat under the gesture's centre stays under it —
 * a pinch grows what you are pinching, not what the layout happens to be
 * centred on — and the object follows the centre as it travels, so a two-finger
 * move scales and drags at once. A one-finger drag falls out of the same
 * expression, because a lone pointer has no spread and so no scale factor.
 *
 * Scale is clamped, and the anchor is honoured against the scale that was
 * ACTUALLY applied: past the stop, the object stops growing instead of sliding
 * out from under the fingers.
 */
export const pinchStep = (
  state: PinchPanState,
  from: PinchPanFrame,
  to: PinchPanFrame,
  bounds: { min: number; max: number }
): PinchPanState => {
  const wanted =
    from.spread > 0 && to.spread > 0 ? state.scale * (to.spread / from.spread) : state.scale
  const scale = clamp(wanted, bounds.min, bounds.max)
  const applied = state.scale ? scale / state.scale : 1
  return {
    scale,
    offset: [
      to.centre[0] + applied * (state.offset[0] - from.centre[0]),
      to.centre[1] + applied * (state.offset[1] - from.centre[1]),
    ],
  }
}

/** Scale by a factor about a fixed point — the wheel and the keyboard's version
 *  of a pinch, sharing `pinchStep`'s anchor so all three agree. */
export const scaleAbout = (
  state: PinchPanState,
  factor: number,
  about: PinchPoint,
  bounds: { min: number; max: number }
): PinchPanState =>
  pinchStep(state, { centre: about, spread: 1 }, { centre: about, spread: factor }, bounds)

export interface PinchPanOptions {
  min: number
  max: number
  /** How far the offset may travel from the origin, per axis. An object dragged
   *  past its stage is an object the player has lost. */
  reach?: () => PinchPoint
  /** Fires once per gesture, on the pointer that begins it. */
  onStart?: () => void
}

/**
 * The pointer plumbing around `pinchStep`. Feed it projected points from
 * pointerdown/move/up; read `scale` and `offset`.
 *
 * The gesture frame is rebuilt whenever the pointer COUNT changes, never
 * carried across it. Holding the frame from before a finger lifted is what
 * makes a two-to-one-finger release jump the object by everything the pinch
 * had accumulated.
 */
export const usePinchPan = (options: PinchPanOptions) => {
  const scale = ref(1)
  const offset = ref<PinchPoint>([0, 0])
  const pointerCount = ref(0)

  const points = new Map<number, PinchPoint>()
  let frame: PinchPanFrame | undefined

  const held = (): PinchPoint => {
    const [x, y] = options.reach?.() ?? [Infinity, Infinity]
    return [clamp(offset.value[0], -x, x), clamp(offset.value[1], -y, y)]
  }

  const commit = (next: PinchPanState) => {
    scale.value = next.scale
    offset.value = next.offset
    offset.value = held()
  }

  const resync = () => {
    frame = points.size ? pinchFrame([...points.values()]) : undefined
    pointerCount.value = points.size
  }

  return {
    scale,
    offset,
    /** Live pointers on the stage — a view can dim its chrome while gesturing. */
    pointerCount,

    start(pointerId: number, point: PinchPoint) {
      if (!points.size) options.onStart?.()
      points.set(pointerId, point)
      resync()
    },

    move(pointerId: number, point: PinchPoint) {
      if (!points.has(pointerId) || !frame) return
      points.set(pointerId, point)
      const next = pinchFrame([...points.values()])
      commit(pinchStep({ scale: scale.value, offset: offset.value }, frame, next, options))
      frame = next
    },

    end(pointerId: number) {
      points.delete(pointerId)
      resync()
    },

    /** Wheel, trackpad pinch, keyboard step. */
    scaleBy(factor: number, about: PinchPoint = offset.value) {
      options.onStart?.()
      commit(scaleAbout({ scale: scale.value, offset: offset.value }, factor, about, options))
    },

    /** Jump straight to a scale, holding the object's centre in place — the
     *  rail's write, which is an absolute value rather than a factor. */
    scaleTo(target: number) {
      const next = clamp(target, options.min, options.max)
      commit(
        scaleAbout(
          { scale: scale.value, offset: offset.value },
          next / scale.value,
          offset.value,
          options
        )
      )
    },

    reset() {
      points.clear()
      frame = undefined
      pointerCount.value = 0
      scale.value = 1
      offset.value = [0, 0]
    },
  }
}
