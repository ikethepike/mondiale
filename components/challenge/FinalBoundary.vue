<template>
  <section v-if="scene" class="boundary-stage">
    <div class="easel-frame">
      <svg
        ref="stage"
        :viewBox="viewBoxAttr"
        @pointerdown="startStroke"
        @pointermove="extendStroke"
        @pointerup="endStroke"
        @pointercancel="endStroke"
      >
        <path class="blob" :d="blobPath" :style="{ strokeWidth: strokeWidth * 2 }" />
        <path
          v-for="(coast, index) in coastPaths"
          :key="index"
          class="coast"
          :d="coast"
          :style="{ strokeWidth }"
        />
        <text
          v-for="label in labels"
          :key="label.name"
          class="label"
          :x="label.x"
          :y="label.y"
          :style="{ fontSize: `${labelSize}px` }"
        >
          {{ label.name }}
        </text>
        <polyline
          v-if="revealed"
          class="true-line"
          pathLength="1"
          :points="pointsAttr(scene.line)"
          :style="{ strokeWidth: strokeWidth * 2.4 }"
        />
        <polyline
          v-if="points.length > 1"
          class="drawn-line"
          :class="{ judged: revealed }"
          :points="pointsAttr(points)"
          :style="{ strokeWidth: strokeWidth * 3 }"
        />
      </svg>
    </div>
    <nav v-if="!revealed" class="tools">
      <ButtonLine :disabled="!points.length || submitted" @click="clearLine">
        <span>Start over</span>
      </ButtonLine>
      <ButtonFilled :disabled="points.length < MINIMUM_POINTS || submitted" @click="submitLine">
        <span>Submit line</span>
      </ButtonFilled>
    </nav>
  </section>
</template>
<script lang="ts" setup>
import ButtonFilled from '~/components/button/ButtonFilled.vue'
import ButtonLine from '~/components/button/ButtonLine.vue'
import { COUNTRIES } from '~~/data/countries.gen'
import { boundaryScene } from '~~/lib/challenges/final-challenge'
import { countryName } from '~~/lib/country'
import { type OutlinePoint, resampleOpen, ringCentroid, STROKE_WIDTH_RATIO } from '~~/lib/outline'
import type { BoundaryChallenge } from '~~/types/challenges/final-challenge.type'

/**
 * The Boundary Commission's easel: the two neighbours as one merged blob —
 * fills touching, coasts stroked, the shared border unpainted — with the
 * player's line drawn straight onto the map-space SVG. At the reveal the true
 * border draws itself in over the attempt, both in the same ink so they read
 * as versions of one line, not a right-vs-wrong shout.
 */
const props = defineProps<{ challenge: BoundaryChallenge; revealed: boolean }>()

const emit = defineEmits<{ finished: [drawn: [number, number][]] }>()

/** Below this the line can't be judged — matches the sketch easel's gate. */
const MINIMUM_POINTS = 8
/** The shipped resolution: plenty for the 48-point deviation grading. */
const SHIPPED_POINTS = 64

const stage = ref<SVGSVGElement>()
const points = ref<OutlinePoint[]>([])
const submitted = ref(false)
let drawing = false

const scene = computed(() => boundaryScene(props.challenge.countries))

const viewBoxAttr = computed(() => scene.value?.frame.join(' ') ?? '')
const strokeWidth = computed(() => (scene.value?.span ?? 0) * STROKE_WIDTH_RATIO)
const labelSize = computed(() => (scene.value?.span ?? 0) * 0.045)

const closedPath = (ring: OutlinePoint[]) => `M ${ring.map(([x, y]) => `${x},${y}`).join(' L ')} Z`
const pointsAttr = (line: OutlinePoint[]) => line.map(([x, y]) => `${x},${y}`).join(' ')

// One path, both mainlands: the shared border sits between two fills of the
// same colour, so it simply isn't there. The blob strokes itself in its own
// fill colour to paint over the antialiasing seam where the fills meet.
const blobPath = computed(() => {
  const active = scene.value
  if (!active) return ''
  return `${closedPath(active.rings[0])} ${closedPath(active.rings[1])}`
})

const coastPaths = computed(
  () => scene.value?.coasts.map(run => `M ${run.map(([x, y]) => `${x},${y}`).join(' L ')}`) ?? []
)

// Which half is which — the pair is public, only the line between them isn't
const labels = computed(() => {
  const active = scene.value
  if (!active) return []
  return props.challenge.countries.map((isoCode, index) => {
    const [x, y] = ringCentroid(active.rings[index])
    return { name: countryName(COUNTRIES[isoCode]), x, y }
  })
})

const stagePoint = (event: PointerEvent): OutlinePoint | undefined => {
  const element = stage.value
  const matrix = element?.getScreenCTM()
  if (!element || !matrix) return undefined
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
  return [point.x, point.y]
}

const startStroke = (event: PointerEvent) => {
  if (submitted.value || props.revealed) return
  drawing = true
  stage.value?.setPointerCapture(event.pointerId)
  const point = stagePoint(event)
  if (point) points.value.push(point)
}

const extendStroke = (event: PointerEvent) => {
  if (!drawing || submitted.value) return
  const point = stagePoint(event)
  const previous = points.value[points.value.length - 1]
  if (!point || !previous) return
  // Thin out ultra-dense pointer samples, scaled to the frame
  if (Math.hypot(point[0] - previous[0], point[1] - previous[1]) < strokeWidth.value) return
  points.value.push(point)
}

const endStroke = () => {
  drawing = false
}

const clearLine = () => {
  points.value = []
}

const submitLine = () => {
  if (submitted.value || points.value.length < MINIMUM_POINTS) return
  submitted.value = true
  const shipped = resampleOpen(points.value, SHIPPED_POINTS).map(
    ([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100] as [number, number]
  )
  emit('finished', shipped)
}

// A missed LAST question redeals in place — the counter doesn't advance, so
// the keyed remount never happens. The reveal ending is the new-question
// signal: wipe the judged line and re-arm the easel.
watch(
  () => props.revealed,
  revealed => {
    if (!revealed) {
      points.value = []
      submitted.value = false
    }
  }
)
</script>
<style lang="scss" scoped>
@use 'sass:color';
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

// The land tone as OPAQUE paint: a translucent wash would let the two fills'
// antialiasing seam glow through as a faint trail along the erased border —
// the answer, readable by anyone squinting
$blob-land: color.mix(ink(), milk(), 8%);

.boundary-stage {
  flex: 1;
  gap: 1.6rem;
  display: flex;
  min-height: 0;
  align-items: center;
  flex-flow: column nowrap;
  justify-content: center;
  padding-bottom: 2.4rem;
}

.easel-frame {
  width: min(64rem, 88vw);
  height: min(40rem, 52vh);
  border-radius: 1.2rem;
  pointer-events: auto;
  backdrop-filter: blur(0.5rem);
  background: milk(0.9);
  border: 0.1rem solid ink(0.25);

  svg {
    width: 100%;
    height: 100%;
    display: block;
    cursor: crosshair;
    touch-action: none;
    // The drag is a pencil, not a caret — without this the stroke selects
    // the country labels
    user-select: none;
    -webkit-user-select: none;
  }
}

.blob {
  fill: $blob-land;
  stroke: $blob-land;
  stroke-linejoin: round;
}

.coast {
  fill: none;
  stroke: ink(0.8);
  stroke-linecap: round;
  stroke-linejoin: round;
}

.label {
  fill: ink(0.45);
  text-anchor: middle;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  pointer-events: none;
}

// One ink, two intensities: the attempt fades back as the truth draws in
.drawn-line {
  fill: none;
  stroke: ink(0.85);
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: stroke var(--motion-base) var(--ease-smooth);

  &.judged {
    stroke: ink(0.35);
  }
}

.true-line {
  fill: none;
  stroke: ink();
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: stroke-draw 1.4s var(--ease-smooth) 0.45s forwards;
}

.tools {
  gap: 1.2rem;
  display: flex;
  pointer-events: auto;
}

@media screen and (max-width: $tablet) {
  // Wider, shorter easel for finger drawing; full-width tools clear of the
  // home indicator — the sketch easel's recipe.
  .boundary-stage {
    padding: 0 1.6rem calc(1.6rem + var(--safe-bottom));
  }
  .easel-frame {
    width: min(94vw, 64rem);
    height: min(46dvh, 40rem);
  }
  .tools {
    width: 100%;

    :deep(.button) {
      flex: 1;
    }
  }
}

@media (prefers-reduced-motion: reduce) {
  .true-line {
    animation: none;
    stroke-dashoffset: 0;
  }
}
</style>
