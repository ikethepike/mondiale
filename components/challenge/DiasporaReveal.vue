<template>
  <!-- Spans throughout: renders inside ChallengeResult's lesson body. That body is
       a <div> now, so blocks would be legal here — the spans stay because they
       work and churning them buys nothing. -->
  <section class="ranked-bars diaspora-reveal" tabindex="0" aria-label="Migration corridors">
    <span class="header">
      <!-- Beats past the verdict were never asked, so the denominator is what
           the player actually played, not the whole dealt deck -->
      <span class="headline">
        You placed {{ hitCount }} of {{ playedCount }} — {{ challenge.quota }} were needed
      </span>
    </span>
    <span class="rows">
      <span
        v-for="(row, index) in rows"
        :key="row.origin"
        class="row"
        :class="{ missed: !row.hit, unplayed: !row.played }"
        :style="{ '--i': index }"
      >
        <span class="marker" aria-hidden="true">{{ row.hit ? '●' : '○' }}</span>
        <span class="journey">
          <span class="end">
            <CountryFlag class="flag" :country="getCountry(row.origin)" mode="background" />
            <span class="name">{{ countryName(row.origin) }}</span>
          </span>
          <span class="arrow" aria-hidden="true">→</span>
          <span class="end">
            <CountryFlag class="flag" :country="getCountry(row.destination)" mode="background" />
            <span class="name">{{ countryName(row.destination) }}</span>
          </span>
          <strong class="stock">{{ row.stock }}</strong>
        </span>
        <span v-if="row.picked && !row.hit" class="your-pick">
          you tapped {{ countryName(row.picked) }}
        </span>
      </span>
    </span>
    <span class="credit-row">
      <SourceInfo :attributions="sources" label="Sources" />
      <span class="credit">Foreign-born residents, {{ VINTAGE }}</span>
    </span>
  </section>
</template>
<script lang="ts" setup>
import CountryFlag from '~/components/country/CountryFlag.vue'
import SourceInfo from '~/components/feedback/SourceInfo.vue'
import { datasetAttribution } from '~~/lib/attribution'
import { countryName, getCountry } from '~~/lib/country'
import { corridorsFromOrigin } from '~~/lib/migration'
import { formatCompact } from '~~/lib/number'
import type { DiasporaChallenge } from '~~/types/challenges/final-challenge.type'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * The diaspora scorecard: every beat's journey laid out origin → destination
 * with the size of the community that made it, hits warm and misses grayed.
 *
 * The figure counts people BORN in the origin and living in the destination —
 * never descent, which is a different and much larger number. The credit row
 * dates it because the leading destination moves between revisions.
 */
const props = defineProps<{
  challenge: DiasporaChallenge
  picks: ISOCountryCode[]
}>()

/** The revision the corridors were generated from. */
const VINTAGE = 2024

const rows = computed(() =>
  props.challenge.origins.map((origin, beat) => {
    const [leading] = props.challenge.accepted[beat]
    const corridor = corridorsFromOrigin(origin).find(entry => entry.isoCode === leading)
    return {
      origin,
      destination: leading,
      stock: corridor ? formatCompact(corridor.value.amount) : '—',
      picked: props.picks[beat],
      // A beat past the verdict was never put to the player — neither a hit
      // nor a miss, and it must not be scored as one
      played: beat < props.picks.length,
      hit: props.challenge.accepted[beat].includes(props.picks[beat]),
    }
  })
)

const hitCount = computed(() => rows.value.filter(row => row.hit).length)
const playedCount = computed(() => rows.value.filter(row => row.played).length)

const sources = computed(() => datasetAttribution('migration'))
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;
@use '~/assets/scss/rules/ink' as *;
// Shell, row stagger and choreography come from templates/_ranked-bars.scss
.diaspora-reveal {
  position: relative;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.row {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.2rem 0.6rem;
  align-items: center;

  &.missed {
    opacity: 0.62;
  }

  // Never asked — shown for the lesson, but faint enough not to read as a miss
  &.unplayed {
    opacity: 0.38;
  }
}

.marker {
  font-size: 0.7rem;
  line-height: 1;
}

.journey {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  min-width: 0;
}

.end {
  display: flex;
  gap: 0.35rem;
  align-items: center;
  min-width: 0;
}

.flag {
  flex: none;
  width: 1.6rem;
  height: 1.1rem;
  border-radius: 0.2rem;
  box-shadow: 0 0 0 1px ink(0.12);
}

.name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.arrow {
  flex: none;
  opacity: 0.5;
}

.stock {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}

// The miss, named — the gap between where they went and where you looked
.your-pick {
  grid-column: 2;
  font-size: 0.85em;
  opacity: 0.75;
}

@media (max-width: $phone) {
  .journey {
    flex-wrap: wrap;
  }

  .stock {
    margin-left: 0;
  }
}
</style>
