<template>
  <figure class="trend-sparkline" :class="{ 'is-chart': isChart }">
    <div class="plot">
      <span v-if="xTicks.length" class="x-tick">
        <span
          v-for="(tick, index) in xTicks"
          :key="`x-${tick.year}`"
          class="x-tick-label"
          :class="{ middle: index > 0 && index < xTicks.length - 1 }"
          :style="index > 0 && index < xTicks.length - 1 ? { '--tick-x': `${tick.x}%` } : undefined"
          >{{ tick.year }}</span
        >
      </span>
      <div ref="plotFrame" class="plot-frame">
        <span
          v-for="tick in yTicks"
          :key="`y-${tick.value}`"
          class="y-tick"
          :style="{ top: `${tick.y}%` }"
          >{{ tick.label }}</span
        >
        <svg
          :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
          preserveAspectRatio="none"
          aria-hidden="true"
          :class="{ draw: animateIn }"
        >
          <!-- Gridlines ride under the data: horizontal rules survive the
               non-uniform scale that would squash any <text>. -->
          <line
            v-for="tick in yTicks"
            :key="`grid-${tick.value}`"
            class="gridline"
            x1="0"
            :y1="tick.y"
            :x2="WIDTH"
            :y2="tick.y"
          />
          <path :d="path" />
          <line
            v-if="readout"
            class="hairline"
            :x1="readout.x"
            y1="0"
            :x2="readout.x"
            :y2="HEIGHT"
          />
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
          :style="{ top: `${isChart ? chartChipTop : chipTop}%` }"
        >
          {{ delta }}
        </span>
        <span v-if="isChart && !hideValues" class="end-label" :style="{ top: `${endLabelTop}%` }">
          {{ formatTrendValue(last[1], metric) }}
        </span>
        <span
          v-if="readout"
          class="read-dot"
          :style="{ left: `${readout.x}%`, top: `${readout.y}%` }"
        />
        <Transition name="caption">
          <span v-if="readout" class="read-tip" role="status" :style="tipStyle">
            <strong>{{ formatTrendValue(readout.amount, metric) }}</strong>
            <span class="tip-year">{{ readout.year }}</span>
          </span>
        </Transition>
        <div
          v-if="interactive"
          class="hit-layer"
          tabindex="0"
          role="img"
          :aria-label="summary"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @pointerleave="onPointerLeave"
          @blur="readIndex = undefined"
          @keydown.left.prevent="step(-1)"
          @keydown.right.prevent="step(1)"
        />
      </div>
      <button
        v-if="isChart && expandable"
        type="button"
        class="expand-button"
        title="Expand the chart"
        aria-label="Expand the chart"
        @click="expanded = true"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M6 2H2v4M10 14h4v-4M2 2l5 5M14 14l-5-5" />
        </svg>
      </button>
    </div>
    <figcaption :class="{ 'source-only': isChart }">
      <span v-if="!isChart" class="endpoint">
        <strong v-if="!hideValues" class="value">{{ formatNumber(first[1]) }}</strong>
        <span class="year">{{ first[0] }}</span>
      </span>
      <SourceInfo class="series-source" :attributions="[trendAttribution(metric, last[0])]" />
      <span v-if="!isChart" class="endpoint end">
        <strong v-if="!hideValues" class="value">
          {{ formatTrendValue(last[1], metric) }}
        </strong>
        <span class="year">{{ last[0] }}</span>
      </span>
    </figcaption>
    <table v-if="isChart && !hideValues" class="visually-hidden">
      <caption>
        {{
          summary
        }}
      </caption>
      <thead>
        <tr>
          <th scope="col">Year</th>
          <th scope="col">{{ metricLabel }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="[year, amount] in series" :key="year">
          <th scope="row">{{ year }}</th>
          <td>{{ formatTrendValue(amount, metric) }}</td>
        </tr>
      </tbody>
    </table>
    <ExpandDock v-if="expandable" v-model:open="expanded" tall :label="summary">
      <TrendSparkline
        class="docked-chart"
        :series="series"
        :metric="metric"
        detail="chart"
        :expandable="false"
      />
    </ExpandDock>
  </figure>
</template>
<script lang="ts" setup>
import ExpandDock from '~/components/feedback/ExpandDock.vue'
import SourceInfo from '~/components/feedback/SourceInfo.vue'
import { trendAttribution } from '~~/lib/attribution'
import { monotoneCurvePath, niceTicks, type ChartPoint } from '~~/lib/charts'
import { clamp, formatNumber } from '~~/lib/number'
import {
  formatTrendValue,
  TREND_METRICS,
  type TrendMetricId,
  type TrendSeries,
} from '~~/lib/trends'
import { useIsCoarsePointer } from '~~/lib/use-viewport'

/**
 * One country's history as a single-hue curve: endpoints labelled
 * `year` + value, a signed delta chip that gives way to the line (below the
 * endpoint when the series finishes high, above when it finishes low), and
 * an end marker ringed in the surface colour. Y-domain pins to the metric's
 * scale when bounded. `hideValues` is trajectory-match's shape-only state;
 * `animateIn` draws the line in on reveal — never ambient.
 *
 * `detail: 'chart'` is the post-reveal voice: axes, a scrub readout, a direct
 * end label and a tap-to-expand dock, for the beat where the chart stops being
 * a riddle and becomes the thing you study. The curve's geometry is identical
 * at both levels — axis gutters are CSS padding, never viewBox units — so
 * 'spark' renders exactly what it always did.
 */
const props = withDefaults(
  defineProps<{
    series: TrendSeries
    metric: TrendMetricId
    hideValues?: boolean
    animateIn?: boolean
    detail?: 'spark' | 'chart'
    /** The docked copy renders itself; it must not offer its own dock. */
    expandable?: boolean
  }>(),
  { hideValues: false, animateIn: false, detail: 'spark', expandable: true }
)

// The viewBox doubles as a percentage space (0–100 wide) so the HTML end-dot
// and chip can share the svg's coordinates without measuring anything.
const WIDTH = 100
const HEIGHT = 100
const PAD_X = 3
const PAD_Y = 8

const isChart = computed(() => props.detail === 'chart')
const expanded = ref(false)
const isCoarsePointer = useIsCoarsePointer()

const first = computed(() => props.series[0] ?? [0, 0])
const last = computed(() => props.series[props.series.length - 1] ?? [0, 0])

const domain = computed(() => {
  const scale = TREND_METRICS[props.metric].scale
  // `scale.invert` means higher = worse (corruption, inequality) — a semantic
  // flag for the copy, NOT a request to flip the axis. Bottom is always min.
  if (scale) return { min: scale.min, max: scale.max }
  const amounts = props.series.map(([, amount]) => amount)
  const min = Math.min(...amounts)
  const max = Math.max(...amounts)
  // Flat series still deserve a visible line rather than a divide-by-zero.
  return max > min ? { min, max } : { min: min - 1, max: max + 1 }
})

const toY = (amount: number) => {
  const { min, max } = domain.value
  return PAD_Y + (1 - (clamp(amount, min, max) - min) / (max - min)) * (HEIGHT - PAD_Y * 2)
}

const chartPoints = computed<ChartPoint[]>(() => {
  const [firstYear] = first.value
  const [lastYear] = last.value
  const yearSpan = Math.max(1, lastYear - firstYear)
  return props.series.map(([year, amount]) => ({
    x: PAD_X + ((year - firstYear) / yearSpan) * (WIDTH - PAD_X * 2),
    y: toY(amount),
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

// At chart detail the end label hugs the endpoint and the chip steps a full
// row clear of it — both are pinned right, so a shared row would overlap.
const CHIP_CLEARANCE = 18
const endLabelTop = computed(() => clamp(endPoint.value.y - 9, 0, 82))
const chartChipTop = computed(() =>
  chipBelow.value
    ? Math.min(endLabelTop.value + CHIP_CLEARANCE, 76)
    : Math.max(endLabelTop.value - CHIP_CLEARANCE, 0)
)

const metricLabel = computed(() => TREND_METRICS[props.metric].label)

const summary = computed(
  () =>
    `${metricLabel.value}, ${first.value[0]} to ${last.value[0]}: ` +
    `${formatTrendValue(first.value[1], props.metric)} to ` +
    `${formatTrendValue(last.value[1], props.metric)}`
)

const yTicks = computed(() => {
  if (!isChart.value) return []
  const { min, max } = domain.value
  return niceTicks(min, max, 3).map(value => ({
    value,
    label: formatTrendValue(value, props.metric, { compact: true }),
    y: toY(value),
  }))
})

// Years are indexed from the series, never nice-stepped: a label must name a
// year the data actually holds, and a nice step would sit outside the plot.
const xTicks = computed(() => {
  if (!isChart.value || props.series.length < 2) return []
  const points = chartPoints.value
  const lastIndex = props.series.length - 1
  const indices =
    props.series.length >= 5 ? [0, Math.floor(lastIndex / 2), lastIndex] : [0, lastIndex]
  return indices.map(index => ({ year: props.series[index][0], x: points[index].x }))
})

const delta = computed(() => {
  const change = last.value[1] - first.value[1]
  return `${change >= 0 ? '▲ +' : '▼ −'}${formatNumber(Math.abs(change))}`
})

// --- Scrub readout -------------------------------------------------------
const plotFrame = ref<HTMLElement>()
const readIndex = ref<number>()
const scrubbing = ref(false)

/** Axes and the readout ride together; both stay off while values are hidden. */
const interactive = computed(() => isChart.value && !props.hideValues)

const readAt = (clientX: number) => {
  const box = plotFrame.value?.getBoundingClientRect()
  const points = chartPoints.value
  if (!box?.width || !points.length) return
  const percent = ((clientX - box.left) / box.width) * WIDTH
  let nearest = 0
  points.forEach((point, index) => {
    if (Math.abs(point.x - percent) < Math.abs(points[nearest].x - percent)) nearest = index
  })
  readIndex.value = nearest
}

const onPointerDown = (event: PointerEvent) => {
  scrubbing.value = true
  // Capturing keeps the drag alive past the plot's edge, and stops a host card
  // from reading the travel as a tap of its own.
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
  readAt(event.clientX)
}

// A mouse reads on hover; a finger only while it is down.
const onPointerMove = (event: PointerEvent) => {
  if (!scrubbing.value && isCoarsePointer.value) return
  readAt(event.clientX)
}

const onPointerUp = () => {
  scrubbing.value = false
  // Touch leaves its readout parked to be read; a mouse keeps hover semantics.
  if (isCoarsePointer.value) readIndex.value = undefined
}

const onPointerLeave = () => {
  if (!scrubbing.value) readIndex.value = undefined
}

const step = (direction: number) => {
  const lastIndex = props.series.length - 1
  const from = readIndex.value ?? (direction > 0 ? -1 : lastIndex + 1)
  readIndex.value = clamp(from + direction, 0, lastIndex)
}

const readout = computed(() => {
  const index = readIndex.value
  if (index === undefined || !interactive.value) return undefined
  const point = chartPoints.value[index]
  const entry = props.series[index]
  return point && entry ? { ...point, year: entry[0], amount: entry[1] } : undefined
})

// The tip is centre-anchored; clamping its centre to a band keeps a short
// readout inside the plot at either edge without measuring the text.
const tipStyle = computed(() => {
  const point = readout.value
  return point ? { left: `${clamp(point.x, 20, 80)}%`, top: `${point.y}%` } : {}
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

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

.plot-frame {
  position: relative;
}

svg {
  width: 100%;
  height: var(--sparkline-height, 6rem);
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

// The axes carry the endpoints at chart detail, so the caption keeps only the
// provenance — and the nudge that aligned it against the endpoint stacks goes.
figcaption.source-only {
  justify-content: center;

  .series-source {
    margin-top: 0;
  }
}

// --- Chart detail --------------------------------------------------------
.is-chart {
  --sparkline-height: 11rem;

  @media (max-width: $phone) {
    --sparkline-height: 9rem;
  }

  // Gutters in rem, not viewBox units: the labels are rem-sized text, and a
  // percentage gutter would shrink with the svg's height under its
  // non-uniform scale. The inner .plot-frame keeps every data overlay's
  // percentage measured against the same box the svg fills.
  .plot {
    padding-left: 3.6rem;
    // Room for the year row, and beneath it the expand control.
    padding-bottom: 4.6rem;
  }
}

.gridline {
  stroke: ink(0.12);
  stroke-width: 0.1rem;
  vector-effect: non-scaling-stroke;
}

.hairline {
  stroke: ink(0.35);
  stroke-width: 0.1rem;
  vector-effect: non-scaling-stroke;
}

.y-tick,
.x-tick {
  position: absolute;
  font-size: 1.1rem;
  color: ink(0.55);
  white-space: nowrap;
  pointer-events: none;
  font-variant-numeric: tabular-nums;
}

// Inside the frame so its percentage matches the svg it labels, hung out into
// the gutter the frame's own padding reserved.
.y-tick {
  left: -0.4rem;
  width: 3.2rem;
  text-align: right;
  transform: translate(-100%, -50%);
}

// The x-ticks span the frame, not the padded box, so they inherit the same
// left gutter the svg starts after. Centring every tick would push the last
// one past the card's edge, so the outer two anchor to their own side and
// only the middle tick rides its point.
.x-tick {
  left: 3.6rem;
  right: 0;
  bottom: 2.8rem;
  display: flex;
  justify-content: space-between;
}

.x-tick-label {
  &.middle {
    // Nudged onto its own data point rather than the band's centre.
    position: absolute;
    left: var(--tick-x);
    transform: translateX(-50%);
  }
}

.end-label {
  right: 0;
  position: absolute;
  font-size: 1.2rem;
  font-weight: 600;
  padding: 0.1rem 0.5rem;
  border-radius: 0.6rem;
  color: var(--dark-blue);
  pointer-events: none;
  font-variant-numeric: tabular-nums;
  background: color-mix(in srgb, var(--dark-blue) 8%, var(--background-color));
}

// No entrance animation: a readout that fades in lags the pointer and reads
// as broken. It appears the instant the scrub finds its point.
.read-dot {
  width: 0.9rem;
  height: 0.9rem;
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
  background: var(--dark-blue);
  box-shadow: 0 0 0 0.2rem milk(0.9);
  transform: translate(-50%, -50%);
}

.read-tip {
  gap: 0.5rem;
  z-index: 5;
  display: flex;
  position: absolute;
  font-size: 1.3rem;
  max-width: 100%;
  align-items: baseline;
  white-space: nowrap;
  pointer-events: none;
  padding: 0.3rem 0.9rem;
  border-radius: 0.8rem;
  color: var(--dark-blue);
  background: milk(0.96);
  border: 0.1rem solid ink(0.25);
  box-shadow: 0 2px 8px ink(0.15);
  font-variant-numeric: tabular-nums;
  transform: translate(-50%, calc(-100% - 1.2rem));

  .tip-year {
    opacity: 0.6;
  }
}

// The scrub surface opts itself into pointer events — the challenge shell is
// a passthrough, and self-contained components opt back in.
.hit-layer {
  inset: 0;
  position: absolute;
  pointer-events: auto;
  // pan-y, never none: the chart claims the horizontal scrub while a vertical
  // swipe still scrolls the card it sits in.
  touch-action: pan-y;

  &:focus-visible {
    outline: 0.2rem solid var(--dark-blue);
    outline-offset: 0.2rem;
  }
}

// Bottom-left, in the gutter corner the axes leave empty: the top-right belongs
// to the end label and delta chip, which are the chart's own readouts.
.expand-button {
  left: 0;
  bottom: 0;
  z-index: 6;
  width: 3.2rem;
  height: 3.2rem;
  padding: 0;
  display: flex;
  cursor: pointer;
  position: absolute;
  appearance: none;
  background: none;
  align-items: center;
  justify-content: center;
  color: var(--dark-blue);
  pointer-events: auto;
  touch-action: manipulation;
  border: 0;
  opacity: 0.55;
  transition: opacity var(--motion-quick) var(--ease-out-expressive);

  svg {
    width: 1.4rem;
    height: 1.4rem;
    display: block;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  @media (hover: hover) {
    &:hover {
      opacity: 1;
    }
  }

  &:focus-visible {
    opacity: 1;
  }
}

// Inside the dock the chart takes the whole frame.
.docked-chart {
  --sparkline-height: 100%;

  width: 100%;
  height: 100%;
}
</style>
