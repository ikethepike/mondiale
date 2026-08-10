<template>
  <div ref="root" class="conflict-dot-field" :style="frameStyle" aria-hidden="true">
    <!-- Mirrors the committed camera box (pans in between ride the container's
         compositor transform). `boxStyle` pins this to the map's PAINTED rect,
         so preserveAspectRatio=none is an exact identity and map coordinates
         land where the map draws them — anchoring to our own containing block
         instead let the map's recede scale slide the dots off their country.
         The svg paints a bleed past every edge so the ride-along never slides
         unpainted ground into view. Dot radius counter-scales so zoom never
         balloons it. -->
    <svg
      v-if="fieldBox"
      :viewBox="`${fieldBox.x} ${fieldBox.y} ${fieldBox.w} ${fieldBox.h}`"
      :style="boxStyle"
      preserveAspectRatio="none"
    >
      <!-- The neighbour sketch: the ring of countries AROUND the answer, never
           the answer's own shape. Drawn under the dots so it reads as ground,
           not as a subject. -->
      <path
        v-for="ring in sketchRings"
        :key="ring.iso"
        class="sketch"
        :d="ring.d"
        :stroke-width="sketchWidth"
      />
      <circle
        v-for="dot in dots"
        :key="`${dot.x}:${dot.y}`"
        class="dot"
        :cx="dot.x"
        :cy="dot.y"
        :r="dotRadius"
        :style="{ '--o': dot.opacity, '--i': dot.index }"
      />
      <circle
        v-for="dot in abroadDots"
        :key="`a${dot.x}:${dot.y}`"
        class="dot abroad"
        :cx="dot.x"
        :cy="dot.y"
        :r="dotRadius"
        :style="{ '--o': dot.opacity, '--i': dot.index }"
      />
    </svg>
    <span
      v-for="chip in chips"
      :key="chip.label"
      class="chip map-caption"
      :style="{ left: `${chip.left}%`, top: `${chip.top}%` }"
    >
      {{ chip.label }}
    </span>
  </div>
</template>
<script lang="ts" setup>
import { MAP_PATHS } from '~~/data/map.gen'
import type { ISOCountryCode } from '~~/types/geography.types'
import { CONFLICT_ERAS, type ConflictField } from '~~/types/vendor/ucdp/ucdp.types'
import { bleedBox, useMapPanTrack, useMapViewBox, WORLD_MAP_WIDTH } from '~~/lib/use-map-viewbox'

/**
 * A country's recorded conflict history as dots in map space, arriving one era
 * wave at a time. One hue; only opacity steps with recency. Each wave enters
 * with a single staggered fade and then holds still — the dots sit over the
 * tappable map, so nothing may keep moving.
 */
const props = defineProps<{
  field: ConflictField
  /** How many of the field's era waves are visible. */
  shownWaves: number
  /** Reveal turns the label off — the dots stay, the scaffolding goes. */
  showChip?: boolean
  /** Reveal-only second layer: the country's engagements on foreign soil,
   *  in the companion amber. All of it lands at once. */
  abroad?: ConflictField
  /** The hint ladder's spatial rung: neighbours to sketch around the cloud.
   *  Never the subject's own outline — that would answer the round. */
  sketch?: ISOCountryCode[]
}>()

const { viewBox } = useMapViewBox()
const root = ref<HTMLElement>()
const { boxStyle, frameStyle } = useMapPanTrack(root)

/** The committed camera grown by the overlay bleed — what the svg draws. */
const fieldBox = computed(() => (viewBox.value?.w ? bleedBox(viewBox.value) : undefined))

/** ~0.16% of the visible width — reads as a pinpoint at any camera height. */
const dotRadius = computed(() => (viewBox.value?.w ?? WORLD_MAP_WIDTH) * 0.0016)

/** Counter-scaled with the camera, like the dots, so zoom never fattens the
 *  sketch into a border. */
const sketchWidth = computed(() => (viewBox.value?.w ?? WORLD_MAP_WIDTH) * 0.0012)

/** Neighbour outlines in world-map space — the same coordinates the dots use,
 *  so they need no projection of their own. */
const sketchRings = computed(() =>
  (props.sketch ?? []).flatMap(iso => {
    const d = MAP_PATHS[iso]
    return d ? [{ iso, d }] : []
  })
)

/** Older waves sit back; the newest carries the ink. */
const waveOpacity = (wave: number) => {
  const waves = props.field.eras.length
  return waves === 1 ? 0.9 : 0.28 + (wave / (waves - 1)) * 0.62
}

const dots = computed(() =>
  props.field.eras.slice(0, props.shownWaves).flatMap((era, wave) =>
    era.points.map(([x, y], index) => ({
      x,
      y,
      opacity: waveOpacity(wave),
      index: Math.min(index, 40),
    }))
  )
)

const abroadDots = computed(() => {
  const eras = props.abroad?.eras ?? []
  return eras.flatMap((era, wave) =>
    era.points.map(([x, y], index) => ({
      x,
      y,
      opacity: eras.length === 1 ? 0.75 : 0.24 + (wave / (eras.length - 1)) * 0.51,
      index: Math.min(index, 40),
    }))
  )
})

/** One label, for the wave that's currently landing — wave centroids sit
 *  nearly on top of each other, so stacked chips would just collide. */
const chips = computed(() => {
  const vb = viewBox.value
  const era = props.field.eras[props.shownWaves - 1]
  if (!vb?.w || !era || props.showChip === false) return []
  const [sumX, sumY] = era.points.reduce(([x, y], point) => [x + point[0], y + point[1]], [0, 0])
  const left = ((sumX / era.points.length - vb.x) / vb.w) * 100
  const top = ((sumY / era.points.length - vb.y) / vb.h) * 100
  if (left < 4 || left > 96 || top < 6 || top > 94) return []
  return [{ label: CONFLICT_ERAS[era.era] ?? '', left, top }]
})
</script>
<style lang="scss" scoped>
// Both boxes come inline from useMapPanTrack, pinned to the map's painted
// rect — one source. These are only the pre-measurement fallback.
.conflict-dot-field {
  inset: 0;
  position: absolute;
  pointer-events: none;

  svg {
    position: absolute;
    display: block;
  }
}

// Ground, not subject: unfilled, hairline, and well under the dots' weight —
// enough to say "this is the neighbourhood", never enough to be read as the
// answer's own shape.
.sketch {
  fill: none;
  opacity: 0;
  stroke: currentColor;
  stroke-linejoin: round;
  animation: sketch-in var(--motion-slow) var(--ease-smooth) forwards;
}

@keyframes sketch-in {
  to {
    opacity: 0.32;
  }
}

.dot {
  opacity: 0;
  fill: var(--hior-ange);
  animation: dot-in 0.4s ease-out forwards;
  animation-delay: calc(var(--i) * 30ms);

  // The warm companion to the ember home dots: same family, clearly a
  // second category — "its conflicts, someone else's soil".
  &.abroad {
    fill: hsl(35, 82%, 52%);
  }
}

@keyframes dot-in {
  to {
    opacity: var(--o);
  }
}

.chip {
  opacity: 0;
  position: absolute;
  transform: translate(-50%, -50%);
  padding: 0.15rem 0.7rem;
  font-size: 1.15rem;
  font-weight: bold;
  animation: chip-in 0.35s var(--ease-smooth) forwards;
  animation-delay: 300ms;
}

// chip-in comes from rules/_animations.scss

@media (prefers-reduced-motion: reduce) {
  .dot,
  .chip,
  .sketch {
    animation: none;
  }
  .dot {
    opacity: var(--o);
  }
  .chip {
    opacity: 1;
  }
  .sketch {
    opacity: 0.32;
  }
}
</style>
