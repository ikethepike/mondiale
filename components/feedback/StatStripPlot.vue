<template>
  <figure class="stat-strip-plot">
    <div class="swarm" @mouseleave="hovered = undefined">
      <button
        type="button"
        class="chip mode-toggle"
        :aria-pressed="showFlags"
        @click="showFlags = !showFlags"
      >
        {{ showFlags ? 'dots' : 'flags' }}
      </button>
      <!-- Every country with data, as a quiet swarm; hover reads any point. -->
      <span
        v-for="dot in dots"
        :key="dot.iso"
        class="dot"
        :class="{ 'as-flag': showFlags }"
        :style="{ left: `${dot.x}%`, top: `${dot.y}%` }"
        @mouseenter="hovered = dot"
      >
        <CountryFlag
          v-if="showFlags"
          class="dot-flag"
          :country="getCountry(dot.iso)"
          mode="background"
        />
      </span>
      <!-- The protagonists: verdict-ringed, drawn over the swarm. -->
      <span
        v-for="mark in marks"
        :key="mark.iso"
        class="mark"
        :class="[mark.kind, { 'as-flag': showFlags }]"
        :style="{ left: `${mark.x}%`, top: `${mark.y}%` }"
        @mouseenter="hovered = mark"
      >
        <CountryFlag
          v-if="showFlags"
          class="dot-flag"
          :country="getCountry(mark.iso)"
          mode="background"
        />
      </span>
      <Transition name="caption">
        <div
          v-if="hovered"
          class="tooltip"
          :style="{ left: `${hovered.x}%`, top: `${hovered.y}%` }"
        >
          <strong>{{ hovered.name }}</strong> · {{ hovered.display }}
        </div>
      </Transition>
      <div class="axis" aria-hidden="true" />
    </div>
    <figcaption class="legend">
      <span v-for="mark in legend" :key="mark.iso" class="chip legend-chip" :class="mark.kind">
        <span class="legend-swatch" aria-hidden="true" />
        {{ mark.name }} · {{ mark.display }}
      </span>
    </figcaption>
  </figure>
</template>
<script lang="ts" setup>
import CountryFlag from '~/components/country/CountryFlag.vue'
import { COUNTRIES } from '~~/data/countries.gen'
import { TRENDS } from '~~/data/trends.gen'
import { countryName, getCountry } from '~~/lib/country'
import { formatNumber } from '~~/lib/number'
import { TREND_METRICS, type TrendMetricId } from '~~/lib/trends'
import { getValueByAccessorID } from '~~/lib/values'
import type { GroupChallengeAccessorId } from '~~/types/challenges/group-challenge.type'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * A one-axis "gapminder" strip: every country plotted on one stat, with the
 * round's protagonists ringed in the verdict colours — the `target` (truth)
 * and the `decoy` (lie / wrong pick) — and any `noted` countries emphasised
 * without a verdict. Values come from an accessor (two-truths) or from a
 * trend metric's latest series point (trend race), never both.
 *
 * Fills its host's width (size with a width rule + `--swarm-height` on the
 * host). Hover reads any point via the tooltip; the flags toggle swaps the
 * anonymous swarm for background-mode flags (inline mode would collide on
 * shared SVG ids — see CountryFlag).
 */
const props = defineProps<{
  accessorId?: GroupChallengeAccessorId
  /** Plot the latest point of every country's series for this trend metric. */
  metric?: TrendMetricId
  /** The country the round is about — plotted at its TRUE value. */
  target?: ISOCountryCode
  /** The verdict's counterpart: the lie's source, or a wrong pick. */
  decoy?: ISOCountryCode
  /** Also-rans worth finding in the swarm, marked without verdict colours. */
  noted?: ISOCountryCode[]
}>()

/** Percent-space plot band: x margins clear the edges, y jitters mid-band. */
const PLOT_LEFT = 3
const PLOT_WIDTH = 94
const BAND_CENTER = 46
const BAND_HEIGHT = 62

const showFlags = ref(false)

interface PlotPoint {
  iso: ISOCountryCode
  x: number
  y: number
  name: string
  display: string
}
const hovered = ref<PlotPoint>()

/** Deterministic jitter so the swarm holds still between renders. */
const jitter = (iso: string) => {
  let hash = 0
  for (const char of iso) hash = (hash * 31 + char.charCodeAt(0)) % 997
  return (hash / 997 - 0.5) * BAND_HEIGHT
}

const entries = computed(() => {
  const isoCodes = Object.keys(COUNTRIES) as ISOCountryCode[]
  return isoCodes.flatMap(iso => {
    if (props.metric) {
      const latest = TRENDS[iso]?.[props.metric]?.at(-1)
      if (!latest || !Number.isFinite(latest[1])) return []
      return [{ iso, amount: latest[1], unit: TREND_METRICS[props.metric].unit }]
    }
    if (!props.accessorId) return []
    const value = getValueByAccessorID(iso, props.accessorId)
    if (!value || !Number.isFinite(value.amount)) return []
    return [{ iso, amount: value.amount, unit: value.unit }]
  })
})

const scale = computed(() => {
  const amounts = entries.value.map(entry => entry.amount)
  const min = Math.min(...amounts)
  const max = Math.max(...amounts)
  // Populations and GDPs span orders of magnitude — a linear axis piles the
  // world onto one pixel. Go logarithmic when the spread calls for it.
  const logarithmic = min > 0 && max / min > 50
  const lo = logarithmic ? Math.log10(min) : min
  const hi = logarithmic ? Math.log10(max) : max
  const span = hi - lo || 1
  return (amount: number) => {
    const v = logarithmic ? Math.log10(amount) : amount
    return PLOT_LEFT + ((v - lo) / span) * PLOT_WIDTH
  }
})

const display = (amount: number, unit: string | undefined) =>
  `${formatNumber(amount)}${unit ? ` ${unit}` : ''}`

/** Marked countries with their verdict role, protagonists last (drawn on top). */
const marked = computed<{ iso: ISOCountryCode; kind: 'truth' | 'lie' | 'noted' }[]>(() => [
  ...(props.noted ?? []).map(iso => ({ iso, kind: 'noted' as const })),
  ...(props.decoy ? [{ iso: props.decoy, kind: 'lie' as const }] : []),
  ...(props.target ? [{ iso: props.target, kind: 'truth' as const }] : []),
])

const dots = computed<PlotPoint[]>(() => {
  const excluded = new Set(marked.value.map(mark => mark.iso))
  return entries.value
    .filter(entry => !excluded.has(entry.iso))
    .map(entry => ({
      iso: entry.iso,
      x: scale.value(entry.amount),
      y: BAND_CENTER + jitter(entry.iso),
      name: countryName(entry.iso),
      display: display(entry.amount, entry.unit),
    }))
})

const marks = computed(() =>
  marked.value.flatMap(({ iso, kind }) => {
    const entry = entries.value.find(candidate => candidate.iso === iso)
    if (!entry) return []
    return [
      {
        iso,
        kind,
        x: scale.value(entry.amount),
        y: BAND_CENTER + jitter(iso),
        name: countryName(iso),
        display: display(entry.amount, entry.unit),
      },
    ]
  })
)

/** Noted also-rans stay out of the legend — their cards carry the numbers. */
const legend = computed(() => marks.value.filter(mark => mark.kind !== 'noted'))
</script>
<style lang="scss" scoped>
.stat-strip-plot {
  margin: 0;
  width: 100%;
}

.swarm {
  width: 100%;
  position: relative;
  height: var(--swarm-height, 10rem);
}

.axis {
  left: 0;
  right: 0;
  bottom: 0;
  height: 1px;
  position: absolute;
  background: hsla(215.7, 76.4%, 21.6%, 0.25);
}

.mode-toggle {
  top: -0.6rem;
  right: 0;
  z-index: 4;
  cursor: pointer;
  position: absolute;
  font-size: 1.1rem;
  font-family: inherit;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 0.2rem 0.9rem;
  border-radius: 1rem;
  color: var(--dark-blue);
  background: hsla(36, 100%, 98%, 0.9);
  border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.25);
}

// A comfortable hit area around a small visual dot.
.dot,
.mark {
  width: 1.6rem;
  height: 1.6rem;
  display: flex;
  position: absolute;
  align-items: center;
  justify-content: center;
  transform: translate(-50%, -50%);

  &::before {
    content: '';
    border-radius: 50%;
  }

  &:hover {
    z-index: 3;
  }
}

.dot::before {
  width: 0.55rem;
  height: 0.55rem;
  background: hsla(215.7, 76.4%, 21.6%, 0.18);
  transition: transform var(--motion-quick) var(--ease-out-expressive);
}

.dot:hover::before {
  background: var(--soft-blue);
  transform: scale(1.8);
}

.mark {
  z-index: 2;

  &::before {
    width: 0.8rem;
    height: 0.8rem;
    box-shadow: 0 0 0 0.3rem hsla(36, 100%, 98%, 0.9);
  }

  // The ring, clear of the dot like the old SVG halo.
  &::after {
    content: '';
    inset: -0.15rem;
    position: absolute;
    border-radius: 50%;
    border: 0.15rem solid;
  }

  &.truth::before {
    background: hsl(170.5, 34.7%, 45%);
  }
  &.truth::after {
    border-color: hsl(170.5, 34.7%, 45%);
  }
  &.lie::before {
    background: var(--hior-ange);
  }
  &.lie::after {
    border-color: var(--hior-ange);
  }
  &.noted::before {
    background: hsla(215.7, 76.4%, 21.6%, 0.55);
  }
  &.noted::after {
    border-color: hsla(215.7, 76.4%, 21.6%, 0.35);
  }
}

// Flag mode: the swarm keeps its geometry, every point becomes a tiny flag.
.dot.as-flag,
.mark.as-flag {
  width: 2rem;
  height: 1.5rem;

  &::before {
    display: none;
  }

  .dot-flag {
    width: 100%;
    height: 100%;
    border-radius: 0.2rem;
    box-shadow: 0 1px 2px hsla(215.7, 76.4%, 21.6%, 0.3);
    transition: transform var(--motion-quick) var(--ease-out-expressive);
  }

  &:hover .dot-flag {
    transform: scale(1.5);
  }
}

// Protagonists outsize the crowd so their rings read in dense clusters.
.mark.as-flag {
  width: 2.8rem;
  height: 2.1rem;
  z-index: 3;

  &::after {
    inset: -0.35rem;
    border-radius: 0.4rem;
    box-shadow: 0 0 0 0.35rem hsla(36, 100%, 98%, 0.85);
  }
}

.tooltip {
  z-index: 5;
  position: absolute;
  font-size: 1.3rem;
  white-space: nowrap;
  pointer-events: none;
  padding: 0.3rem 0.9rem;
  border-radius: 0.8rem;
  color: var(--dark-blue);
  transform: translate(-50%, calc(-100% - 1.2rem));
  background: hsla(36, 100%, 98%, 0.96);
  border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.25);
  box-shadow: 0 2px 8px hsla(215.7, 76.4%, 21.6%, 0.15);
}

.legend {
  gap: 0.8rem;
  display: flex;
  flex-wrap: wrap;
  margin-top: 0.6rem;
  justify-content: center;
}

.legend-chip {
  font-variant-numeric: tabular-nums;

  &.truth .legend-swatch {
    background: hsl(170.5, 34.7%, 45%);
  }
  &.lie .legend-swatch {
    background: var(--hior-ange);
  }
}

.legend-swatch {
  width: 0.9rem;
  height: 0.9rem;
  border-radius: 50%;
  display: inline-block;
}
</style>
