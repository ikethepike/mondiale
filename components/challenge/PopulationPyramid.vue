<template>
  <figure class="population-pyramid">
    <svg :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" preserveAspectRatio="xMidYMid meet" role="img">
      <title>{{ title }}</title>
      <g class="male">
        <rect
          v-for="bar in bars"
          :key="`m-${bar.index}`"
          :x="bar.maleX"
          :y="bar.y"
          :width="bar.maleWidth"
          :height="bar.height"
          :rx="bar.radius"
        />
      </g>
      <g class="female">
        <rect
          v-for="bar in bars"
          :key="`f-${bar.index}`"
          :x="MIDLINE"
          :y="bar.y"
          :width="bar.femaleWidth"
          :height="bar.height"
          :rx="bar.radius"
        />
      </g>
      <line class="spine" :x1="MIDLINE" y1="0" :x2="MIDLINE" :y2="HEIGHT" />
      <!-- The scar bracket: the cohort the reveal is talking about, tracked to
           whichever frame is on screen (a generation climbs a bin every five
           years, so a fixed index would point at the wrong bar). -->
      <template v-if="scarBar">
        <rect
          class="scar"
          :x="scarBar.maleX - 1.6"
          :y="scarBar.y - 0.5"
          :width="scarBar.maleWidth + scarBar.femaleWidth + 3.2"
          :height="scarBar.height + 1"
          :rx="(scarBar.height + 1) / 2"
        />
        <text class="scar-label" :x="MIDLINE + scarBar.femaleWidth + 2.6" :y="scarBar.labelY">
          {{ PYRAMID_COHORTS[scarBar.index] }}
        </text>
      </template>
    </svg>
    <figcaption v-if="caption" class="caption">{{ caption }}</figcaption>
  </figure>
</template>

<script lang="ts" setup>
import {
  PYRAMID_COHORTS,
  pyramidFrameAt,
  pyramidPeakShare,
  pyramidScarIndex,
  type PyramidScar,
} from '~~/lib/pyramids'
import { countryName } from '~~/lib/country'
import type { ISOCountryCode } from '~~/types/geography.types'

const WIDTH = 100
/** Taller than it is wide: a pyramid is 21 stacked cohorts, and the shape only
 *  reads when the rows have room. The host sizes the box; this is the ratio. */
const HEIGHT = 88
const MIDLINE = WIDTH / 2
/** Gap between cohort bars, in viewBox units. */
const BAR_GAP = 0.55

const props = defineProps({
  isoCode: { type: String as PropType<ISOCountryCode>, required: true },
  /** Real-valued ladder position (0 … frames-1); fractional values interpolate. */
  frame: { type: Number, default: 0 },
  /**
   * The share every bar is measured against. Pass ONE value shared by every
   * pyramid on screen so a bar's length means the same thing across cards.
   * Omitted, the country is scaled against its own history instead — right for
   * a lone pyramid read against itself over time, wrong for a row of rivals.
   */
  peak: { type: Number, default: undefined },
  scar: { type: Object as PropType<PyramidScar | undefined>, default: undefined },
  caption: { type: String, default: '' },
})

const ownPeak = computed(() => pyramidPeakShare([props.isoCode]))
const domain = computed(() => props.peak ?? ownPeak.value)

const current = computed(() => pyramidFrameAt(props.isoCode, props.frame))

const title = computed(() =>
  current.value
    ? `Age structure of ${countryName(props.isoCode)} in ${current.value.year}`
    : `Age structure of ${countryName(props.isoCode)}`
)

const bars = computed(() => {
  const frame = current.value
  if (!frame) return []
  const rows = frame.male.length
  const rowHeight = (HEIGHT - BAR_GAP * (rows - 1)) / rows
  const half = MIDLINE - 1.5
  const radius = Math.min(0.5, rowHeight / 3)
  return frame.male.map((maleShare, index) => {
    // Cohorts run youngest-first in the data and youngest-at-the-BOTTOM on screen.
    const y = HEIGHT - (index + 1) * rowHeight - index * BAR_GAP
    const maleWidth = (maleShare / domain.value) * half
    const femaleWidth = (frame.female[index] / domain.value) * half
    return {
      index,
      y,
      height: rowHeight,
      radius,
      maleWidth,
      femaleWidth,
      maleX: MIDLINE - maleWidth,
      labelY: y + rowHeight * 0.85,
    }
  })
})

const scarBar = computed(() => {
  const frame = current.value
  if (!props.scar || !frame) return undefined
  const index = pyramidScarIndex(props.scar, frame.year)
  return index === undefined ? undefined : bars.value[index]
})
</script>

<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.population-pyramid {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

svg {
  width: 100%;
  height: auto;
  display: block;
  overflow: visible;
}

.male rect {
  fill: var(--pyramid-male, #{ink(0.85)});
}
.female rect {
  fill: var(--pyramid-female, hsl(340, 52%, 52%));
}

.spine {
  stroke: #{ink(0.2)};
  stroke-width: 0.22;
}

.scar {
  fill: none;
  stroke: var(--hior-ange);
  stroke-width: 0.45;
  animation: scar-breathe 1.8s ease-in-out infinite;
}

.scar-label {
  fill: var(--hior-ange);
  // viewBox units, not CSS pixels — sized against the 100-wide box.
  font-size: 3.4px;
  font-family: inherit;
}

@keyframes scar-breathe {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

@media (prefers-reduced-motion: reduce) {
  .scar {
    animation: none;
  }
}

.caption {
  text-align: center;
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  font-variant-numeric: tabular-nums;
  color: #{ink(0.55)};
}
</style>
