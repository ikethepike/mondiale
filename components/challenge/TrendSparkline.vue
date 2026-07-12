<template>
  <figure class="trend-sparkline">
    <svg :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" preserveAspectRatio="none" aria-hidden="true">
      <polyline :points="points" pathLength="1" :class="{ draw: animateIn }" />
    </svg>
    <span v-if="!hideValues" class="delta-chip">{{ delta }}</span>
    <figcaption>
      <span class="endpoint">
        <strong v-if="!hideValues" class="value">{{ formatNumber(first[1]) }}</strong>
        <span class="year">{{ first[0] }}</span>
      </span>
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
import { formatNumber } from '~~/lib/number'
import { TREND_METRICS, type TrendMetricId, type TrendSeries } from '~~/lib/trends'

/**
 * One country's history as a single-hue polyline: endpoints labelled
 * `year` + value, a signed delta chip, y-domain pinned to the metric's scale
 * when bounded (the same context the ScalePlot tracks give bare indices).
 * `hideValues` is trajectory-match's shape-only state; `animateIn` draws the
 * line in on reveal — never ambient.
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

const WIDTH = 100
const HEIGHT = 42
const PAD = 3

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

const points = computed(() => {
  const { min, max } = domain.value
  const [firstYear] = first.value
  const [lastYear] = last.value
  const yearSpan = Math.max(1, lastYear - firstYear)
  return props.series
    .map(([year, amount]) => {
      const x = PAD + ((year - firstYear) / yearSpan) * (WIDTH - PAD * 2)
      const clamped = Math.max(min, Math.min(max, amount))
      const y = PAD + (1 - (clamped - min) / (max - min)) * (HEIGHT - PAD * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
})

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
  position: relative;
  flex-flow: column nowrap;
}

svg {
  width: 100%;
  height: 6rem;
  display: block;

  polyline {
    fill: none;
    stroke: var(--dark-blue);
    stroke-width: 0.25rem;
    stroke-linecap: round;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;

    &.draw {
      stroke-dasharray: 1;
      stroke-dashoffset: 1;
      animation: sparkline-draw 0.9s var(--ease-out-expressive) forwards;
    }
  }
}

@keyframes sparkline-draw {
  to {
    stroke-dashoffset: 0;
  }
}

.delta-chip {
  top: 0;
  right: 0;
  position: absolute;
  font-size: 1.2rem;
  font-weight: bold;
  padding: 0.2rem 0.6rem;
  border-radius: 0.8rem;
  color: var(--dark-blue);
  background: hsla(215.7, 76.4%, 21.6%, 0.08);
}

figcaption {
  display: flex;
  font-size: 1.2rem;
  color: var(--dark-blue);
  justify-content: space-between;

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
