import { gsap } from 'gsap'
import { onUnmounted, ref } from 'vue'
import { EASE, MOTION, prefersReducedMotion } from '~~/lib/motion'
import { clamp } from '~~/lib/number'

/** A finger flick, in px/ms — one threshold for every sheet in the game. */
export const FLICK_PX_PER_MS = 0.55
/** Past the outer stops the sheet tracks the finger at this fraction. */
export const SHEET_RUBBER = 0.15
const VELOCITY_SAMPLES = 5
const TAP_SLOP_PX = 6
/** Momentum snap bounds, seconds — a flick lands fast but never blinks. */
const SNAP_MIN_S = 0.12
const SNAP_MAX_S = 0.4
const SPRING_S = 0.5
const SPRING_EASE = 'elastic.out(0.9, 0.55)'

export interface DragSheetOptions {
  el: () => HTMLElement | undefined
  enabled: () => boolean
  /** Ascending translateY rest points; [0] is fully open. Read lazily. */
  stops: () => number[]
  onSettle?: (index: number) => void
  /** Ease for a flick-carried move between stops. */
  momentumEase?: string
}

export interface SettleOptions {
  /** Finger velocity at release, px/ms — decides momentum vs spring. */
  velocity?: number
  /** Start the move from this translateY (programmatic entrances). */
  from?: number
  immediate?: boolean
}

/**
 * A pointer-dragged sheet with velocity-snapped rest points: the surface
 * tracks the finger 1:1 between its stops (rubber-bands past them), and on
 * release a flick carries it one stop onward while anything slower springs
 * to the nearest. One home for the drag math — RoundHistoryDrawer's dismiss
 * rides it, and any future sheet must too.
 */
export const useDragSheet = (options: DragSheetOptions) => {
  const stopIndex = ref(0)
  let dragging = false
  let moved = false
  let startY = 0
  let baseY = 0
  let samples: { y: number; t: number }[] = []

  const settleTo = (index: number, { velocity = 0, from, immediate = false }: SettleOptions = {}) => {
    const el = options.el()
    if (!el) return
    stopIndex.value = index
    const y = options.stops()[index] ?? 0
    // At rest fully open the inline transform comes off, so CSS transitions
    // (a Vue leave, a breakpoint flip) own the element again.
    const land = () => {
      if (y === 0) gsap.set(el, { clearProps: 'transform' })
      options.onSettle?.(index)
    }
    gsap.killTweensOf(el)
    if (immediate || prefersReducedMotion()) {
      gsap.set(el, { y })
      land()
      return
    }
    if (from !== undefined) gsap.set(el, { y: from })
    const remaining = Math.abs(y - Number(gsap.getProperty(el, 'y')))
    const flicked = Math.abs(velocity) > FLICK_PX_PER_MS
    gsap.to(el, {
      y,
      duration:
        from !== undefined
          ? MOTION.slow
          : flicked
            ? clamp(remaining / Math.max(Math.abs(velocity) * 1000, 900), SNAP_MIN_S, SNAP_MAX_S)
            : SPRING_S,
      ease: from !== undefined ? EASE.enter : flicked ? (options.momentumEase ?? 'power2.out') : SPRING_EASE,
      onComplete: land,
    })
  }

  const onDragMove = (event: PointerEvent) => {
    const el = options.el()
    if (!dragging || !el) return
    const dy = event.clientY - startY
    if (Math.abs(dy) > TAP_SLOP_PX) moved = true
    samples.push({ y: event.clientY, t: performance.now() })
    if (samples.length > VELOCITY_SAMPLES) samples.shift()

    const stops = options.stops()
    const min = stops[0] ?? 0
    const max = stops[stops.length - 1] ?? 0
    let y = baseY + dy
    if (y < min) y = min + (y - min) * SHEET_RUBBER
    else if (y > max) y = max + (y - max) * SHEET_RUBBER
    gsap.set(el, { y })
  }

  const stopDragListeners = () => {
    window.removeEventListener('pointermove', onDragMove)
    window.removeEventListener('pointerup', onDragEnd)
    window.removeEventListener('pointercancel', onDragEnd)
  }

  const onDragEnd = () => {
    stopDragListeners()
    const el = options.el()
    if (!dragging || !el) return
    dragging = false

    const first = samples[0]
    const last = samples[samples.length - 1]
    const velocity = first && last && last.t > first.t ? (last.y - first.y) / (last.t - first.t) : 0

    const stops = options.stops()
    const y = Number(gsap.getProperty(el, 'y'))
    const target =
      Math.abs(velocity) > FLICK_PX_PER_MS
        ? clamp(stopIndex.value + Math.sign(velocity), 0, stops.length - 1)
        : stops.reduce((best, stop, index) => (Math.abs(stop - y) < Math.abs(stops[best] - y) ? index : best), 0)
    settleTo(target, { velocity })
  }

  const onDragStart = (event: PointerEvent) => {
    const el = options.el()
    if (!el || !options.enabled()) return
    dragging = true
    moved = false
    startY = event.clientY
    baseY = Number(gsap.getProperty(el, 'y'))
    samples = [{ y: event.clientY, t: performance.now() }]
    gsap.killTweensOf(el)
    window.addEventListener('pointermove', onDragMove)
    window.addEventListener('pointerup', onDragEnd)
    window.addEventListener('pointercancel', onDragEnd)
  }

  /** Hand layout back to CSS (phone → desktop): strip the inline transform. */
  const release = () => {
    const el = options.el()
    if (!el) return
    gsap.killTweensOf(el)
    gsap.set(el, { clearProps: 'transform' })
  }

  onUnmounted(stopDragListeners)

  /** True when the pointer travelled past tap slop — a handle click can bail. */
  const dragMoved = () => moved

  return { stopIndex, onDragStart, settleTo, release, dragMoved }
}
