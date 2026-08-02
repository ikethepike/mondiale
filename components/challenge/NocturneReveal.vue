<template>
  <!-- Spans throughout: renders inside ChallengeResult's lesson <p>. -->
  <span class="ranked-bars nocturne-reveal">
    <span class="header">
      <CountryFlag class="flag" :country="country" mode="background" />
      <strong class="country">{{ countryName(country) }}</strong>
      <span class="headline">
        You lit {{ litCount }} of {{ rows.length }} — {{ challenge.quota }} were needed
      </span>
    </span>
    <span class="rows">
      <span
        v-for="(row, index) in rows"
        :key="row.name"
        class="row"
        :class="{ missed: !row.lit }"
        :style="{ '--i': index }"
      >
        <span class="marker" aria-hidden="true">{{ row.lit ? '●' : '○' }}</span>
        <span class="city">
          <span class="primary">{{ row.primary }}</span>
          <span v-if="row.secondary" class="secondary">{{ row.secondary }}</span>
        </span>
        <span class="bar">
          <span class="fill" :style="{ width: `${row.width}%` }" />
        </span>
        <span class="population">{{ row.display }}</span>
      </span>
    </span>
    <span v-if="urbanization" class="urban" :style="{ '--i': rows.length }">
      <span class="urban-copy"
        >{{ urbanization.amount }}% of {{ countryName(country) }}'s people live in cities</span
      >
      <span class="bar">
        <span class="fill" :style="{ width: `${urbanization.amount}%` }" />
      </span>
    </span>
    <span class="credit-row">
      <SourceInfo :attributions="sources" label="Sources" />
      <span class="credit">{{ sources[0].credit }}</span>
    </span>
  </span>
</template>
<script lang="ts" setup>
import CountryFlag from '~/components/country/CountryFlag.vue'
import SourceInfo from '~/components/feedback/SourceInfo.vue'
import { attributionFor, datasetAttribution } from '~~/lib/attribution'
import { CITY_LIGHTS } from '~~/data/cities.gen'
import { COUNTRIES } from '~~/data/countries.gen'
import { countryName } from '~~/lib/country'
import { formatCompact } from '~~/lib/number'
import type { CityNocturneChallenge } from '~~/types/challenges/final-challenge.type'

/**
 * The nocturne scorecard: the country's cities land one by one — lit ones
 * warm, missed ones grayed into the night — each with a population bar on a
 * shared scale, the country's flag in the corner, and the urbanization meter
 * closing the story of where its people actually live.
 */
const props = defineProps<{
  challenge: CityNocturneChallenge
  namedCities: string[]
}>()

const country = computed(() => COUNTRIES[props.challenge.country])

const rows = computed(() => {
  const cities = CITY_LIGHTS[props.challenge.country]?.slice(0, props.challenge.cityCount) ?? []
  const named = new Set(props.namedCities)
  const largest = Math.max(...cities.map(city => city.population), 1)
  return cities.map(city => {
    // Native script leads; the canonical name seconds it — unless they're
    // the same word, in which case one label is plenty
    const primary = city.native ?? city.local ?? city.name
    const secondary = primary.toLowerCase() === city.name.toLowerCase() ? undefined : city.name
    return {
      name: city.name,
      primary,
      secondary,
      lit: named.has(city.name),
      width: Math.max(3, (city.population / largest) * 100),
      display: formatCompact(city.population),
    }
  })
})

const litCount = computed(() => rows.value.filter(row => row.lit).length)
const urbanization = computed(() => country.value.people.urbanization)

/** The city lights plus the urbanization meter's own stat source. */
const sources = computed(() => [
  ...datasetAttribution('cities'),
  ...(urbanization.value ? [attributionFor('people.urbanization', urbanization.value)] : []),
])
</script>
<style lang="scss" scoped>
// Shell, row stagger and bar choreography come from templates/_ranked-bars.scss
.nocturne-reveal {
  position: relative;
}

// Flag over country over tally, all centred — the card opens like a dossier
.header {
  gap: 0.5rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;
}

.flag {
  width: 4.2rem;
  height: 2.8rem;
  border-radius: 0.3rem;
  box-shadow: 0 0.1rem 0.6rem hsla(216, 58%, 10%, 0.25);
}

.country {
  font-size: 1.9rem;
}

.headline {
  opacity: 0.85;
  font-size: 1.4rem;
}

// Each city lands on its own beat; bars grow after the row settles
.row {
  .marker {
    color: hsl(38, 90%, 45%);
    font-size: 1.1rem;
    flex-shrink: 0;
  }

  .city {
    width: 11rem;
    display: flex;
    overflow: hidden;
    text-align: left;
    flex-shrink: 0;
    flex-flow: column nowrap;

    .primary {
      font-size: 1.5rem;
      overflow: hidden;
      line-height: 1.25;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .secondary {
      opacity: 0.6;
      font-size: 1.1rem;
      overflow: hidden;
      line-height: 1.2;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
  }

  .population {
    width: 4.6rem;
    text-align: right;
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }

  &.missed {
    color: hsla(216, 25%, 45%, 0.75);

    .marker {
      color: hsla(216, 25%, 45%, 0.6);
    }

    .fill {
      background: hsla(216, 25%, 45%, 0.35);
    }
  }
}

.bar .fill {
  background: hsl(38, 90%, 55%);
}

.urban {
  gap: 0.4rem;
  display: flex;
  opacity: 0;
  margin-top: 0.4rem;
  flex-flow: column nowrap;
  font-size: 1.3rem;
  animation: row-land 0.4s var(--ease-smooth) forwards;
  animation-delay: calc(var(--i) * 110ms + 250ms);

  .urban-copy {
    text-align: center;
    opacity: 0.8;
  }

  .fill {
    background: var(--soft-blue);
  }
}

@media (prefers-reduced-motion: reduce) {
  .urban {
    animation: none;
    opacity: 1;
  }
}

@media screen and (max-width: 480px) {
  .row {
    .city {
      width: 8.5rem;
    }

    .population {
      width: 4rem;
    }
  }

  .flag {
    width: 3.4rem;
    height: 2.3rem;
  }
}
</style>
