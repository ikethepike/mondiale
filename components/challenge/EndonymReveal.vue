<template>
  <!-- Spans throughout: renders inside ChallengeResult's lesson <p>. -->
  <span class="ranked-bars endonym-reveal">
    <span class="header">
      <span class="headline">
        You knew {{ hitCount }} of {{ rows.length }} — {{ challenge.quota }} were needed
      </span>
    </span>
    <span class="rows">
      <span
        v-for="(row, index) in rows"
        :key="row.isoCode"
        class="row"
        :class="{ missed: !row.hit }"
        :style="{ '--i': index }"
      >
        <span class="marker" aria-hidden="true">{{ row.hit ? '●' : '○' }}</span>
        <CountryFlag class="flag" :country="row.country" mode="background" />
        <span class="names">
          <span class="pair">
            <span class="primary">{{ row.endonym }}</span>
            <span class="secondary">{{ row.exonym }}</span>
          </span>
          <span v-if="row.etymology" class="etymology">{{ row.etymology }}</span>
        </span>
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
import { datasetAttribution, dedupeAttributions } from '~~/lib/attribution'
import { COUNTRIES } from '~~/data/countries.gen'
import { NAME_FACTS } from '~~/data/name-facts.gen'
import { countryEndonym, countryName } from '~~/lib/country'
import type { EndonymChallenge } from '~~/types/challenges/final-challenge.type'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * The endonym scorecard: each dealt country lands with its own name for
 * itself beside the English exonym and flag, hits warm and misses grayed,
 * with the Factbook's name etymology captioning the gap between the two
 * where it has one.
 */
const props = defineProps<{
  challenge: EndonymChallenge
  picks: ISOCountryCode[]
}>()

const rows = computed(() =>
  props.challenge.countries.map((isoCode, beat) => ({
    isoCode,
    country: COUNTRIES[isoCode],
    endonym: countryEndonym(isoCode),
    exonym: countryName(isoCode),
    etymology: NAME_FACTS[isoCode]?.etymology,
    hit: props.picks[beat] === isoCode,
  }))
)

const hitCount = computed(() => rows.value.filter(row => row.hit).length)

const sources = computed(() =>
  dedupeAttributions([...datasetAttribution('name-facts'), ...datasetAttribution('countries')])
)
</script>
<style lang="scss" scoped>
// Shell, row stagger and bar choreography come from templates/_ranked-bars.scss
.endonym-reveal {
  position: relative;
}

.header {
  display: flex;
  align-items: center;
  flex-flow: column nowrap;
}

.headline {
  opacity: 0.85;
  font-size: 1.4rem;
}

.row {
  .marker {
    color: hsl(38, 90%, 45%);
    font-size: 1.1rem;
    flex-shrink: 0;
  }

  .flag {
    width: 2.6rem;
    height: 1.8rem;
    flex-shrink: 0;
    border-radius: 0.2rem;
    box-shadow: 0 0.1rem 0.4rem hsla(216, 58%, 10%, 0.25);
  }

  .names {
    display: flex;
    min-width: 0;
    text-align: left;
    flex-flow: column nowrap;
  }

  .pair {
    gap: 0.5rem;
    display: flex;
    align-items: baseline;
    flex-flow: row nowrap;

    .primary {
      font-size: 1.5rem;
      line-height: 1.25;
      white-space: nowrap;
    }

    .secondary {
      opacity: 0.6;
      overflow: hidden;
      font-size: 1.1rem;
      line-height: 1.2;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
  }

  .etymology {
    opacity: 0.7;
    display: -webkit-box;
    overflow: hidden;
    font-size: 1.05rem;
    line-height: 1.35;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  &.missed {
    color: hsla(216, 25%, 45%, 0.75);

    .marker {
      color: hsla(216, 25%, 45%, 0.6);
    }

    .flag {
      filter: grayscale(0.7);
      opacity: 0.7;
    }
  }
}

@media screen and (max-width: 480px) {
  .pair .primary {
    font-size: 1.35rem;
  }
}
</style>
