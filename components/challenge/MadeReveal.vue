<template>
  <!-- Spans throughout: renders inside ChallengeResult's lesson body. That body is
       a <div> now, so blocks would be legal here — the spans stay because they
       work and churning them buys nothing. -->
  <span class="ranked-bars made-reveal">
    <span class="header">
      <strong class="commodity">{{ challenge.commodity }}</strong>
      <span class="subtitle">the world's top exporters · {{ year }}</span>
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
    <span class="credit-row">
      <SourceInfo :attributions="sources" />
      <span class="credit">{{ sources[0].credit }}</span>
    </span>
  </span>
</template>
<script lang="ts" setup>
import CountryFlag from '~/components/country/CountryFlag.vue'
import SourceInfo from '~/components/feedback/SourceInfo.vue'
import { datasetAttribution } from '~~/lib/attribution'
import { COUNTRIES } from '~~/data/countries.gen'
import {
  exportsCommodity,
  MADE_REVEAL_ROWS,
  madeTopExporters,
} from '~~/lib/challenges/final-challenge'
import { countryName } from '~~/lib/country'
import { formatCompact, formatOrdinal } from '~~/lib/number'
import { sentenceCase } from '~~/lib/strings'
import type { MadeChallenge } from '~~/types/challenges/final-challenge.type'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * The Made In scorecard: the world's top exporters of the commodity, ranked
 * by real per-commodity trade value (CEPII BACI), each landing on its own
 * beat with a shared-scale bar. A pick outside the chart gets its own
 * teaching line instead of vanishing.
 */
const props = defineProps<{
  challenge: MadeChallenge
  /** The player's answer, right or wrong. */
  picked?: ISOCountryCode
}>()

const sources = datasetAttribution('commodity-exporters')

const exporters = computed(() =>
  madeTopExporters(props.challenge.commodity).slice(0, MADE_REVEAL_ROWS)
)

const year = computed(() => exporters.value[0]?.value.year)

const rows = computed(() => {
  const largest = Math.max(...exporters.value.map(row => row.value.amount), 1)
  return exporters.value.map(row => ({
    isoCode: row.isoCode,
    name: countryName(COUNTRIES[row.isoCode]),
    width: Math.max(3, (row.value.amount / largest) * 100),
    display: formatCompact(row.value.amount, { currency: true }),
  }))
})

// A pick outside the chart teaches too: a stored exporter below the shown
// rows gets its world rank, an own-top-5 exporter that never cracks the
// world ranking is still a right answer, and a wrong pick shows what the
// picked country actually ships.
const pickedLine = computed(() => {
  if (!props.picked || rows.value.some(row => row.isoCode === props.picked)) return undefined
  const country = COUNTRIES[props.picked]
  const rank = madeTopExporters(props.challenge.commodity).findIndex(
    row => row.isoCode === props.picked
  )
  if (rank !== -1) {
    return `${countryName(country)} — the world's ${formatOrdinal(rank + 1)}-biggest shipper of ${props.challenge.commodity}, just off this chart.`
  }
  if (exportsCommodity(props.picked, props.challenge.commodity)) {
    return `${sentenceCase(props.challenge.commodity)} — one of ${countryName(country)}'s own top exports, though not among the world's biggest shippers.`
  }
  const top = country.economics.exports?.slice(0, 3)
  return top?.length
    ? `Your pick, ${countryName(country)}, mostly ships ${top.join(', ')}.`
    : undefined
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;
// Shell, row stagger and bar choreography come from templates/_ranked-bars.scss
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

.row {
  border-radius: 0.6rem;

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

.bar .fill {
  background: var(--soft-blue);
}

.picked-line {
  opacity: 0;
  font-size: 1.3rem;
  animation: row-land 0.4s var(--ease-smooth) forwards;
  animation-delay: calc(var(--i) * 110ms + 250ms);
}

@media (prefers-reduced-motion: reduce) {
  .picked-line {
    animation: none;
    opacity: 1;
  }
}

@media screen and (max-width: $phone) {
  .row {
    .country {
      width: 8.5rem;
    }

    .value {
      width: 4.6rem;
    }
  }
}
</style>
