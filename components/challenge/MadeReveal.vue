<template>
  <!-- Spans throughout: renders inside ChallengeResult's lesson <p>. -->
  <span class="made-reveal">
    <span class="header">
      <strong class="commodity">{{ challenge.commodity }}</strong>
      <span class="subtitle">
        a top export of {{ rows.length }}
        {{ rows.length === 1 ? 'country' : 'countries' }} — ranked by total goods exports
      </span>
    </span>
    <span class="rows">
      <span
        v-for="(row, index) in rows"
        :key="row.isoCode"
        class="row"
        :class="{ picked: row.isoCode === picked }"
        :style="{ '--i': index }"
      >
        <CountryFlag class="row-flag" :country="COUNTRIES[row.isoCode]" mode="background" />
        <span class="country">{{ row.name }}</span>
        <span class="bar">
          <span class="fill" :style="{ width: `${row.width}%` }" />
        </span>
        <span class="value">{{ row.display }}</span>
      </span>
    </span>
    <span v-if="pickedLine" class="picked-line" :style="{ '--i': rows.length }">
      {{ pickedLine }}
    </span>
  </span>
</template>
<script lang="ts" setup>
import CountryFlag from '~/components/country/CountryFlag.vue'
import { COUNTRIES } from '~~/data/countries.gen'
import { countryName } from '~~/lib/country'
import type { MadeChallenge } from '~~/types/challenges/final-challenge.type'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * The Made In scorecard: every country shipping the commodity, ranked by
 * total goods exports (the Factbook gives no per-commodity values), each
 * landing on its own beat with a shared-scale bar. A wrong pick gets its own
 * teaching line instead of vanishing.
 */
const props = defineProps<{
  challenge: MadeChallenge
  /** The player's answer, right or wrong. */
  picked?: ISOCountryCode
}>()

const compact = new Intl.NumberFormat('en', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
})

const rows = computed(() => {
  const exporters = Object.values(COUNTRIES).filter(country =>
    (country.economics.exports ?? []).includes(props.challenge.commodity)
  )
  const largest = Math.max(
    ...exporters.map(country => country.economics.exportsTotal?.amount ?? 0),
    1
  )
  return exporters
    .map(country => {
      const total = country.economics.exportsTotal?.amount
      return {
        isoCode: country.isoCode,
        name: countryName(country),
        total: total ?? 0,
        width: total ? Math.max(3, (total / largest) * 100) : 3,
        display: total ? compact.format(total) : '—',
      }
    })
    .sort((a, b) => b.total - a.total)
})

// A wrong pick teaches too: what the picked country actually ships
const pickedLine = computed(() => {
  if (!props.picked || rows.value.some(row => row.isoCode === props.picked)) return undefined
  const country = COUNTRIES[props.picked]
  const top = country.economics.exports?.slice(0, 3)
  return top?.length
    ? `Your pick, ${countryName(country)}, mostly ships ${top.join(', ')}.`
    : undefined
})
</script>
<style lang="scss" scoped>
.made-reveal {
  gap: 1.2rem;
  display: flex;
  flex-flow: column nowrap;
  padding: 0.8rem 0.6rem;
  min-width: min(42rem, 100%);
  max-height: min(52vh, 46rem);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.header {
  gap: 0.3rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;

  .commodity {
    font-size: 1.9rem;
    text-transform: capitalize;
  }

  .subtitle {
    opacity: 0.75;
    font-size: 1.3rem;
  }
}

.rows {
  gap: 0.45rem;
  display: flex;
  flex-flow: column nowrap;
}

.row {
  gap: 0.8rem;
  display: flex;
  opacity: 0;
  align-items: center;
  font-size: 1.4rem;
  border-radius: 0.6rem;
  animation: row-land 0.4s var(--ease-smooth) forwards;
  animation-delay: calc(var(--i) * 110ms);

  &.picked {
    padding: 0.2rem 0.5rem;
    margin: -0.2rem -0.5rem;
    background: hsla(45, 90%, 74%, 0.35);
  }

  .row-flag {
    width: 2.2rem;
    height: 1.5rem;
    flex-shrink: 0;
    border-radius: 0.2rem;
  }

  .country {
    width: 11rem;
    overflow: hidden;
    text-align: left;
    flex-shrink: 0;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .value {
    width: 5.4rem;
    text-align: right;
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }
}

.bar {
  flex: 1;
  height: 0.7rem;
  overflow: hidden;
  border-radius: 0.35rem;
  background: hsla(216, 40%, 25%, 0.1);

  .fill {
    height: 100%;
    display: block;
    border-radius: 0.35rem;
    background: var(--soft-blue);
    transform-origin: left center;
    animation: bar-grow 0.5s var(--ease-smooth) backwards;
    animation-delay: calc(var(--i) * 110ms + 200ms);
  }
}

.picked-line {
  opacity: 0;
  font-size: 1.3rem;
  animation: row-land 0.4s var(--ease-smooth) forwards;
  animation-delay: calc(var(--i) * 110ms + 250ms);
}

@keyframes row-land {
  from {
    opacity: 0;
    transform: translateY(0.8rem);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes bar-grow {
  from {
    transform: scaleX(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .row,
  .picked-line {
    animation: none;
    opacity: 1;
  }

  .bar .fill {
    animation: none;
  }
}

@media screen and (max-width: 480px) {
  .made-reveal {
    padding: 0.4rem 0;
  }

  .row {
    gap: 0.6rem;
    font-size: 1.3rem;

    .country {
      width: 8.5rem;
    }

    .value {
      width: 4.6rem;
    }
  }
}
</style>
