import { gsap } from 'gsap'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { EASE, MOTION } from '~~/lib/motion'
import { useDragSheet } from '~~/lib/use-drag-sheet'
import { keyboardInset } from '~~/lib/use-viewport'

/**
 * The parked sheet's rest points, in useDragSheet stop order. Two of them, on
 * purpose: deployed, or hidden down to the grab handle.
 *
 * There was a third in between — the head showing, rows off-screen — and it
 * was a mistake in every position it could hold. As an entrance it spent real
 * height on controls whose results were off-screen; as a tap destination it
 * read as the sheet catching halfway; as a drag rest it was the state a player
 * had to escape. A surface the player is either reading or not needs exactly
 * two stops.
 */
export const SHEET_FULL = 0
export const SHEET_TUCKED = 1

/** Fallback grab-handle height, for the frame before one can be measured. */
export const SHEET_HANDLE_PX = 28

// A parked transform may miss its stop by a frame's worth of geometry churn
// (the keyboard collapsing right after a settle) — past this drift the rest
// is corrected.
const REST_DRIFT_PX = 1
/** Past this the correction is visible, so it glides instead of snapping. */
const CORRECTION_GLIDE_PX = 8

export interface BottomSheetOptions {
  /** The sheet element (usually a fixed `.pane.sheet.split`). */
  sheet: () => HTMLElement | undefined
  /** The grab pill — all that stays above the fold when hidden. Measured, so
   *  the sheet's own padding and the pill's margins are accounted for. */
  handle?: () => HTMLElement | undefined
  /** The scrolling `.sheet-body`, watched for the scroll-edge fades. */
  body?: () => HTMLElement | undefined
  /** Sheet mechanics only apply while this is true (phone widths). */
  enabled: () => boolean
  /** Presses inside this selector never start a drag (typed inputs, buttons). */
  dragExclude?: string
  /**
   * Blurred when a gesture lands while the software keyboard is up: with the
   * keyboard up CSS owns the lift and the measured stops are stale, so the
   * swipe dismisses the keyboard instead of dead-dragging the sheet.
   */
  keyboardOwner?: () => { blur: () => void } | undefined
  /** Fires at every rest, with the landed stop — berth claims live here. */
  onSettle?: (index: number) => void
  /** Ease for a flick-carried move between stops (see useDragSheet). */
  momentumEase?: string
}

/**
 * The parked bottom sheet: a full/peek/tucked ladder over useDragSheet for
 * roster-style surfaces that stay up all round (MembershipSheet today). It
 * owns everything every such sheet needs and got wrong once already —
 *
 * - stops measured lazily from the live geometry, so short and long content
 *   both get honest rest points;
 * - the tucked-first entrance (rises to peek);
 * - re-anchoring: the stops are transforms measured against the sheet's
 *   CURRENT height, and that height moves under a parked sheet (filtering
 *   shrinks a list, the keyboard's max-height grant collapses) — a
 *   ResizeObserver re-settles the held stop against fresh geometry before the
 *   stale transform can push the sheet below the viewport;
 * - scroll-edge state for the `.fade-top`/`.fade-bottom` classes
 *   (templates/_sheet.scss), on only when content continues past that edge;
 * - drag guards: presses inside `dragExclude` never drag, and with the
 *   keyboard up a swipe blurs `keyboardOwner` instead;
 * - a handle tap toggling full ↔ peek;
 * - a post-rest drift check: a settle that lands mid-geometry-churn (the
 *   keyboard collapsing right after an answer) is corrected a frame later —
 *   snapped if it is a hair, glided if the gap is visible — so a collapse
 *   can never park half-open. The handle itself stays on screen at every
 *   stop, so the sheet is always recoverable by hand.
 *
 * Every geometry watcher stands down while a finger owns the surface: a
 * re-settle mid-drag is the classic "the sheet fought me" bug.
 *
 * Dismiss-only sheets (the history drawer's two-stop open/offscreen) stay on
 * useDragSheet directly — a tuck ladder is not their shape.
 */
export const useBottomSheet = (options: BottomSheetOptions) => {
  /**
   * How much of the sheet must stay above the fold to show everything down to
   * `inner`'s bottom edge — MEASURED from the live boxes, so the sheet's own
   * top padding and the handle's margins are included instead of guessed at.
   * Summing element heights dropped that padding and left the handle's pill
   * fractionally short of clearing the fold.
   *
   * Transform-invariant: both rects carry the same translate, so the
   * difference holds mid-drag and mid-tween.
   */
  const throughBottom = (inner?: HTMLElement) => {
    const sheet = options.sheet()
    if (!sheet || !inner) return 0
    return Math.round(inner.getBoundingClientRect().bottom - sheet.getBoundingClientRect().top)
  }

  const stops = () => {
    const height = options.sheet()?.offsetHeight ?? 0
    const throughHandle = throughBottom(options.handle?.()) || SHEET_HANDLE_PX
    return [0, Math.max(0, height - throughHandle)]
  }

  /**
   * A settle can land a frame before the geometry stops moving (the keyboard
   * collapsing right after an answer), leaving the parked transform short of
   * its stop — the "stuck with extra sheet over the fold" failure. One frame
   * after every rest, compare the painted position to the stop and re-snap
   * any drift. Idempotent: the re-snap's own rest verifies clean.
   */
  const verifyRest = () => {
    const el = options.sheet()
    // A tween in flight IS the correction in progress — cutting it is what
    // turned the deliberate post-answer glide into a snap whenever the
    // keyboard finished collapsing mid-flight.
    if (!el || !options.enabled() || isDragging() || gsap.isTweening(el)) return
    // `none` at the full stop, where settling strips the inline transform —
    // DOMMatrix rejects it, and that is a resting sheet with nothing to fix.
    const transform = getComputedStyle(el).transform
    if (transform === 'none') return
    const y = new DOMMatrixReadOnly(transform).m42
    const target = stops()[stopIndex.value] ?? 0
    if (Math.abs(y - target) <= REST_DRIFT_PX) return
    // Correct the miss in kind: a hair of drift is snapped, a real gap
    // (the keyboard's collapse moved the floor) is glided so the correction
    // reads as the same movement finishing rather than a second lurch.
    settleTo(stopIndex.value, {
      immediate: Math.abs(y - target) < CORRECTION_GLIDE_PX,
      ease: EASE.cross,
      duration: MOTION.quick,
    })
  }

  const { stopIndex, onDragStart, settleTo, release, dragMoved, isDragging } = useDragSheet({
    el: options.sheet,
    enabled: options.enabled,
    stops,
    momentumEase: options.momentumEase,
    onSettle: index => {
      options.onSettle?.(index)
      requestAnimationFrame(verifyRest)
    },
  })

  /** Every drag enters here — bind to the handle's and header's pointerdown. */
  const onSheetDragStart = (event: PointerEvent) => {
    if (
      options.dragExclude &&
      event.target instanceof Element &&
      event.target.closest(options.dragExclude)
    ) {
      return
    }
    if (keyboardInset.value) return options.keyboardOwner?.()?.blur()
    onDragStart(event)
  }

  /** Tap (not drag) on the grab handle: deploy, or hide to the bare handle. */
  const onHandleTap = () => {
    if (!options.enabled() || dragMoved() || keyboardInset.value) return
    settleTo(stopIndex.value === SHEET_FULL ? SHEET_TUCKED : SHEET_FULL)
  }

  // Scroll-edge fades: on only when content actually continues past that
  // edge, so a short list never wears a dimmed last row.
  const scrollableUp = ref(false)
  const scrollableDown = ref(false)

  const syncScrollEdges = () => {
    const el = options.body?.()
    if (!el) return
    scrollableUp.value = el.scrollTop > 1
    scrollableDown.value = el.scrollTop + el.clientHeight < el.scrollHeight - 1
  }

  let observer: ResizeObserver | undefined

  onMounted(() => {
    // Enter hidden, rising from fully off-screen: the handle slides up into
    // view and the map stays clear until the player asks for the roster.
    if (options.enabled()) {
      settleTo(SHEET_TUCKED, { from: options.sheet()?.offsetHeight ?? 0 })
    }
    syncScrollEdges()
    // One rule for every geometry change: re-judge the scroll edges, then let
    // verifyRest decide whether the parked transform still matches its stop.
    observer = new ResizeObserver(() => {
      syncScrollEdges()
      verifyRest()
    })
    for (const el of new Set([options.sheet(), options.handle?.(), options.body?.()])) {
      if (el) observer.observe(el, { box: 'border-box' })
    }
  })

  watch(options.enabled, on => {
    // Hand layout back to CSS when the sheet stops being a sheet …
    if (!on) return release()
    // … and re-enter hidden when it becomes one again. release() stripped the
    // transform but left stopIndex where it was, so without this a rotation
    // back to phone width renders the whole roster over the map while the
    // berth claim still describes a bare handle.
    settleTo(SHEET_TUCKED)
  })

  onBeforeUnmount(() => observer?.disconnect())

  /** How much of the sheet stands above the fold at a stop — what a camera
   *  berth has to reserve. Measured, so it agrees with the stop by
   *  construction rather than by a host repeating the arithmetic. */
  const visibleAt = (index: number) => {
    const height = options.sheet()?.offsetHeight ?? 0
    return Math.max(0, height - (stops()[index] ?? 0))
  }

  return {
    stopIndex,
    settleTo,
    visibleAt,
    dragMoved,
    onSheetDragStart,
    onHandleTap,
    scrollableUp,
    scrollableDown,
    syncScrollEdges,
  }
}
