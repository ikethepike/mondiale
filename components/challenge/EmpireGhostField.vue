<template>
  <div class="empire-ghost-field" aria-hidden="true">
    <!-- Mirrors the live camera viewBox each frame (the ConflictDotField
         technique), preserveAspectRatio=none so map coordinates land exactly
         where the map draws them. The ghost's d is written imperatively —
         Vue's vnode diff never sees per-frame geometry. -->
    <!-- The blur lives on the svg ELEMENT: an inline svg is an HTML box, so
         its CSS filter is true screen pixels — on an inner <g> the radius is
         local map units, which a zoomed camera stretches into a smear. -->
    <svg
      v-if="viewBox"
      :viewBox="`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`"
      preserveAspectRatio="none"
      :style="blurStyle"
    >
      <g class="ghost-layer" :class="{ hidden: !visible, revealed }">
        <path v-if="revealed || pastPeak" class="ghost-scar" :d="peakPath" />
        <path ref="ghostEl" class="ghost-extent" :style="{ strokeWidth: ghostStroke }" />
      </g>
      <g v-if="revealed">
        <path
          v-for="capital in capitals"
          :key="capital.name"
          class="capital-star"
          :d="starPath"
          :transform="`translate(${capital.x} ${capital.y}) scale(${starScale})`"
        />
      </g>
    </svg>
    <template v-if="revealed">
      <span
        v-for="chip in capitalChips"
        :key="chip.label"
        class="chip map-caption"
        :style="{ left: `${chip.left}%`, top: `${chip.top}%`, '--i': chip.index }"
      >
        ★ {{ chip.label }}
      </span>
    </template>
  </div>
</template>
<script lang="ts" setup>
import { useEmpireMorph } from '~~/lib/useEmpireMorph'
import { prefersReducedMotion } from '~~/lib/motion'

/**
 * The animated empire extent: a single-hue umber ghost that morphs through
 * its keyframes over the blanked map. Holds still whenever the underlying map
 * is tappable (beat 2 fades it out entirely; the reveal state is static and
 * moves only under the player's finger on the scrubber).
 */
const props = defineProps<{
  /** Keyframe paths in map space, index-aligned with `years`. */
  paths: string[]
  years: number[]
  peakYear: number
  /** BORDERPRECISION per keyframe (1 vague … 3 precise) — vaguer is blurrier. */
  precisions?: number[]
  /** Reveal treatment: scar + capitals on, ink thinned so tints read through. */
  revealed?: boolean
  capitals?: { name: string; x: number; y: number }[]
}>()

const emit = defineEmits<{ year: [year: number]; progress: [t: number] }>()

const ghostEl = ref<SVGPathElement>()
const visible = ref(true)
const currentIndex = ref(0)

const viewBox = ref<{ x: number; y: number; w: number; h: number }>()
let frame: number | undefined
let mapSvg: SVGSVGElement | null = null
let lastRaw = ''

const readViewBox = () => {
  frame = requestAnimationFrame(readViewBox)
  mapSvg ??= document.querySelector('.game-map svg')
  const attribute = mapSvg?.getAttribute('viewBox') ?? ''
  if (attribute === lastRaw) return
  lastRaw = attribute
  const raw = attribute.split(/\s+/).map(Number)
  if (raw.length === 4 && raw.every(Number.isFinite)) {
    viewBox.value = { x: raw[0]!, y: raw[1]!, w: raw[2]!, h: raw[3]! }
  }
}

/** Stroke and star sizes counter-scale off the camera so zoom never balloons them. */
const ghostStroke = computed(() => `${(viewBox.value?.w ?? 2000) * 0.0012}px`)
const starScale = computed(() => ((viewBox.value?.w ?? 2000) / 2000) * 1.4)
/** A 5-point star, unit-ish size, centred on the origin. */
const starPath =
  'M 0,-6 L 1.8,-1.9 L 6,-1.9 L 2.6,0.9 L 3.7,5 L 0,2.4 L -3.7,5 L -2.6,0.9 L -6,-1.9 L -1.8,-1.9 z'

const peakPath = computed(() => props.paths[Math.max(0, props.years.indexOf(props.peakYear))] ?? '')

/** Coarse frames render softer — vagueness as honesty. Screen-space blur, so
 *  the feathering holds at every zoom. */
const blurStyle = computed(() => {
  const precision = props.precisions?.[currentIndex.value] ?? 2
  const base = props.revealed ? 0.5 : ({ 1: 1.6, 2: 1.1, 3: 0.8 }[precision] ?? 1.1)
  return { filter: `blur(${base}px)` }
})

/** Past the peak, the high-water scar surfaces under the shrinking extent. */
const pastPeak = computed(() => {
  const peakIndex = Math.max(0, props.years.indexOf(props.peakYear))
  return currentIndex.value > peakIndex
})

const capitalChips = computed(() => {
  const vb = viewBox.value
  if (!vb?.w || !props.capitals?.length) return []
  return props.capitals
    .map((capital, index) => ({
      label: capital.name,
      left: ((capital.x - vb.x) / vb.w) * 100,
      top: ((capital.y - vb.y) / vb.h) * 100 - 3,
      index,
    }))
    .filter(chip => chip.left > 2 && chip.left < 98 && chip.top > 4 && chip.top < 96)
})

const morph = useEmpireMorph({
  onFrame: (d, opacity) => {
    const el = ghostEl.value
    if (!el) return
    el.setAttribute('d', d)
    el.style.fillOpacity = String(props.revealed ? Math.min(opacity, 0.15) : opacity)
  },
  onYear: year => {
    // Track which keyframe we're nearest for the precision blur, cheaply.
    const index = props.years.findIndex(
      (keyframeYear, i) => year <= keyframeYear || i === props.years.length - 1
    )
    if (index !== currentIndex.value) currentIndex.value = index
    emit('year', year)
  },
  onProgress: t => emit('progress', t),
})

const build = () => morph.build(props.paths, props.years, props.peakYear)
const play = () => {
  if (prefersReducedMotion()) return morph.seek(0)
  morph.play()
}
const freezeAtPeak = () => morph.freezeAtPeak(!prefersReducedMotion())
/** t ∈ [0, K−1] — the scrubber's and reduced-motion stepping's entry point. */
const seek = (t: number) => morph.seek(t)
const fadeOut = () => (visible.value = false)
const fadeIn = () => (visible.value = true)

defineExpose({ build, play, freezeAtPeak, seek, fadeOut, fadeIn })

onMounted(readViewBox)
onBeforeUnmount(() => {
  if (frame !== undefined) cancelAnimationFrame(frame)
  morph.dispose()
})
</script>
<style lang="scss" scoped>
.empire-ghost-field {
  inset: 0;
  position: absolute;
  pointer-events: none;

  svg {
    width: 100%;
    height: 100%;
    display: block;
  }
}

.ghost-layer {
  opacity: 1;
  transition: opacity var(--motion-base) var(--ease-smooth);

  &.hidden {
    opacity: 0;
  }
}

// Aged red ink — the cartographer's hue: warm and saturated enough that the
// wash never goes khaki over the parchment. One hue; opacity does all the
// narrating (fill-opacity is engine-driven per frame).
.ghost-extent {
  fill: hsl(16, 52%, 40%);
  stroke: hsl(16, 58%, 30%);
  stroke-opacity: 0.6;
  stroke-linejoin: round;
  stroke-linecap: round;
}

.revealed .ghost-extent {
  stroke-opacity: 0.8;
}

// The high-water memory: the peak extent as a stain the map remembers.
.ghost-scar {
  fill: hsl(16, 52%, 40%);
  fill-opacity: 0.07;
  stroke: none;
}

.capital-star {
  fill: hsl(45, 85%, 55%);
  stroke: hsla(215.7, 76.4%, 21.6%, 0.75);
  stroke-width: 0.6px;
  animation: star-bloom 0.9s var(--ease-out-expressive) 2;
  transform-origin: center;
  transform-box: fill-box;
}

@keyframes star-bloom {
  0% {
    opacity: 0.4;
  }
  50% {
    opacity: 1;
  }
  100% {
    opacity: 0.9;
  }
}

.chip {
  opacity: 0;
  position: absolute;
  transform: translate(-50%, -100%);
  padding: 0.15rem 0.7rem;
  font-size: 1.15rem;
  font-weight: bold;
  animation: chip-in 0.35s var(--ease-smooth) forwards;
  animation-delay: calc(var(--i) * 60ms + 300ms);
}

@keyframes chip-in {
  from {
    opacity: 0;
    transform: translate(-50%, -70%);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -100%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ghost-layer {
    transition: none;
  }
  .capital-star {
    animation: none;
    opacity: 0.9;
  }
  .chip {
    animation: none;
    opacity: 1;
  }
}
</style>
