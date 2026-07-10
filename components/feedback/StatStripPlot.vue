<template>
  <figure class="stat-strip-plot">
    <svg class="strip" viewBox="0 0 320 84" preserveAspectRatio="xMidYMid meet">
      <line class="axis" x1="10" y1="72" x2="310" y2="72" />
      <!-- Every country with data, as a quiet swarm; hover one to compare. -->
      <circle
        v-for="dot in dots"
        :key="dot.iso"
        class="dot"
        :cx="dot.x"
        :cy="dot.y"
        r="2.6"
      >
        <title>{{ dot.name }} — {{ dot.display }}</title>
      </circle>
      <!-- The two protagonists: the real country and the lie's source. -->
      <g v-for="mark in marks" :key="mark.iso" class="mark" :class="mark.kind">
        <circle class="mark-halo" :cx="mark.x" :cy="mark.y" r="7" />
        <circle class="mark-dot" :cx="mark.x" :cy="mark.y" r="4" />
        <title>{{ mark.name }} — {{ mark.display }}</title>
      </g>
    </svg>
    <figcaption class="legend">
      <span v-for="mark in marks" :key="mark.iso" class="chip legend-chip" :class="mark.kind">
        <span class="legend-swatch" aria-hidden="true" />
        {{ mark.name }} · {{ mark.display }}
      </span>
    </figcaption>
  </figure>
</template>
<script lang="ts" setup>
import { COUNTRIES } from '~~/data/countries.gen'
import { countryName } from '~~/lib/country'
import { formatNumber } from '~~/lib/number'
import { getValueByAccessorID } from '~~/lib/values'
import type { GroupChallengeAccessorId } from '~~/types/challenges/group-challenge.type'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * A one-axis "gapminder" strip: every country plotted on the stat the lie
 * borrowed, with the real country (truth) and the lie's source (decoy)
 * ringed in the verdict colours. Desktop hover reads any dot via its title.
 */
const props = defineProps<{
  accessorId: GroupChallengeAccessorId
  /** The country the round is about — plotted at its TRUE value. */
  target: ISOCountryCode
  /** Where the lie's number really comes from. */
  decoy: ISOCountryCode
}>()

const PLOT_LEFT = 12
const PLOT_WIDTH = 296
const BAND_CENTER = 42
const BAND_HEIGHT = 44

/** Deterministic jitter so the swarm holds still between renders. */
const jitter = (iso: string) => {
  let hash = 0
  for (const char of iso) hash = (hash * 31 + char.charCodeAt(0)) % 997
  return (hash / 997 - 0.5) * BAND_HEIGHT
}

const entries = computed(() => {
  const isoCodes = Object.keys(COUNTRIES) as ISOCountryCode[]
  return isoCodes.flatMap(iso => {
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

const dots = computed(() =>
  entries.value
    .filter(entry => entry.iso !== props.target && entry.iso !== props.decoy)
    .map(entry => ({
      iso: entry.iso,
      x: scale.value(entry.amount),
      y: BAND_CENTER + jitter(entry.iso),
      name: countryName(entry.iso),
      display: display(entry.amount, entry.unit),
    }))
)

const marks = computed(() =>
  (['target', 'decoy'] as const).flatMap(kind => {
    const iso = kind === 'target' ? props.target : props.decoy
    const entry = entries.value.find(candidate => candidate.iso === iso)
    if (!entry) return []
    return [
      {
        iso,
        kind: kind === 'target' ? 'truth' : 'lie',
        x: scale.value(entry.amount),
        y: BAND_CENTER + jitter(iso),
        name: countryName(iso),
        display: display(entry.amount, entry.unit),
      },
    ]
  })
)
</script>
<style lang="scss" scoped>
.stat-strip-plot {
  margin: 0;
  width: min(46rem, 92vw);
}

.strip {
  width: 100%;
  display: block;
  overflow: visible;
}

.axis {
  stroke: hsla(215.7, 76.4%, 21.6%, 0.25);
  stroke-width: 1;
}

.dot {
  fill: hsla(215.7, 76.4%, 21.6%, 0.18);
  transform-box: fill-box;
  transform-origin: center;
  transition: transform var(--motion-quick) var(--ease-out-expressive);

  @media (hover: hover) {
    &:hover {
      fill: var(--soft-blue);
      transform: scale(1.8);
    }
  }
}

.mark {
  .mark-halo {
    fill: none;
    stroke-width: 1.5;
  }
  &.truth .mark-dot {
    fill: hsl(170.5, 34.7%, 45%);
  }
  &.truth .mark-halo {
    stroke: hsl(170.5, 34.7%, 45%);
  }
  &.lie .mark-dot {
    fill: var(--hior-ange);
  }
  &.lie .mark-halo {
    stroke: var(--hior-ange);
  }
}

.legend {
  gap: 0.8rem;
  display: flex;
  flex-wrap: wrap;
  margin-top: 0.4rem;
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
