<template>
  <figure class="population-pyramid" :class="{ annotated }">
    <svg :viewBox="`0 0 ${width} ${HEIGHT}`" preserveAspectRatio="xMidYMid meet" role="img">
      <title>{{ title }}</title>
      <g :transform="`translate(${gutter} 0)`">
        <template v-if="annotated">
          <line
            v-for="guide in guides"
            :key="guide"
            class="guide"
            x1="0"
            :x2="WIDTH"
            :y1="guide"
            :y2="guide"
          />
        </template>
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
        <path v-if="ghostPath" class="ghost" :d="ghostPath" />
        <template v-for="mark in scarBars" :key="mark.key">
          <rect
            class="scar"
            :x="mark.bar.maleX - 1.6"
            :y="mark.bar.y - 0.5"
            :width="mark.bar.maleWidth + mark.bar.femaleWidth + 3.2"
            :height="mark.bar.height + 1"
            :rx="(mark.bar.height + 1) / 2"
          />
          <text class="scar-label" :x="MIDLINE + mark.bar.femaleWidth + 2.6" :y="mark.bar.labelY">
            {{ PYRAMID_COHORTS[mark.bar.index] }}
          </text>
        </template>
      </g>
      <g v-if="annotated" class="ages">
        <text v-for="tick in ticks" :key="tick.age" :x="gutter - 1.2" :y="tick.y">
          {{ tick.age }}
        </text>
      </g>
    </svg>
    <figcaption v-if="caption" class="caption">{{ caption }}</figcaption>
  </figure>
</template>

<script lang="ts" setup>
import {
  PYRAMID_CHART,
  PYRAMID_CHILD_COHORTS,
  PYRAMID_COHORTS,
  PYRAMID_ELDER_COHORT,
  pyramidCohortAge,
  pyramidFrameAt,
  pyramidPeakShare,
  pyramidScarIndex,
  type PyramidScar,
} from '~~/lib/pyramids'
import { countryName } from '~~/lib/country'
import type { ISOCountryCode } from '~~/types/geography.types'

const { width: WIDTH, height: HEIGHT, ageGutter: AGE_GUTTER } = PYRAMID_CHART
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
  scars: { type: Array as PropType<PyramidScar[]>, default: () => [] },
  /** Another country's outline at the same frame and scale, for comparison. */
  ghost: { type: String as PropType<ISOCountryCode>, default: undefined },
  /** Age ticks, and guides at 15 and 65 — the lines the shape families are drawn on. */
  annotated: { type: Boolean, default: false },
  /** Withhold the country from the accessible title while it is the question. */
  anonymous: { type: Boolean, default: false },
  caption: { type: String, default: '' },
})

const gutter = computed(() => (props.annotated ? AGE_GUTTER : 0))
const width = computed(() => WIDTH + gutter.value)

const ownPeak = computed(() =>
  pyramidPeakShare(props.ghost ? [props.isoCode, props.ghost] : [props.isoCode])
)
const domain = computed(() => props.peak ?? ownPeak.value)

const current = computed(() => pyramidFrameAt(props.isoCode, props.frame))

const title = computed(() => {
  const subject = props.anonymous
    ? 'Age structure'
    : `Age structure of ${countryName(props.isoCode)}`
  return current.value ? `${subject} in ${current.value.year}` : subject
})

const rows = PYRAMID_COHORTS.length
const rowHeight = (HEIGHT - BAR_GAP * (rows - 1)) / rows
/** Cohorts run youngest-first in the data and youngest-at-the-BOTTOM on screen. */
const rowTop = (index: number) => HEIGHT - (index + 1) * rowHeight - index * BAR_GAP
const half = MIDLINE - 1.5

const bars = computed(() => {
  const frame = current.value
  if (!frame) return []
  const radius = Math.min(0.5, rowHeight / 3)
  return frame.male.map((maleShare, index) => {
    const y = rowTop(index)
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

const ghostPath = computed(() => {
  if (!props.ghost) return undefined
  const frame = pyramidFrameAt(props.ghost, props.frame)
  if (!frame) return undefined
  const side = (shares: number[], sign: -1 | 1) =>
    shares
      .map((share, index) => {
        const x = MIDLINE + sign * (share / domain.value) * half
        const bottom = rowTop(index) + rowHeight + BAR_GAP / 2
        const top = rowTop(index) - BAR_GAP / 2
        return `${index ? 'L' : 'M'}${x.toFixed(2)} ${bottom.toFixed(2)}L${x.toFixed(2)} ${top.toFixed(2)}`
      })
      .join('')
  return side(frame.male, -1) + side(frame.female, 1)
})

const boundaryY = (cohort: number) => rowTop(cohort - 1) - BAR_GAP / 2

const guides = [boundaryY(PYRAMID_CHILD_COHORTS), boundaryY(PYRAMID_ELDER_COHORT)]

const ticks = [
  { age: 0, y: HEIGHT },
  ...[PYRAMID_CHILD_COHORTS, PYRAMID_ELDER_COHORT].map(cohort => ({
    age: pyramidCohortAge(cohort),
    y: boundaryY(cohort) + 1,
  })),
  { age: 100, y: 2.4 },
]

const scarBars = computed(() => {
  const frame = current.value
  if (!frame) return []
  return props.scars.flatMap(scar => {
    const index = pyramidScarIndex(scar, frame.year)
    const bar = index === undefined ? undefined : bars.value[index]
    return bar ? [{ key: scar.bornFrom, bar }] : []
  })
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
  fill: var(--pyramid-male);
}
.female rect {
  fill: var(--pyramid-female);
}

.spine {
  stroke: #{ink(0.2)};
  stroke-width: 0.22;
}

.guide {
  stroke: #{ink(0.28)};
  stroke-width: 0.25;
  stroke-dasharray: 0.8 0.8;
}

.ages text {
  fill: #{ink(0.5)};
  font-size: 2.8px;
  font-family: inherit;
  text-anchor: end;
  font-variant-numeric: tabular-nums;
}

.ghost {
  fill: none;
  stroke: var(--hior-ange);
  stroke-width: 0.5;
  stroke-dasharray: 1.2 0.8;
  stroke-linejoin: round;
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
  font-size: 1.05rem;
  letter-spacing: 0.08em;
  font-variant-numeric: tabular-nums;
  color: #{ink(0.55)};
}
</style>
