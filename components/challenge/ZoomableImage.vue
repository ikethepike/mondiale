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
    <!-- Blurred copy fills the letterbox gaps behind an off-ratio photo. -->
    <div
      v-if="!broken"
      class="backdrop"
      :style="{ backgroundImage: `url('${src}')` }"
      aria-hidden="true"
    />
    <!-- The transform lives on a wrapper so the image's object-fit is untouched. -->
    <div v-if="!broken" class="photo-wrap" :style="transformStyle">
      <img class="photo" :src="src" :alt="alt" draggable="false" @error="broken = true" />
    </div>
    <div v-else class="missing" aria-hidden="true">?</div>

    <!-- Zoom controls: clickable, and marked so pointer-panning ignores them. -->
    <div v-if="!broken" class="controls">
      <button type="button" class="zoom-btn" data-control title="Zoom out" @click="zoomBy(-STEP)">
        −
      </button>
      <button type="button" class="zoom-btn" data-control title="Reset" @click="reset">⤢</button>
      <button type="button" class="zoom-btn" data-control title="Zoom in" @click="zoomBy(STEP)">
        ＋
      </button>
    </div>
    <span v-if="!broken && scale === 1" class="hint" aria-hidden="true"
      >Scroll or pinch to zoom</span
    >
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

const onDoubleClick = (event: MouseEvent) => {
  event.preventDefault()
  // Double-tap toggles: zoom in toward the point, or reset if already zoomed.
  if (scale.value > 1) return reset()
  const { x, y } = localPoint(event)
  zoomToward(2.4, x, y)
}

// --- Pointer tracking (drag to pan; two pointers to pinch) ------------------
const pointers = new Map<number, { x: number; y: number }>()
let lastPinchDistance = 0

const isControl = (event: PointerEvent) =>
  (event.target as HTMLElement)?.closest?.('[data-control]') != null

const onPointerDown = (event: PointerEvent) => {
  if (isControl(event)) return // let the button receive its click
  viewport.value?.setPointerCapture?.(event.pointerId)
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (pointers.size === 1 && scale.value > 1) grabbing.value = true
  if (pointers.size === 2) lastPinchDistance = pinchDistance()
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
  pointers.delete(event.pointerId)
  if (pointers.size < 2) lastPinchDistance = 0
  if (pointers.size === 0) grabbing.value = false
}

const pinchDistance = (): number => {
  const [a, b] = [...pointers.values()]
  if (!a || !b) return 0
  return Math.hypot(a.x - b.x, a.y - b.y)
}
</script>
<style lang="scss" scoped>
.zoomable {
  position: relative;
  overflow: hidden;
  width: 100%;
  height: 100%;
  border-radius: 1.2rem;
  border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.2);
  background: hsla(215.7, 76.4%, 21.6%, 0.06);
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

.backdrop {
  position: absolute;
  inset: -2rem;
  background-size: cover;
  background-position: center;
  filter: blur(1.6rem) brightness(0.7);
  transform: scale(1.1);
  pointer-events: none;
}

.photo-wrap {
  position: absolute;
  inset: 0;
  transform-origin: center center;
  will-change: transform;
  pointer-events: none;
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

.controls {
  position: absolute;
  right: 0.8rem;
  bottom: 0.8rem;
  display: flex;
  gap: 0.4rem;
  z-index: 3;
}
.zoom-btn {
  width: 2.8rem;
  height: 2.8rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.6rem;
  line-height: 1;
  cursor: pointer;
  color: var(--dark-blue);
  border-radius: 0.8rem;
  border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.2);
  background: hsla(36, 100%, 98%, 0.92);
  backdrop-filter: blur(0.4rem);
  transition: transform var(--motion-quick) var(--ease-out-expressive);

  &:hover {
    transform: translateY(-0.1rem);
  }
}

.hint {
  position: absolute;
  left: 0.8rem;
  bottom: 0.8rem;
  z-index: 2;
  padding: 0.3rem 0.8rem;
  font-size: 1.1rem;
  border-radius: 999px;
  pointer-events: none;
  color: var(--dark-blue);
  background: hsla(36, 100%, 98%, 0.75);
}

@media (hover: none) {
  .zoom-btn {
    width: 3.4rem;
    height: 3.4rem;
    font-size: 1.8rem;
  }
}
</style>
