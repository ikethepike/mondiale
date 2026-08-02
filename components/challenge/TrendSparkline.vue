<template>
  <figure class="trend-sparkline">
    <div class="plot">
      <svg
        :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
        preserveAspectRatio="none"
        aria-hidden="true"
        :class="{ draw: animateIn }"
      >
        <path :d="path" />
      </svg>
      <span
        class="end-dot"
        :class="{ draw: animateIn }"
        :style="{ left: `${endPoint.x}%`, top: `${endPoint.y}%` }"
      />
      <span
        v-if="!hideValues"
        class="delta-chip"
        :class="{ draw: animateIn, below: chipBelow }"
        :style="{ top: `${chipTop}%` }"
      >
        {{ delta }}
      </span>
    </div>
    <figcaption>
      <span class="endpoint">
        <strong v-if="!hideValues" class="value">{{ formatNumber(first[1]) }}</strong>
        <span class="year">{{ first[0] }}</span>
      </span>
      <SourceInfo class="series-source" :attributions="[trendAttribution(metric, last[0])]" />
      <span class="endpoint end">
        <strong v-if="!hideValues" class="value">
          {{ formatNumber(last[1]) }}{{ unitSuffix }}
        </strong>
        <span class="year">{{ last[0] }}</span>
      </span>
    </figcaption>
  </figure>
</template>
<script lang="ts" setup>
import SourceInfo from '~/components/feedback/SourceInfo.vue'
import { trendAttribution } from '~~/lib/attribution'
import { monotoneCurvePath, type ChartPoint } from '~~/lib/charts'
import { clamp, formatNumber } from '~~/lib/number'
import { TREND_METRICS, type TrendMetricId, type TrendSeries } from '~~/lib/trends'

/**
 * One country's history as a single-hue curve: endpoints labelled
 * `year` + value, a signed delta chip that gives way to the line (below the
 * endpoint when the series finishes high, above when it finishes low), and
 * an end marker ringed in the surface colour. Y-domain pins to the metric's
 * scale when bounded. `hideValues` is trajectory-match's shape-only state;
 * `animateIn` draws the line in on reveal — never ambient.
 */
const props = withDefaults(
  defineProps<{
    series: TrendSeries
    metric: TrendMetricId
    hideValues?: boolean
    animateIn?: boolean
  }>(),
  { hideValues: false, animateIn: false }
)

// The viewBox doubles as a percentage space (0–100 wide) so the HTML end-dot
// and chip can share the svg's coordinates without measuring anything.
const WIDTH = 100
const HEIGHT = 100
const PAD_X = 3
const PAD_Y = 8

const first = computed(() => props.series[0] ?? [0, 0])
const last = computed(() => props.series[props.series.length - 1] ?? [0, 0])

const domain = computed(() => {
  const scale = TREND_METRICS[props.metric].scale
  if (scale) return { min: scale.min, max: scale.max }
  const amounts = props.series.map(([, amount]) => amount)
  const min = Math.min(...amounts)
  const max = Math.max(...amounts)
  // Flat series still deserve a visible line rather than a divide-by-zero.
  return max > min ? { min, max } : { min: min - 1, max: max + 1 }
})

const chartPoints = computed<ChartPoint[]>(() => {
  const { min, max } = domain.value
  const [firstYear] = first.value
  const [lastYear] = last.value
  const yearSpan = Math.max(1, lastYear - firstYear)
  return props.series.map(([year, amount]) => ({
    x: PAD_X + ((year - firstYear) / yearSpan) * (WIDTH - PAD_X * 2),
    y: PAD_Y + (1 - (clamp(amount, min, max) - min) / (max - min)) * (HEIGHT - PAD_Y * 2),
  }))
})

const path = computed(() => monotoneCurvePath(chartPoints.value))

const endPoint = computed(() => chartPoints.value[chartPoints.value.length - 1] ?? { x: 0, y: 0 })

// The chip yields to the line: under the endpoint when the series finishes
// in the top half, over it when it finishes low — never struck through.
const chipBelow = computed(() => endPoint.value.y < 50)
const chipTop = computed(() =>
  chipBelow.value ? Math.min(endPoint.value.y + 14, 70) : Math.max(endPoint.value.y - 44, 0)
)

const unitSuffix = computed(() => {
  const { unit } = TREND_METRICS[props.metric]
  return unit === '%' ? '%' : ` ${unit}`
})

const delta = computed(() => {
  const change = last.value[1] - first.value[1]
  return `${change >= 0 ? '▲ +' : '▼ −'}${formatNumber(Math.abs(change))}`
})
</script>
<style lang="scss" scoped>
.trend-sparkline {
  gap: 0.4rem;
  margin: 0;
  width: 100%;
  display: flex;
  flex-flow: column nowrap;
}

.plot {
  position: relative;
}

svg {
  width: 100%;
  height: 6rem;
  display: block;
  // The end marker's surface ring may kiss the edges of the plot box.
  overflow: visible;

  // Draw-in is a clip wipe, NOT stroke-dasharray: pathLength dashes interact
  // with non-scaling-stroke under this svg's non-uniform scaling — browsers
  // scale the dash pattern per segment, and the pattern's gap ate the middle
  // of the line. The wipe clips the css box, immune to all stroke math.
  // The -1rem slack keeps the round caps and edge-kissing dot unclipped.
  &.draw {
    clip-path: inset(-1rem 100% -1rem -1rem);
    animation: sparkline-wipe 0.9s var(--ease-out-expressive) forwards;
  }

  path {
    fill: none;
    stroke: var(--dark-blue);
    stroke-width: 2px;
    stroke-linecap: round;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }
}

@keyframes sparkline-wipe {
  to {
    clip-path: inset(-1rem);
  }
}

@media (prefers-reduced-motion: reduce) {
  svg.draw {
    animation: none;
    clip-path: none;
  }

  .end-dot.draw,
  .delta-chip.draw {
    animation: none;
    opacity: 1;
  }
}

// The series' end marker: ≥8px dot ringed in the surface colour so it stays
// legible over the line it terminates.
.end-dot {
  width: 0.9rem;
  height: 0.9rem;
  position: absolute;
  border-radius: 50%;
  background: var(--dark-blue);
  border: 0.2rem solid var(--background-color);
  transform: translate(-50%, -50%);

  &.draw {
    opacity: 0;
    animation: fade-in 0.3s var(--ease-out-expressive) 0.75s forwards;
  }
}

.delta-chip {
  right: 0;
  position: absolute;
  font-size: 1.2rem;
  font-weight: bold;
  padding: 0.2rem 0.6rem;
  border-radius: 0.8rem;
  color: var(--dark-blue);
  // Opaque: the ink wash composited onto the surface, so the line can pass
  // beneath the chip without striking through its text.
  background: color-mix(in srgb, var(--dark-blue) 8%, var(--background-color));

  &.draw {
    opacity: 0;
    animation: row-land 0.3s var(--ease-out-expressive) 0.85s forwards;
  }
}

figcaption {
  display: flex;
  font-size: 1.2rem;
  color: var(--dark-blue);
  align-items: flex-start;
  justify-content: space-between;

  // The series' provenance sits between the endpoints, where the eye already
  // reads the years the source published.
  .series-source {
    margin-top: -0.4rem;
  }

  .endpoint {
    gap: 0.1rem;
    display: flex;
    flex-flow: column nowrap;

    &.end {
      text-align: right;
    }
  }

  .value {
    font-size: 1.4rem;
  }

  .year {
    opacity: 0.6;
  }
}
</style>
