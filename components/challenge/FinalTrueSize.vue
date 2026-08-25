<template>
  <section v-if="scene" class="true-size-stage">
    <div ref="table" class="light-table">
      <svg
        ref="stage"
        :viewBox="viewBox"
        @pointerdown="grab"
        @pointermove="drag"
        @pointerup="release"
        @pointercancel="release"
        @wheel.prevent="wheelScale"
      >
        <g class="graticule">
          <line
            v-for="parallel in parallels"
            :key="`lat-${parallel.label}`"
            :x1="frame.left"
            :x2="frame.right"
            :y1="parallel.y"
            :y2="parallel.y"
          />
          <line
            v-for="meridian in meridians"
            :key="`lng-${meridian}`"
            :x1="meridian"
            :x2="meridian"
            :y1="frame.top"
            :y2="frame.bottom"
          />
          <text
            v-for="parallel in parallels"
            :key="`tick-${parallel.label}`"
            class="parallel-tick"
            :x="frame.left + frame.span * 0.012"
            :y="parallel.y - frame.span * 0.008"
            :style="{ fontSize: `${frame.span * 0.022}px` }"
          >
            {{ parallel.label }}
          </text>
        </g>

        <g class="anchor">
          <path v-for="(ring, index) in anchorPaths" :key="index" :d="ring" />
        </g>

        <!-- What the player committed to, left standing while the truth
             settles over it — the boundary easel's rule: the attempt stays
             readable beside the answer, in the same ink.
             Only where there IS a call: a watcher's stage, and a question the
             cap burned unanswered, would otherwise wear the untouched opening
             size as though someone had chosen it. -->
        <g
          v-if="revealed && committed !== undefined"
          class="your-call"
          :transform="`translate(${drift[0]} ${drift[1]}) scale(${committed})`"
        >
          <path v-for="(ring, index) in subjectPaths" :key="index" :d="ring" />
        </g>

        <g
          class="ghost"
          :class="{ settling: revealed, arriving, gliding }"
          :transform="`translate(${ghostAt[0]} ${ghostAt[1]}) scale(${shownScale})`"
        >
          <path v-for="(ring, index) in subjectPaths" :key="index" :d="ring" />
        </g>
      </svg>

      <Transition name="caption">
        <p v-if="hintUp" class="gesture-hint map-caption">{{ hint }}</p>
      </Transition>
    </div>

    <!-- Which shape is which, and nothing else. The areas belong to the reveal
         card, which has room for them: hung on these chips they pushed the
         anchor's name onto a second line that the squeezed column then clipped,
         and the anchor's area was the only place that figure appeared. -->
    <ul class="legend country-chip-list">
      <CountryChip compact class="ghost-chip" :country="getCountry(challenge.subject)" />
      <CountryChip compact class="anchor-chip" :country="getCountry(challenge.anchor)" />
    </ul>

    <footer v-if="!revealed" class="shell-footer">
      <div
        ref="rail"
        class="scale-rail"
        :class="{ gesturing: gesture.pointerCount.value > 1, railing }"
        role="slider"
        tabindex="0"
        aria-label="Ghost size"
        :aria-valuemin="0"
        :aria-valuemax="100"
        :aria-valuenow="Math.round(railFraction * 100)"
        :aria-valuetext="`${Math.round(scale * 100)}% of the size the map drew it`"
        @pointerdown="railGrab"
        @pointermove="railDrag"
        @pointerup="railRelease"
        @pointercancel="railRelease"
        @keydown="railKey"
      >
        <span class="cap small" aria-hidden="true" />
        <span class="track">
          <span class="handle" :style="{ left: `${railFraction * 100}%` }" />
        </span>
        <span class="cap large" aria-hidden="true" />
      </div>
      <ButtonFilled :disabled="submitted" @click="commit">
        <span>Lock it in</span>
      </ButtonFilled>
    </footer>
  </section>
</template>
<script lang="ts" setup>
import ButtonFilled from '~/components/button/ButtonFilled.vue'
import CountryChip from '~/components/country/CountryChip.vue'
import { trueSizeScene, TRUE_SIZE_SCALE_RANGE } from '~~/lib/challenges/final-challenge'
import { getCountry } from '~~/lib/country'
import { formatLatitude, MERCATOR_MAX_LAT, projectMercator } from '~~/lib/geo'
import { clamp } from '~~/lib/number'
import type { OutlinePoint } from '~~/lib/outline'
import { usePinchPan } from '~~/lib/use-pinch-pan'
import { useIsCoarsePointer } from '~~/lib/use-viewport'
import type { TrueSizeChallenge } from '~~/types/challenges/final-challenge.type'

/**
 * The light table: a Mercator stage where the subject's ghost hovers over a
 * near-equatorial anchor and one control resizes it.
 *
 * Blind while adjusting, on the scales' precedent — no live area, no ratio, no
 * percentage. The rail's own travel is the only feedback, and the reveal is
 * where the numbers arrive.
 */
const props = defineProps<{ challenge: TrueSizeChallenge; revealed: boolean }>()

const emit = defineEmits<{ finished: [scale: number] }>()

/** Room around the pair, as a share of the framed span. */
const FRAME_PAD = 0.12
/** The anchor never falls below this share of the frame on either axis. A
 *  ghost the projection has blown up past it overflows instead — that clipped
 *  first frame IS the lie, and shrinking brings it back into the world. */
const ANCHOR_MIN_SHARE = 1 / 2.8
/** Graticule spacings to choose between, finest first. A fixed step bunched
 *  the labels into an unreadable stack the moment the verdict card squeezed
 *  the table short. */
const GRATICULE_STEPS = [10, 15, 30, 45]
/** Lines a frame may hold on one axis before it reads as a stack, not a scale. */
const MAX_GRATICULE_LINES = 7
/** The hint outstays a fumbled first touch, but never the round. */
const HINT_MS = 9000
/** Wheel delta into a scale factor. */
const WHEEL_GAIN = 0.0012
/** How long the entry glide is allowed to run before the transform goes back
 *  to being written raw. Must OUTLAST the `.ghost.gliding` transition in this
 *  file's styles, or the drift is cut off mid-flight. */
const GLIDE_MS = 1250

const scene = computed(() => trueSizeScene(props.challenge.subject, props.challenge.anchor))

const committed = ref<number>()
const submitted = ref(false)
const arriving = ref(true)
/** True while the transform is being ANIMATED — the entry drift and the
 *  reveal's settle. A gesture must never inherit that transition: bound to a
 *  finger, a 1.1s ease reads as a shape swimming after the touch. */
const gliding = ref(false)
const resized = ref(false)

const isCoarse = useIsCoarsePointer()
const hint = computed(() =>
  isCoarse.value ? 'Drag to move · pinch to resize' : 'Drag to move · scroll to resize'
)

// Scale and position are ONE gesture, in the stage's own coordinates (see
// lib/use-pinch-pan.ts): a pinch grows what is between the fingers and travels
// with them, and a one-finger drag is the same math with nothing to spread.
const gesture = usePinchPan({
  min: TRUE_SIZE_SCALE_RANGE.min,
  max: TRUE_SIZE_SCALE_RANGE.max,
  reach: () => [frame.value.right, frame.value.bottom],
  onStart: () => settle(),
})
const scale = gesture.scale
const drift = gesture.offset

const ringPath = (ring: OutlinePoint[]) =>
  `M ${ring.map(([x, y]) => `${x.toFixed(4)},${y.toFixed(4)}`).join(' L ')} Z`

const anchorPaths = computed(() => scene.value?.anchor.rings.map(ringPath) ?? [])
const subjectPaths = computed(() => scene.value?.subject.rings.map(ringPath) ?? [])

// What the table is actually showing, in CSS pixels. The frame is grown to
// match it rather than letterboxed inside it: `meet` on a box the pair doesn't
// fill parked the parallels' labels in mid-air and threw away half the width a
// tall pair (Norway over the Congo) badly needs. Sizing the BOX to the pair
// instead was worse — an aspect-locked box can't give room back when the
// verdict card arrives, and the legend under it was clipped away.
const box = ref({ width: 1, height: 1 })
const table = ref<HTMLElement>()
let tableObserver: ResizeObserver | undefined

// The frame holds the anchor whole and as much of the ghost as the share cap
// allows, per axis, then spreads to the table's own shape.
const frame = computed(() => {
  const active = scene.value
  if (!active) return { left: -1, right: 1, top: -1, bottom: 1, span: 2 }
  const content = active.anchor.reach.map((anchorReach, axis) => {
    const ceiling = anchorReach / ANCHOR_MIN_SHARE
    return Math.min(Math.max(anchorReach, active.subject.reach[axis]), ceiling) * (1 + FRAME_PAD)
  })
  const shape = box.value.width / box.value.height
  const half =
    shape > content[0] / content[1]
      ? [content[1] * shape, content[1]]
      : [content[0], content[0] / shape]
  return {
    left: -half[0],
    right: half[0],
    top: -half[1],
    bottom: half[1],
    // The frame's longer side, so type and offsets sized against it hold their
    // proportion whichever way the screen is turned.
    span: Math.max(half[0], half[1]) * 2,
  }
})

const viewBox = computed(() => {
  const { left, top, right, bottom } = frame.value
  return `${left} ${top} ${right - left} ${bottom - top}`
})

// The projection's own signature, drawn faintly behind the pair: on Mercator
// the parallels pull apart as they climb, which is the whole reason the ghost
// arrives too big.
/** The finest step that doesn't crowd the frame. Both axes need it: a short
 *  frame stacks the parallels, a wide one stacks the meridians. */
const uncrowded = <T,>(build: (step: number) => T[]): T[] => {
  let last: T[] = []
  for (const step of GRATICULE_STEPS) {
    last = build(step)
    if (last.length <= MAX_GRATICULE_LINES) return last
  }
  return last
}

// The projection's own signature, drawn faintly behind the pair: on Mercator
// the parallels pull apart as they climb, which is the whole reason the ghost
// arrives too big.
const parallels = computed(() => {
  const active = scene.value
  if (!active) return []
  return uncrowded(step => {
    const rows: { y: number; label: string }[] = []
    for (let lat = -MERCATOR_MAX_LAT; lat <= MERCATOR_MAX_LAT; lat += step) {
      const y = projectMercator({ lat, lng: 0 })[1] - active.anchor.centre[1]
      if (y < frame.value.top || y > frame.value.bottom) continue
      rows.push({ y, label: formatLatitude(lat) })
    }
    return rows
  })
})

const meridians = computed(() => {
  const active = scene.value
  if (!active) return []
  return uncrowded(step => {
    const columns: number[] = []
    for (let lng = -180; lng <= 180; lng += step) {
      const x = projectMercator({ lat: 0, lng })[0] - active.anchor.centre[0]
      if (x < frame.value.left || x > frame.value.right) continue
      columns.push(x)
    }
    return columns
  })
})

/** Where the ghost enters from: the real bearing of its home, pushed clear of
 *  the frame so it drifts in rather than fading up in place. */
const homeApproach = computed((): OutlinePoint => {
  const active = scene.value
  if (!active) return [0, 0]
  const away = [
    active.subject.centre[0] - active.anchor.centre[0],
    active.subject.centre[1] - active.anchor.centre[1],
  ]
  const length = Math.hypot(away[0], away[1]) || 1
  const reach = Math.hypot(frame.value.right, frame.value.bottom) * 1.3
  return [(away[0] / length) * reach, (away[1] / length) * reach]
})

const ghostAt = computed((): OutlinePoint => (arriving.value ? homeApproach.value : drift.value))

const shownScale = computed(() =>
  props.revealed ? (scene.value?.trueScale ?? scale.value) : scale.value
)

// --- The rail: one control, logarithmic so the small end keeps its grain ----

const railSpan = Math.log(TRUE_SIZE_SCALE_RANGE.max / TRUE_SIZE_SCALE_RANGE.min)
const railFraction = computed(() => Math.log(scale.value / TRUE_SIZE_SCALE_RANGE.min) / railSpan)

const setFraction = (fraction: number) => {
  resized.value = true
  gesture.scaleTo(TRUE_SIZE_SCALE_RANGE.min * Math.exp(clamp(fraction, 0, 1) * railSpan))
}

const rail = ref<HTMLElement>()
const railing = ref(false)

const railTo = (event: PointerEvent) => {
  const track = rail.value?.getBoundingClientRect()
  if (!track?.width) return
  setFraction((event.clientX - track.left) / track.width)
}

const railGrab = (event: PointerEvent) => {
  if (!live()) return
  railing.value = true
  settle()
  // Same courtesy, same rule as the stage's: capture may throw, and it must
  // never be able to swallow the grab it precedes
  try {
    rail.value?.setPointerCapture(event.pointerId)
  } catch {
    // The drag runs on the events either way
  }
  railTo(event)
}
const railDrag = (event: PointerEvent) => {
  if (railing.value) railTo(event)
}
const railRelease = () => {
  railing.value = false
}
/** A slider's keyboard contract: arrows step, Home and End take the stops. */
const RAIL_KEY_STEP = 0.02
const railKey = (event: KeyboardEvent) => {
  if (!live()) return
  const target = {
    ArrowLeft: railFraction.value - RAIL_KEY_STEP,
    ArrowDown: railFraction.value - RAIL_KEY_STEP,
    ArrowRight: railFraction.value + RAIL_KEY_STEP,
    ArrowUp: railFraction.value + RAIL_KEY_STEP,
    Home: 0,
    End: 1,
  }[event.key]
  if (target === undefined) return
  event.preventDefault()
  settle()
  setFraction(target)
}

// --- The stage: one finger moves it, two resize it, the wheel does too -----

const stage = ref<SVGSVGElement>()

/** A client point in the stage's own coordinates. `getScreenCTM()` inverts the
 *  whole viewBox mapping — letterboxing included — so a gesture is exact at
 *  any table shape, which a pixels-per-unit ratio never was. */
const stagePoint = (event: { clientX: number; clientY: number }): OutlinePoint | undefined => {
  const matrix = stage.value?.getScreenCTM()
  if (!matrix) return undefined
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
  return [point.x, point.y]
}

/** The ghost has arrived: the entry drift retires the moment the player
 *  touches anything, so a gesture never fights a transition for the same
 *  transform. */
const settle = () => {
  arriving.value = false
  gliding.value = false
  if (glideTimeout) clearTimeout(glideTimeout)
}

const live = () => !props.revealed && !submitted.value

const grab = (event: PointerEvent) => {
  if (!live()) return
  const point = stagePoint(event)
  if (!point) return
  gesture.start(event.pointerId, point)
  // Capture keeps a finger that wanders off the table in the gesture. It is a
  // courtesy, never a gate: it throws on a pointer the browser no longer holds,
  // and taking it BEFORE the line above meant one such throw swallowed the
  // whole pinch.
  try {
    stage.value?.setPointerCapture(event.pointerId)
  } catch {
    // The gesture runs on the events themselves either way
  }
}

const drag = (event: PointerEvent) => {
  if (!live()) return
  const point = stagePoint(event)
  if (!point) return
  const before = scale.value
  gesture.move(event.pointerId, point)
  if (scale.value !== before) resized.value = true
}

const release = (event: PointerEvent) => {
  gesture.end(event.pointerId)
}

const wheelScale = (event: WheelEvent) => {
  if (!live()) return
  resized.value = true
  gesture.scaleBy(Math.exp(-event.deltaY * WHEEL_GAIN), stagePoint(event))
}

const commit = () => {
  if (submitted.value || props.revealed) return
  submitted.value = true
  committed.value = scale.value
  emit('finished', scale.value)
}

// It teaches the one gesture that isn't obvious, so it stays until the player
// has actually resized something — moving the ghost around doesn't count.
const hintExpired = ref(false)
const hintUp = computed(() => !hintExpired.value && !resized.value && !props.revealed)

let hintTimeout: ReturnType<typeof setTimeout> | undefined
let glideTimeout: ReturnType<typeof setTimeout> | undefined
onMounted(() => {
  if (table.value) {
    const measure = () => {
      const rect = table.value?.getBoundingClientRect()
      if (rect?.width && rect.height) box.value = { width: rect.width, height: rect.height }
    }
    measure()
    tableObserver = new ResizeObserver(measure)
    tableObserver.observe(table.value)
  }
  hintTimeout = setTimeout(() => (hintExpired.value = true), HINT_MS)
  // One frame at the approach position, then the drift home plays as a
  // transition rather than a tween this component has to drive. The glide
  // window closes on its own so a drag that starts a second later is 1:1.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (!arriving.value) return
      arriving.value = false
      gliding.value = true
      glideTimeout = setTimeout(() => (gliding.value = false), GLIDE_MS)
    })
  )
})
onBeforeUnmount(() => {
  clearTimeout(hintTimeout)
  clearTimeout(glideTimeout)
  tableObserver?.disconnect()
})

// A missed LAST question redeals in place — the counter doesn't advance, so
// the keyed remount never happens. The reveal ending re-arms the table.
watch(
  () => props.revealed,
  revealed => {
    if (revealed) return
    gesture.reset()
    committed.value = undefined
    submitted.value = false
    resized.value = false
  }
)
</script>
<style lang="scss" scoped>
@use 'sass:color';
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

// Opaque land, dark enough to hold its shape UNDER the ghost's wash — the
// whole comparison is the two of them overlapping.
$land: color.mix(ink(), milk(), 26%);

.true-size-stage {
  gap: 1.4rem;
  flex: 1 1 auto;
  display: flex;
  min-height: 0;
  align-items: center;
  flex-flow: column nowrap;
  justify-content: center;
}

// The stage yields room to the verdict card, but only so far: below this the
// ghost stops being a shape and the parallels stop being a scale.
.light-table {
  flex: 1 1 auto;
  min-height: min(26rem, 34vh);
  width: min(76rem, 94vw);
  position: relative;
  border-radius: 1.2rem;
  pointer-events: auto;
  background: milk(0.92);
  backdrop-filter: blur(0.5rem);
  border: 0.1rem solid ink(0.25);

  svg {
    width: 100%;
    height: 100%;
    display: block;
    // The stage owns every touch on it: without this the browser pans and
    // pinch-zooms the PAGE and the round can't be played on a phone at all.
    touch-action: none;
    cursor: grab;
    user-select: none;
    -webkit-user-select: none;
    // iOS raises a share/copy callout on a long press over SVG, mid-drag
    -webkit-touch-callout: none;

    &:active {
      cursor: grabbing;
    }
  }
}

.graticule line {
  fill: none;
  stroke: ink(0.09);
  stroke-width: 0.004;
  vector-effect: non-scaling-stroke;
}

.parallel-tick {
  fill: ink(0.3);
  letter-spacing: 0.06em;
  pointer-events: none;
}

.anchor path {
  fill: $land;
  stroke: ink(0.55);
  stroke-linejoin: round;
  stroke-width: 0.0015;
  vector-effect: non-scaling-stroke;
}

// One hue for the ghost, two intensities: the lie arrives loud and the truth
// settles into the same colour at the size it should have been all along.
.ghost path {
  fill: flame(0.2);
  stroke: flame(0.95);
  stroke-linejoin: round;
  stroke-dasharray: 5 3.5;
  stroke-width: 0.002;
  vector-effect: non-scaling-stroke;
}

// A transition here is a bug in every state but two. Bound to a finger, an
// eased transform reads as a shape swimming after the touch — so only the
// entry drift (`gliding`) and the reveal's settle animate; a live gesture
// writes the transform raw, one frame per move.
.ghost {
  filter: drop-shadow(0 0.3rem 0.5rem ink(0.22));

  &.arriving {
    opacity: 0;
  }

  &.gliding {
    transition:
      transform 1.1s var(--ease-out-expressive),
      opacity var(--motion-slow) var(--ease-smooth);
  }

  &.settling {
    transition: transform 1.2s var(--ease-smooth);

    path {
      fill: flame(0.28);
      stroke-dasharray: none;
    }
  }
}

.your-call path {
  fill: none;
  stroke: ink(0.4);
  stroke-linejoin: round;
  stroke-dasharray: 3 4;
  stroke-width: 0.0015;
  vector-effect: non-scaling-stroke;
}

// The two chips ARE the legend: the ghost wears the ghost's colour, the
// anchor the land's, and the flags do the naming.
.legend {
  gap: 0.8rem;
  margin: 0;
  display: flex;
  flex: none;
  flex-wrap: wrap;
  max-width: min(76rem, 94vw);
  justify-content: center;
  pointer-events: none;
}

.ghost-chip {
  border-color: flame(0.75);
  box-shadow: inset 0.35rem 0 0 flame(0.8);
}

.anchor-chip {
  box-shadow: inset 0.35rem 0 0 $land;
}

.gesture-hint {
  left: 50%;
  bottom: 1rem;
  margin: 0;
  position: absolute;
  white-space: nowrap;
  transform: translateX(-50%);
}

// --- The one control ---------------------------------------------------------
//
// `.shell-footer`, so the challenge shell owns the padding and the bottom
// clearance — a scenic overlay's console never sets its own.

footer {
  gap: 1.6rem;
  width: min(76rem, 96vw);
  display: flex;
  align-items: center;
  pointer-events: auto;
}

.scale-rail {
  gap: 0.9rem;
  flex: 1 1 auto;
  display: flex;
  cursor: pointer;
  padding: 0.9rem 0;
  align-items: center;
  touch-action: none;

  &:focus-visible {
    outline: 0.2rem solid flame(0.7);
    outline-offset: 0.4rem;
    border-radius: 0.6rem;
  }
}

// No numbers, no ticks — the size of the caps is the whole legend
.cap {
  flex: none;
  border-radius: 0.2rem;
  background: ink(0.35);

  &.small {
    width: 0.6rem;
    height: 0.6rem;
  }

  &.large {
    width: 1.4rem;
    height: 1.4rem;
  }
}

.track {
  flex: 1 1 auto;
  height: 0.4rem;
  position: relative;
  border-radius: 0.2rem;
  background: ink(0.14);
}

.handle {
  top: 50%;
  width: 2.2rem;
  height: 2.2rem;
  position: absolute;
  border-radius: 50%;
  background: milk();
  border: 0.2rem solid flame();
  transform: translate(-50%, -50%);
  box-shadow: 0 0.2rem 0.6rem ink(0.25);
  transition: transform var(--motion-quick) var(--ease-out-expressive);
}

// A pinch writes the same scale the rail does, so the handle tracks the
// fingers — the two controls are visibly one, and a player who found the
// pinch can see where it has taken them.
.scale-rail.gesturing .handle,
.scale-rail.railing .handle {
  transform: translate(-50%, -50%) scale(1.2);
}

@media screen and (max-width: $tablet) {
  .true-size-stage {
    gap: 1rem;
  }

  .light-table {
    width: 100%;
    min-height: min(15rem, 20dvh);
  }

  .legend {
    gap: 0.6rem;
    font-size: 0.85em;
  }

  footer {
    gap: 1.2rem;
    width: 100%;
    flex-flow: column nowrap;
    align-items: stretch;

    .scale-rail {
      padding: 1.4rem 0.4rem;
    }

    :deep(.button) {
      width: 100%;
    }
  }
}

// A thumb is not a mouse: a taller grab band and a handle it can cover
// without hiding the whole track.
@media (pointer: coarse) {
  .scale-rail {
    padding: 1.4rem 0;
  }

  .track {
    height: 0.6rem;
  }

  .handle {
    width: 2.8rem;
    height: 2.8rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ghost,
  .ghost.gliding,
  .ghost.settling,
  .handle {
    transition: none;
  }
}
</style>
