<template>
  <!-- Spans throughout: renders inside ChallengeResult's lesson <p>. -->
  <span class="ranked-bars language-reveal">
    <span class="header">
      <strong class="language">{{ challenge.language }}</strong>
      <span class="subtitle">{{ subtitle }}</span>
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
    <span v-if="tailLine" class="tail-line" :style="{ '--i': rows.length }">{{ tailLine }}</span>
    <span v-if="pickedLine" class="picked-line" :style="{ '--i': rows.length + 1 }">
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
import { LANGUAGE_REVEAL_ROWS, languageSpeakers } from '~~/lib/challenges/final-challenge'
import { countryName } from '~~/lib/country'
import { formatCompact } from '~~/lib/number'
import type { LanguageChallenge } from '~~/types/challenges/final-challenge.type'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * The language scorecard: where the language is actually spoken, biggest
 * country first, each with a population bar on a shared scale. The reach is
 * the lesson — "French" is a West African language as much as a European one.
 *
 * Counts countries that LIST the language, never speakers: the Factbook's
 * language fields say where a tongue is in use, not how many use it.
 */
const props = defineProps<{
  challenge: LanguageChallenge
  /** The player's answer, right or wrong. */
  picked?: ISOCountryCode
}>()

const sources = datasetAttribution('countries')

const speakers = computed(() => languageSpeakers(props.challenge.language))

const population = (isoCode: ISOCountryCode) => COUNTRIES[isoCode].people.population?.amount ?? 0

const subtitle = computed(() => {
  const count = speakers.value.length
  const combined = speakers.value.reduce((total, isoCode) => total + population(isoCode), 0)
  const where = `spoken in ${count} ${count === 1 ? 'country' : 'countries'}`
  return combined ? `${where} · ${formatCompact(combined)} people between them` : where
})

const rows = computed(() => {
  // The player's pick earns a row even when it sits below the cut — a right
  // answer that vanishes off the chart reads as a wrong one.
  const shown = speakers.value.slice(0, LANGUAGE_REVEAL_ROWS)
  if (props.picked && speakers.value.includes(props.picked) && !shown.includes(props.picked)) {
    shown.push(props.picked)
  }
  const largest = Math.max(...shown.map(population), 1)
  return shown.map(isoCode => ({
    isoCode,
    name: countryName(COUNTRIES[isoCode]),
    width: Math.max(3, (population(isoCode) / largest) * 100),
    display: formatCompact(population(isoCode)),
  }))
})

const tailLine = computed(() => {
  const remaining = speakers.value.length - rows.value.length
  return remaining > 0
    ? `…and ${remaining} more ${remaining === 1 ? 'country' : 'countries'}, lit on the map.`
    : undefined
})

// A wrong pick teaches what it does speak, so the miss itself lands a fact
const pickedLine = computed(() => {
  if (!props.picked || speakers.value.includes(props.picked)) return undefined
  const country = COUNTRIES[props.picked]
  const spoken = country.languages.slice(0, 3)
  return spoken.length
    ? `Your pick, ${countryName(country)}, speaks ${spoken.join(', ')}.`
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

  .language {
    font-size: 1.9rem;
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

.tail-line,
.picked-line {
  opacity: 0;
  font-size: 1.3rem;
  animation: row-land 0.4s var(--ease-smooth) forwards;
  animation-delay: calc(var(--i) * 110ms + 250ms);
}

@media (prefers-reduced-motion: reduce) {
  .tail-line,
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
