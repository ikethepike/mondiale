<template>
  <div
    ref="viewport"
    class="zoomable"
    :class="{ zoomed: scale > 1, grabbing }"
    @wheel="onWheel"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @dblclick="onDoubleClick"
  >
    <!-- The transform lives on a wrapper so the image's object-fit is untouched. -->
    <div v-if="!broken" class="photo-wrap" :class="{ easing }" :style="transformStyle">
      <img class="photo" :src="src" :alt="alt" draggable="false" @error="broken = true" />
    </div>
    <div v-else class="missing" aria-hidden="true">?</div>

    <!-- Zoom controls: clickable, and marked so pointer-panning ignores them.
         Inline SVGs, not glyphs — math-axis characters sit off-baseline (see
         the ranking poles for the same call). -->
    <div v-if="!broken" class="controls">
      <button
        type="button"
        class="zoom-btn"
        data-control
        title="Zoom out"
        :disabled="scale === 1"
        @click="discrete(() => zoomBy(-STEP))"
      >
        <svg class="zoom-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10" /></svg>
      </button>
      <button
        type="button"
        class="zoom-btn"
        data-control
        title="Reset"
        :disabled="scale === 1"
        @click="discrete(reset)"
      >
        <svg class="zoom-icon" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M6 3H3v3M10 3h3v3M6 13H3v-3M10 13h3v-3" />
        </svg>
      </button>
      <button
        type="button"
        class="zoom-btn"
        data-control
        title="Zoom in"
        @click="discrete(() => zoomBy(STEP))"
      >
        <svg class="zoom-icon" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 3v10M3 8h10" />
        </svg>
      </button>
    </div>
    <Transition name="hint-fade">
      <span v-if="!broken && scale === 1 && hintVisible" class="hint chip" aria-hidden="true">{{
        hintText
      }}</span>
    </Transition>
  </div>
</template>
<script lang="ts" setup>
withDefaults(defineProps<{ src: string; alt?: string }>(), { alt: 'A photo to identify' })

const MIN_SCALE = 1
const MAX_SCALE = 5
const STEP = 0.6

const viewport = ref<HTMLElement>()
const broken = ref(false)
const scale = ref(1)
const tx = ref(0)
const ty = ref(0)
const grabbing = ref(false)

// The hint pill introduces the gesture, then gets out of the photo's way.
const hintVisible = ref(true)
const hintText = ref('Scroll or pinch to zoom')
let hintTimer: ReturnType<typeof setTimeout> | undefined
onMounted(() => {
  if (window.matchMedia('(hover: none)').matches) hintText.value = 'Pinch to zoom'
  hintTimer = setTimeout(() => (hintVisible.value = false), 4000)
})
onUnmounted(() => clearTimeout(hintTimer))

// Discrete actions (buttons, double-tap, reset) glide via a transient
// transition class; continuous gestures (drag, pinch, wheel) stay 1:1.
const easing = ref(false)
let easingTimer: ReturnType<typeof setTimeout> | undefined
const discrete = (action: () => void) => {
  easing.value = true
  action()
  clearTimeout(easingTimer)
  easingTimer = setTimeout(() => (easing.value = false), 400)
}

const transformStyle = computed(() => ({
  transform: `translate(${tx.value}px, ${ty.value}px) scale(${scale.value})`,
}))

/** Keep the pan within bounds so the image can't be dragged off-screen. */
const clampPan = () => {
  const element = viewport.value
  if (!element) return
  const { width, height } = element.getBoundingClientRect()
  const maxX = (Math.max(scale.value, 1) - 1) * width * 0.5
  const maxY = (Math.max(scale.value, 1) - 1) * height * 0.5
  tx.value = Math.min(maxX, Math.max(-maxX, tx.value))
  ty.value = Math.min(maxY, Math.max(-maxY, ty.value))
}

const reset = () => {
  scale.value = 1
  tx.value = 0
  ty.value = 0
}

const setScale = (next: number) => {
  scale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next))
  if (scale.value === 1) reset()
  else clampPan()
}

const zoomBy = (delta: number) => setScale(scale.value + delta)

/**
 * Zoom toward a focal point (cursor / pinch centre) so the pixel under it
 * stays put. `fx`/`fy` are viewport-relative coordinates of the focus.
 */
const zoomToward = (nextScale: number, fx: number, fy: number) => {
  const element = viewport.value
  if (!element) return
  const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale))
  if (clamped === scale.value) return
  const rect = element.getBoundingClientRect()
  const originX = fx - rect.width / 2 - tx.value
  const originY = fy - rect.height / 2 - ty.value
  const ratio = clamped / scale.value
  tx.value -= originX * (ratio - 1)
  ty.value -= originY * (ratio - 1)
  scale.value = clamped
  if (scale.value === 1) reset()
  else clampPan()
}

/**
 * Zoom AND centre: the clicked point lands in the middle of the frame (as far
 * as the pan clamp allows near edges). Unlike `zoomToward`, which pins the
 * point under the cursor for continuous wheel/pinch gestures, this is the
 * punch-in for a discrete double-tap.
 */
const zoomInto = (nextScale: number, fx: number, fy: number) => {
  const element = viewport.value
  if (!element) return
  const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale))
  const rect = element.getBoundingClientRect()
  // The clicked point in untransformed content space, relative to centre.
  const contentX = (fx - rect.width / 2 - tx.value) / scale.value
  const contentY = (fy - rect.height / 2 - ty.value) / scale.value
  scale.value = clamped
  tx.value = -contentX * clamped
  ty.value = -contentY * clamped
  if (scale.value === 1) reset()
  else clampPan()
}

const localPoint = (event: { clientX: number; clientY: number }) => {
  const rect = viewport.value?.getBoundingClientRect()
  return rect ? { x: event.clientX - rect.left, y: event.clientY - rect.top } : { x: 0, y: 0 }
}

const onWheel = (event: WheelEvent) => {
  event.preventDefault()
  const { x, y } = localPoint(event)
  const delta = -event.deltaY * 0.0025 * Math.max(scale.value, 1)
  zoomToward(scale.value + delta, x, y)
}

// A rapid click series can fire more than one dblclick; without this guard
// the second one toggles the punch-in straight back out, so only a slow,
// deliberate double-click ever appeared to work.
const PUNCH_IN_SETTLE_MS = 700
let punchedInAt = 0

/** Double-click and double-tap share one toggle: punch in, or reset. */
const toggleZoom = (x: number, y: number) => {
  if (scale.value > 1) {
    if (performance.now() - punchedInAt < PUNCH_IN_SETTLE_MS) return
    return discrete(reset)
  }
  punchedInAt = performance.now()
  discrete(() => zoomInto(2.4, x, y))
}

const onDoubleClick = (event: MouseEvent) => {
  event.preventDefault()
  // Touch double-taps are detected manually from the pointer stream (iOS
  // never synthesises dblclick from taps) — don't double-handle them on
  // platforms that DO fire it.
  if (lastPointerType !== 'mouse') return
  // A trailing dblclick inside the same click burst carries detail > 2
  // (clicks three and four) — never treat it as a deliberate toggle.
  if (event.detail > 2) return
  const { x, y } = localPoint(event)
  toggleZoom(x, y)
}

// --- Pointer tracking (drag to pan; two pointers to pinch) ------------------
const pointers = new Map<number, { x: number; y: number }>()
const startPoints = new Map<number, { x: number; y: number }>()
let lastPinchDistance = 0
let gestureWasPinch = false
let lastPointerType = 'mouse'

// iOS Safari never synthesises dblclick from touch taps — double-tap is
// detected by hand: two quick, close, drag-free taps toggle the punch-in.
const DOUBLE_TAP_MS = 300
const DOUBLE_TAP_SLOP_PX = 24
const TAP_MOVE_SLOP_PX = 10
let lastTapAt = 0
let lastTap = { x: 0, y: 0 }

const isControl = (event: PointerEvent) =>
  (event.target as HTMLElement)?.closest?.('[data-control]') != null

const onPointerDown = (event: PointerEvent) => {
  if (isControl(event)) return // let the button receive its click
  lastPointerType = event.pointerType
  // A live finger takes over immediately — no gliding under a drag.
  easing.value = false
  clearTimeout(easingTimer)
  viewport.value?.setPointerCapture?.(event.pointerId)
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  startPoints.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (pointers.size === 1 && scale.value > 1) grabbing.value = true
  if (pointers.size === 2) {
    lastPinchDistance = pinchDistance()
    gestureWasPinch = true
  }
}

const onPointerMove = (event: PointerEvent) => {
  const previous = pointers.get(event.pointerId)
  if (!previous) return
  const current = { x: event.clientX, y: event.clientY }

  if (pointers.size === 1) {
    if (scale.value > 1) {
      tx.value += current.x - previous.x
      ty.value += current.y - previous.y
      clampPan()
    }
    pointers.set(event.pointerId, current)
  } else if (pointers.size === 2) {
    pointers.set(event.pointerId, current)
    const distance = pinchDistance()
    const rect = viewport.value?.getBoundingClientRect()
    if (rect && lastPinchDistance > 0) {
      const [a, b] = [...pointers.values()]
      const midX = (a.x + b.x) / 2 - rect.left
      const midY = (a.y + b.y) / 2 - rect.top
      zoomToward(scale.value * (distance / lastPinchDistance), midX, midY)
    }
    lastPinchDistance = distance
  }
}

const onPointerUp = (event: PointerEvent) => {
  const start = startPoints.get(event.pointerId)
  startPoints.delete(event.pointerId)
  pointers.delete(event.pointerId)
  if (pointers.size < 2) lastPinchDistance = 0
  if (pointers.size === 0) grabbing.value = false

  // Manual double-tap (touch/pen only; mouse gets real dblclick events).
  if (event.pointerType === 'mouse') return
  if (pointers.size > 0) return
  if (gestureWasPinch) {
    gestureWasPinch = false
    lastTapAt = 0
    return
  }
  const moved = start
    ? Math.hypot(event.clientX - start.x, event.clientY - start.y)
    : Number.POSITIVE_INFINITY
  if (moved > TAP_MOVE_SLOP_PX) {
    lastTapAt = 0
    return
  }

  const now = performance.now()
  const { x, y } = localPoint(event)
  const nearLastTap = Math.hypot(x - lastTap.x, y - lastTap.y) <= DOUBLE_TAP_SLOP_PX
  if (now - lastTapAt <= DOUBLE_TAP_MS && nearLastTap) {
    lastTapAt = 0
    toggleZoom(x, y)
    return
  }
  lastTapAt = now
  lastTap = { x, y }
}

const pinchDistance = (): number => {
  const [a, b] = [...pointers.values()]
  if (!a || !b) return 0
  return Math.hypot(a.x - b.x, a.y - b.y)
}
</script>
<style lang="scss" scoped>
// An atlas figure plate: the pane grammar (ink hairline, thick bottom rule)
// around a photo mounted on a parchment mat. Square corners — a photo plate,
// not a card.
.zoomable {
  position: relative;
  overflow: hidden;
  width: 100%;
  height: 100%;
  // Double-tap zooms; it must never start a text selection instead.
  user-select: none;
  -webkit-user-select: none;
  border: 0.1rem solid var(--text-color);
  border-bottom: 0.6rem solid var(--text-color);
  // Letterbox mat: sour-milk under a faint dark-blue wash — paper, not glass.
  background:
    linear-gradient(hsla(215.7, 76.4%, 21.6%, 0.06), hsla(215.7, 76.4%, 21.6%, 0.06)),
    var(--background-color);
  touch-action: none; // we handle pinch/pan ourselves
  // Host views (e.g. .main-board) are pointer-events:none by default; the
  // interactive photo must re-assert its own so zoom/pan gestures land.
  pointer-events: auto;
  cursor: zoom-in;

  &.zoomed {
    cursor: grab;
  }
  &.grabbing {
    cursor: grabbing;
  }
}

.photo-wrap {
  position: absolute;
  inset: 0;
  transform-origin: center center;
  will-change: transform;
  pointer-events: none;

  &.easing {
    transition: transform var(--motion-base) var(--ease-out-expressive);
  }
}

.photo {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain; // whole photo, never cropped
  object-position: center;
  user-select: none;
  -webkit-user-drag: none;
}

.missing {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 5rem;
  color: hsla(215.7, 76.4%, 21.6%, 0.3);
}

// One chip-language pill holding the three zoom actions, hairline-divided.
.controls {
  position: absolute;
  right: 0.8rem;
  bottom: 1.2rem;
  display: flex;
  align-items: stretch;
  overflow: hidden;
  z-index: 3;
  border-radius: 999px;
  backdrop-filter: blur(0.5rem);
  background: hsla(0, 0%, 100%, 0.55);
  border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.2);
}
.zoom-btn {
  width: 3.2rem;
  height: 2.8rem;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border: none;
  background: none;
  appearance: none;
  touch-action: manipulation;
  color: var(--dark-blue);

  & + & {
    border-left: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.15);
  }

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }

  &:active:not(:disabled) {
    background: hsla(197.6, 51.2%, 41.8%, 0.16);
  }
  @media (hover: hover) {
    &:hover:not(:disabled) {
      background: hsla(197.6, 51.2%, 41.8%, 0.12);
    }
  }
}

.zoom-icon {
  width: 1.5rem;
  height: 1.5rem;
  display: block;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.hint {
  position: absolute;
  left: 0.8rem;
  bottom: 1.2rem;
  z-index: 2;
  font-size: 1.1rem;
  pointer-events: none;
}

.hint-fade-leave-active {
  transition: opacity var(--motion-slow) var(--ease-in-soft);
}
.hint-fade-leave-to {
  opacity: 0;
}

// Finger-sized segments on touch devices.
@media (hover: none) {
  .zoom-btn {
    width: 4.2rem;
    height: 3.6rem;
  }
  .zoom-icon {
    width: 1.7rem;
    height: 1.7rem;
  }
}
</style>
