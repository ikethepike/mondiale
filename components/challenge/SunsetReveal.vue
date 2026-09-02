<template>
  <!-- Spans throughout: renders inside ChallengeResult's lesson body. That body is
       a <div> now, so blocks would be legal here — the spans stay because they
       work and churning them buys nothing. -->
  <span class="sunset-reveal">
    <span class="headline">
      You lit {{ named.length }} of {{ challenge.countries.length }} before the dark —
      {{ quota }} were needed
    </span>
    <span class="chips">
      <CountryChip
        v-for="chip in chips"
        :key="chip.isoCode"
        tag="span"
        compact
        class="light-chip"
        :class="chip.held ? 'held' : 'taken'"
        :country="COUNTRIES[chip.isoCode]"
      />
    </span>
    <span v-if="sunGap" class="sun-line">{{ sunGap }}</span>
    <span class="credit-row">
      <SourceInfo :attributions="sources" />
      <span class="credit">{{ sources[0].credit }}</span>
    </span>
  </span>
</template>
<script lang="ts" setup>
import CountryChip from '~/components/country/CountryChip.vue'
import SourceInfo from '~/components/feedback/SourceInfo.vue'
import { datasetAttribution } from '~~/lib/attribution'
import { CITY_LIGHTS } from '~~/data/cities.gen'
import { COUNTRIES } from '~~/data/countries.gen'
import type { SunsetBlitzChallenge } from '~~/types/challenges/final-challenge.type'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * The sunset scorecard: every window country as a flag chip, east→west as the
 * night took them — warm if the player held it, night-dark if the dark took
 * it — plus the mode's premise made literal (the real sunset gap across the
 * window).
 */
const props = defineProps<{
  challenge: SunsetBlitzChallenge
  named: ISOCountryCode[]
  quota: number
}>()

/** The sunset gap is computed from the same city-light coordinates. */
const sources = datasetAttribution('cities')

const namedSet = computed(() => new Set(props.named))
const chips = computed(() =>
  props.challenge.countries.map(isoCode => ({ isoCode, held: namedSet.value.has(isoCode) }))
)

// 4 minutes of real sunset per degree of longitude, east to west across the
// window's biggest cities
const sunGap = computed(() => {
  const east = CITY_LIGHTS[props.challenge.countries[0]!]?.[0]
  const west = CITY_LIGHTS[props.challenge.countries[props.challenge.countries.length - 1]!]?.[0]
  if (!east || !west || east.lng <= west.lng) return undefined
  const minutes = Math.round((east.lng - west.lng) * 4)
  const gap = minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`
  return `The real sun sets over ${east.name} about ${gap} before ${west.name}.`
})
</script>
<style lang="scss" scoped>
.sunset-reveal {
  gap: 1rem;
  display: flex;
  flex-flow: column nowrap;
  // Tall runs must scroll inside the card, not off the screen
  max-height: min(46vh, 42rem);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0.2rem;
}

.headline {
  font-weight: bold;
}

.chips {
  gap: 0.5rem;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
}

// Chip layout and flag sizing come from templates/_country-chip.scss;
// this reveal only paints its warm/night surfaces.
.light-chip {
  font-size: 1.3rem;
  padding: 0.3rem 0.9rem 0.3rem 0.4rem;
  border-radius: 2rem;

  &.held {
    color: hsl(38, 85%, 24%);
    background: hsla(45, 90%, 74%, 0.55);
  }

  &.taken {
    color: hsla(216, 30%, 88%, 0.95);
    background: hsla(216, 45%, 18%, 0.92);

    :deep(.chip-flag) {
      opacity: 0.55;
    }
  }
}

.sun-line {
  opacity: 0.75;
  font-size: 1.4rem;
}
</style>
