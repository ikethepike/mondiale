<template>
  <section v-if="scene" class="true-size-stage">
    <div ref="table" class="light-table">
      <svg
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
             readable beside the answer, in the same ink. -->
        <g
          v-if="revealed"
          class="your-call"
          :transform="`translate(${drift[0]} ${drift[1]}) scale(${committedScale})`"
        >
          <path v-for="(ring, index) in subjectPaths" :key="index" :d="ring" />
        </g>

        <g
          class="ghost"
          :class="{ settling: revealed, arriving }"
          :transform="`translate(${ghostAt[0]} ${ghostAt[1]}) scale(${shownScale})`"
        >
          <path v-for="(ring, index) in subjectPaths" :key="index" :d="ring" />
        </g>
      </svg>

      <Transition name="caption">
        <p v-if="showHint && !revealed" class="gesture-hint map-caption">{{ hint }}</p>
      </Transition>
    </div>

    <!-- Which shape is which. The chips take their areas at the reveal, so the
         numbers arrive on the two labels the player has been reading all round
         rather than in a band of their own. They stand under the table rather
         than over it: the table is only as wide as the PAIR is, and a chip
         reading "Democratic Republic of the Congo" is wider than that. -->
    <ul class="legend country-chip-list">
      <CountryChip compact class="ghost-chip" :country="getCountry(challenge.subject)">
        <span v-if="revealed" class="chip-area">{{ subjectArea }}</span>
      </CountryChip>
      <CountryChip compact class="anchor-chip" :country="getCountry(challenge.anchor)">
        <span v-if="revealed" class="chip-area">{{ anchorArea }}</span>
      </CountryChip>
    </ul>

    <footer v-if="!revealed" class="shell-footer">
      <div
        ref="rail"
        class="scale-rail"
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
import { COUNTRIES } from '~~/data/countries.gen'
import { trueSizeScene, TRUE_SIZE_SCALE_RANGE } from '~~/lib/challenges/final-challenge'
import { getCountry } from '~~/lib/country'
import { MERCATOR_MAX_LAT, projectMercator } from '~~/lib/geo'
import { clamp } from '~~/lib/number'
import type { OutlinePoint } from '~~/lib/outline'
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
/** Parallels every this many degrees. */
const PARALLEL_STEP = 10
/** How long the gesture hint stays up. */
const HINT_MS = 5200

const scene = computed(() => trueSizeScene(props.challenge.subject, props.challenge.anchor))

const scale = ref(1)
const committed = ref<number>()
const submitted = ref(false)
const drift = ref<OutlinePoint>([0, 0])
const arriving = ref(true)
const showHint = ref(false)

const isCoarse = useIsCoarsePointer()
const hint = computed(() =>
  isCoarse.value ? 'Drag to move · pinch to resize' : 'Drag to move · scroll to resize'
)

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
const parallels = computed(() => {
  const active = scene.value
  if (!active) return []
  const rows: { y: number; label: string }[] = []
  for (let lat = -MERCATOR_MAX_LAT; lat <= MERCATOR_MAX_LAT; lat += PARALLEL_STEP) {
    const y = projectMercator({ lat, lng: 0 })[1] - active.anchor.centre[1]
    if (y < frame.value.top || y > frame.value.bottom) continue
    rows.push({ y, label: lat === 0 ? '0°' : `${Math.abs(lat)}°${lat > 0 ? 'N' : 'S'}` })
  }
  return rows
})

const meridians = computed(() => {
  const active = scene.value
  if (!active) return []
  const columns: number[] = []
  for (let lng = -180; lng <= 180; lng += PARALLEL_STEP) {
    const x = projectMercator({ lat: 0, lng })[0] - active.anchor.centre[0]
    if (x < frame.value.left || x > frame.value.right) continue
    columns.push(x)
  }
  return columns
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

const committedScale = computed(() => committed.value ?? scale.value)
const shownScale = computed(() =>
  props.revealed ? (scene.value?.trueScale ?? scale.value) : scale.value
)

// --- The rail: one control, logarithmic so the small end keeps its grain ----

const railSpan = Math.log(TRUE_SIZE_SCALE_RANGE.max / TRUE_SIZE_SCALE_RANGE.min)
const railFraction = computed(() => Math.log(scale.value / TRUE_SIZE_SCALE_RANGE.min) / railSpan)

const setFraction = (fraction: number) => {
  scale.value = TRUE_SIZE_SCALE_RANGE.min * Math.exp(clamp(fraction, 0, 1) * railSpan)
}
const nudgeScale = (factor: number) => {
  scale.value = clamp(scale.value * factor, TRUE_SIZE_SCALE_RANGE.min, TRUE_SIZE_SCALE_RANGE.max)
}

const rail = ref<HTMLElement>()
let railing = false

const railTo = (event: PointerEvent) => {
  const box = rail.value?.getBoundingClientRect()
  if (!box?.width) return
  setFraction((event.clientX - box.left) / box.width)
}

const railGrab = (event: PointerEvent) => {
  if (props.revealed || submitted.value) return
  railing = true
  settle()
  rail.value?.setPointerCapture(event.pointerId)
  railTo(event)
}
const railDrag = (event: PointerEvent) => {
  if (railing) railTo(event)
}
const railRelease = () => {
  railing = false
}
const railKey = (event: KeyboardEvent) => {
  const step = event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -0.02 : 0.02
  if (!/^Arrow(Left|Right|Up|Down)$/.test(event.key)) return
  event.preventDefault()
  settle()
  setFraction(railFraction.value + step)
}

// --- The stage: drag to move, pinch or wheel to resize ---------------------

const pointers = new Map<number, OutlinePoint>()
let pinchStart: { spread: number; scale: number } | undefined
let dragFrom: OutlinePoint | undefined

const spread = (): number => {
  const [a, b] = [...pointers.values()]
  return a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : 0
}

/** The ghost has arrived: the entry drift retires the moment the player
 *  touches anything, so a gesture can never fight the transition for the
 *  same transform. */
const settle = () => {
  arriving.value = false
  showHint.value = false
}

const grab = (event: PointerEvent) => {
  if (props.revealed || submitted.value) return
  ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
  pointers.set(event.pointerId, [event.clientX, event.clientY])
  settle()
  if (pointers.size === 2) pinchStart = { spread: spread(), scale: scale.value }
  else dragFrom = [event.clientX, event.clientY]
}

const drag = (event: PointerEvent) => {
  if (!pointers.has(event.pointerId)) return
  pointers.set(event.pointerId, [event.clientX, event.clientY])

  if (pointers.size >= 2 && pinchStart?.spread) {
    const factor = spread() / pinchStart.spread
    scale.value = clamp(
      pinchStart.scale * factor,
      TRUE_SIZE_SCALE_RANGE.min,
      TRUE_SIZE_SCALE_RANGE.max
    )
    return
  }
  if (!dragFrom) return
  // Screen pixels into stage units: `meet` fits the frame's longer side to the
  // element's shorter one, so one ratio serves both axes.
  const box = (event.currentTarget as Element).getBoundingClientRect()
  const perPixel = frame.value.span / Math.min(box.width, box.height)
  drift.value = [
    drift.value[0] + (event.clientX - dragFrom[0]) * perPixel,
    drift.value[1] + (event.clientY - dragFrom[1]) * perPixel,
  ]
  dragFrom = [event.clientX, event.clientY]
}

const release = (event: PointerEvent) => {
  pointers.delete(event.pointerId)
  if (pointers.size < 2) pinchStart = undefined
  if (!pointers.size) dragFrom = undefined
}

const wheelScale = (event: WheelEvent) => {
  if (props.revealed || submitted.value) return
  settle()
  nudgeScale(Math.exp(-event.deltaY * 0.0012))
}

const commit = () => {
  if (submitted.value || props.revealed) return
  submitted.value = true
  committed.value = scale.value
  emit('finished', scale.value)
}

const subjectArea = computed(() => areaLine(props.challenge.subject))
const anchorArea = computed(() => areaLine(props.challenge.anchor))

function areaLine(isoCode: TrueSizeChallenge['subject']): string {
  const area = COUNTRIES[isoCode].geography.area.total
  return area ? `${Math.round(area.amount).toLocaleString()} km²` : ''
}

let hintTimeout: ReturnType<typeof setTimeout> | undefined
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
  showHint.value = true
  hintTimeout = setTimeout(() => (showHint.value = false), HINT_MS)
  // One frame at the approach position, then the drift home plays as a
  // transition rather than a tween this component has to drive.
  requestAnimationFrame(() => requestAnimationFrame(() => (arriving.value = false)))
})
onBeforeUnmount(() => {
  clearTimeout(hintTimeout)
  tableObserver?.disconnect()
})

// A missed LAST question redeals in place — the counter doesn't advance, so
// the keyed remount never happens. The reveal ending re-arms the table.
watch(
  () => props.revealed,
  revealed => {
    if (revealed) return
    scale.value = 1
    committed.value = undefined
    submitted.value = false
    drift.value = [0, 0]
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

.light-table {
  flex: 1 1 auto;
  min-height: 0;
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
    touch-action: none;
    cursor: grab;
    user-select: none;
    -webkit-user-select: none;

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

.ghost {
  filter: drop-shadow(0 0.3rem 0.5rem ink(0.22));

  &.arriving {
    opacity: 0;
  }

  &:not(.arriving) {
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

.chip-area {
  opacity: 0.7;
  font-variant-numeric: tabular-nums;
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
}

@media screen and (max-width: $tablet) {
  .true-size-stage {
    gap: 1rem;
  }

  .light-table {
    width: 100%;
  }

  .legend {
    font-size: 0.85em;
  }

  footer {
    gap: 1.2rem;
    width: 100%;
    flex-flow: column nowrap;
    align-items: stretch;

    .scale-rail {
      padding: 1.2rem 0.4rem;
    }

    :deep(.button) {
      width: 100%;
    }
  }
}

@media (prefers-reduced-motion: reduce) {
  .ghost,
  .ghost.settling {
    transition: none;
  }
}
</style>
