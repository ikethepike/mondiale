<template>
  <div class="dial-row">
    <button
      v-for="jump in downJumps"
      :key="jump"
      type="button"
      class="step map-caption"
      :class="jump === -jumps[0] ? 'fine' : 'coarse'"
      :disabled="disabled"
      @click="nudge(jump)"
    >
      {{ jump }}
    </button>
    <div
      ref="tape"
      class="tape"
      role="slider"
      tabindex="0"
      :aria-label="label"
      :aria-valuemin="min"
      :aria-valuemax="max"
      :aria-valuenow="shownValue"
      :aria-valuetext="format(shownValue)"
      @pointerdown="onDialDown"
      @pointermove="onDialMove"
      @pointerup="onDialUp"
      @pointercancel="onDialUp"
      @keydown="onDialKeys"
      @wheel.prevent="onDialWheel"
    >
      <span
        v-for="tick in ticks"
        :key="tick.value"
        class="tick"
        :class="{ major: tick.major, grand: tick.grand }"
        :style="{ transform: `translateX(${tick.offset}px)` }"
      >
        <em v-if="tick.major">{{ format(tick.value) }}</em>
      </span>
      <span class="needle" aria-hidden="true" />
      <strong class="readout">{{ format(shownValue) }}</strong>
    </div>
    <button
      v-for="jump in jumps"
      :key="jump"
      type="button"
      class="step map-caption"
      :class="jump === jumps[0] ? 'fine' : 'coarse'"
      :disabled="disabled"
      @click="nudge(jump)"
    >
      +{{ jump }}
    </button>
  </div>
</template>
<script lang="ts" setup>
import { gsap } from 'gsap'
import { EASE, MOTION, prefersReducedMotion } from '~~/lib/motion'
import { clamp } from '~~/lib/number'
import {
  FLICK_PX_PER_MS,
  releaseVelocity,
  SHEET_RUBBER,
  VELOCITY_SAMPLES,
  type PointerSample,
} from '~~/lib/use-drag-sheet'

/**
 * A draggable ruler tape: grab it, flick it, wheel it or arrow it, and it
 * settles on a whole step inside its rails. The Yearbook dials years on it;
 * World of Change dials decades. Consumers own their own commit affordance
 * and clock — this is the tape and its steppers, nothing else.
 */
const props = withDefaults(
  defineProps<{
    min: number
    max: number
    label: string
    format: (value: number) => string
    /** Granularity of a keyboard arrow, a tick and the settle target. */
    step?: number
    /** The two stepper magnitudes; the first is the phone-hidden fine one. */
    jumps?: [number, number]
    disabled?: boolean
  }>(),
  { step: 1, jumps: () => [10, 100], disabled: false }
)

const value = defineModel<number>({ required: true })

/** Tape gearing: one drag-pixel per ninth of a step keeps ±1 reachable by
 *  thumb while a full swipe still travels a generation. */
const PX_PER_STEP = 9
/** Steps visible either side of the needle. */
const DIAL_SPAN = 34
/** Momentum time constant, ms — a flick's glide distance is velocity × this. */
const GLIDE_TAU_MS = 260
/** Glide duration bounds, seconds — a big flick coasts, a small one settles fast. */
const GLIDE_MIN_S = 0.45
const GLIDE_MAX_S = 1.5
/** Glide duration per √step of travel, s — the coast lengthens sub-linearly. */
const GLIDE_S_PER_SQRT_STEP = 0.18
/** One wheel notch in line mode, px — the browser's own line-height convention. */
const WHEEL_LINE_PX = 16
/** Wheel gearing is coarser than drag — a trackpad swipe covers a decade, not a lifetime. */
const WHEEL_PX_PER_STEP = PX_PER_STEP * 2
/** Wheel deltas stop arriving for this long → the tape settles on a whole step. */
const WHEEL_SETTLE_MS = 160

const tape = ref<HTMLElement>()

/** Pixels per unit of value — the gearing is per STEP, so a decade dial
 *  travels the same thumb-distance per detent as a year dial does. */
const pxPerUnit = computed(() => PX_PER_STEP / props.step)
const downJumps = computed(() => props.jumps.map(jump => -jump).reverse())

/** Snap to the nearest whole step measured from the floor, so a decade dial
 *  lands on 1970 rather than an off-grid 1974. */
const snap = (raw: number) =>
  clamp(props.min + Math.round((raw - props.min) / props.step) * props.step, props.min, props.max)

/** What the needle, readout and commit all agree on — whole steps inside the rails. */
const shownValue = computed(() => snap(value.value))

const stopGlide = () => {
  gsap.killTweensOf(value)
  clearTimeout(wheelSettle)
  wheelSettle = undefined
}

/** The sheet home's flick threshold, translated through the tape's gearing. */
const isFlick = (unitVelocity: number) => Math.abs(unitVelocity) * pxPerUnit.value > FLICK_PX_PER_MS

/** Ease the tape onto a whole step — post-flick coast, spring-back from the
 *  rubber zone, and the plain release-snap all land through here. */
const settleDial = (target: number, { velocity = 0 } = {}) => {
  const to = snap(target)
  stopGlide()
  if (prefersReducedMotion()) {
    value.value = to
    return
  }
  const flicked = isFlick(velocity)
  gsap.to(value, {
    value: to,
    duration: flicked
      ? clamp(
          Math.sqrt(Math.abs(to - value.value) / props.step) * GLIDE_S_PER_SQRT_STEP,
          GLIDE_MIN_S,
          GLIDE_MAX_S
        )
      : MOTION.quick,
    // A flick decelerates like a spun wheel; everything else just eases home
    ease: flicked ? 'power3.out' : EASE.enter,
  })
}

const nudge = (delta: number) => {
  if (props.disabled) return
  settleDial(shownValue.value + delta)
}

let dragPointer: number | undefined
let dragStartX = 0
let dragStartValue = 0
let samples: PointerSample[] = []

const onDialDown = (event: PointerEvent) => {
  if (props.disabled) return
  // Grabbing a coasting tape catches it where it is
  stopGlide()
  dragPointer = event.pointerId
  dragStartX = event.clientX
  dragStartValue = value.value
  samples = [{ p: event.clientX, t: performance.now() }]
  tape.value?.setPointerCapture(event.pointerId)
  tape.value?.focus()
}

const onDialMove = (event: PointerEvent) => {
  if (dragPointer !== event.pointerId) return
  samples.push({ p: event.clientX, t: performance.now() })
  if (samples.length > VELOCITY_SAMPLES) samples.shift()
  // Ruler physics: dragging the tape left brings later values to the needle,
  // and past either end the tape rubber-bands instead of walling
  const raw = dragStartValue - (event.clientX - dragStartX) / pxPerUnit.value
  value.value =
    raw < props.min
      ? props.min + (raw - props.min) * SHEET_RUBBER
      : raw > props.max
        ? props.max + (raw - props.max) * SHEET_RUBBER
        : raw
}

const onDialUp = (event: PointerEvent) => {
  if (dragPointer !== event.pointerId) return
  dragPointer = undefined
  // Finger velocity in units/ms (drag left = later values, hence the sign flip)
  const velocity = -releaseVelocity(samples) / pxPerUnit.value
  samples = []
  const glide = isFlick(velocity) ? velocity * GLIDE_TAU_MS : 0
  settleDial(value.value + glide, { velocity })
}

let wheelSettle: ReturnType<typeof setTimeout> | undefined

const onDialWheel = (event: WheelEvent) => {
  if (props.disabled) return
  stopGlide()
  const dominant = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
  const px = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? dominant * WHEEL_LINE_PX : dominant
  value.value = clamp(value.value + (px / WHEEL_PX_PER_STEP) * props.step, props.min, props.max)
  wheelSettle = setTimeout(() => settleDial(value.value), WHEEL_SETTLE_MS)
}

const DIAL_KEYS: { [key: string]: number } = {
  ArrowLeft: -1,
  ArrowDown: -1,
  ArrowRight: 1,
  ArrowUp: 1,
  PageDown: -10,
  PageUp: 10,
}

const onDialKeys = (event: KeyboardEvent) => {
  const delta = DIAL_KEYS[event.key]
  if (!delta) return
  event.preventDefault()
  nudge(delta * props.step)
}

const ticks = computed(() => {
  const centre = value.value
  const [fine, coarse] = props.jumps
  const marks: { value: number; offset: number; major: boolean; grand: boolean }[] = []
  const span = DIAL_SPAN * props.step
  const first = snap(centre - span)
  for (let tick = first; tick <= centre + span; tick += props.step) {
    if (tick < props.min || tick > props.max) continue
    marks.push({
      value: tick,
      offset: (tick - centre) * pxPerUnit.value,
      major: tick % fine === 0,
      grand: tick % coarse === 0,
    })
  }
  return marks
})

defineExpose({ settleDial })

onBeforeUnmount(stopGlide)
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

.dial-row {
  gap: 0.6rem;
  width: 100%;
  display: flex;
  align-items: center;
  pointer-events: auto;
}

.step {
  cursor: pointer;
  flex-shrink: 0;
  font-size: 1.3rem;
  font-weight: bold;
  padding: 0.5rem 0.8rem;

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}

.tape {
  flex: 1;
  height: 6rem;
  min-width: 0;
  cursor: grab;
  overflow: hidden;
  position: relative;
  touch-action: none;
  user-select: none;
  // Digits hold their column while the tape spins — no shimmering labels
  font-variant-numeric: tabular-nums;
  border-radius: 0.8rem;
  background: ink(0.06);
  border: 0.1rem solid ink(0.2);
  // The ends fade — the tape reads as a window onto a longer ruler
  mask-image: linear-gradient(to right, transparent, black 12%, black 88%, transparent);
  -webkit-mask-image: linear-gradient(to right, transparent, black 12%, black 88%, transparent);

  &:active {
    cursor: grabbing;
  }

  &:focus-visible {
    outline: 0.2rem solid var(--soft-blue);
  }
}

.tick {
  left: 50%;
  width: 0.1rem;
  bottom: 0.5rem;
  height: 0.9rem;
  position: absolute;
  background: ink(0.35);

  &.major {
    height: 1.6rem;
    background: ink(0.6);
  }

  &.grand {
    height: 2.2rem;
    background: ink(0.85);
  }

  em {
    left: 50%;
    bottom: 100%;
    position: absolute;
    margin-bottom: 0.3rem;
    transform: translateX(-50%);
    font-size: 1.05rem;
    font-style: normal;
    white-space: nowrap;
    color: ink(0.65);
  }

  &.grand em {
    font-weight: bold;
    color: ink(0.9);
  }
}

.needle {
  top: 0;
  left: 50%;
  bottom: 0;
  width: 0.2rem;
  position: absolute;
  background: flame(0.9);
}

.readout {
  top: 0.3rem;
  left: 50%;
  position: absolute;
  transform: translateX(-50%);
  padding: 0 0.6rem;
  font-size: 1.5rem;
  border-radius: 0.4rem;
  color: var(--dark-blue);
  background: milk(0.85);
}

@media screen and (max-width: $tablet) {
  // Drag owns the fine moves on a phone, so the ±10 give way — the coarse
  // jumps stay, because a thumb-drag across 300 years is the real chore
  .step.fine {
    display: none;
  }
}
</style>
