<template>
  <!-- Spans throughout: renders inside ChallengeResult's lesson <p>. -->
  <span class="sunset-reveal">
    <span class="headline">
      You lit {{ named.length }} before the dark — {{ quota }} were needed
    </span>
    <span class="chips">
      <span
        v-for="chip in chips"
        :key="chip.isoCode"
        class="chip"
        :class="[chip.held ? 'held' : 'taken', { extra: chip.extra }]"
        :title="chip.extra ? 'Beyond the window' : undefined"
      >
        <CountryFlag class="chip-flag" :country="COUNTRIES[chip.isoCode]" mode="background" />
        {{ chip.name }}
      </span>
      <span v-if="unlitBeyondCount" class="chip taken summary">
        +{{ unlitBeyondCount }} more slipped into the night
      </span>
    </span>
    <span v-if="sunGap" class="sun-line">{{ sunGap }}</span>
  </span>
</template>
<script lang="ts" setup>
import CountryFlag from '~/components/country/CountryFlag.vue'
import { CITY_LIGHTS } from '~~/data/cities.gen'
import { COUNTRIES } from '~~/data/countries.gen'
import { countryName } from '~~/lib/country'
import type { SunsetBlitzChallenge } from '~~/types/challenges/final-challenge.type'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * The sunset scorecard: every window country as a flag chip — warm if the
 * player held it, night-dark if the dark took it — plus the mode's premise
 * made literal (the real sunset gap across the window).
 */
const props = defineProps<{
  challenge: SunsetBlitzChallenge
  named: ISOCountryCode[]
  /** Everything that could have scored: window ∪ what the screen showed. */
  inPlay: ISOCountryCode[]
  quota: number
}>()

const namedSet = computed(() => new Set(props.named))
// The window in full, plus every beyond-window country the player actually
// lit. The beyond-window countries they DIDN'T light fold into one summary
// chip — on a wide screen that list runs to dozens and drowns the card.
const chips = computed(() => {
  const window = new Set(props.challenge.countries)
  const litBeyond = props.named.filter(isoCode => !window.has(isoCode))
  return [
    ...props.challenge.countries.map(isoCode => ({
      isoCode,
      name: countryName(COUNTRIES[isoCode]),
      held: namedSet.value.has(isoCode),
      extra: false,
    })),
    ...litBeyond
      .map(isoCode => ({
        isoCode,
        name: countryName(COUNTRIES[isoCode]),
        held: true,
        extra: true,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  ]
})

const unlitBeyondCount = computed(() => {
  const shown = new Set([...props.challenge.countries, ...props.named])
  return props.inPlay.filter(isoCode => !shown.has(isoCode)).length
})

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

.chip {
  gap: 0.5rem;
  display: inline-flex;
  align-items: center;
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

    .chip-flag {
      opacity: 0.55;
    }
  }

  // Lit outside the dealt window — same warmth, a marked edge
  &.extra {
    border: 0.15rem dashed hsla(38, 85%, 45%, 0.6);
  }

  &.summary {
    padding-left: 0.9rem;
    font-style: italic;
    opacity: 0.85;
  }
}

.chip-flag {
  width: 2.2rem;
  height: 1.5rem;
  flex-shrink: 0;
  border-radius: 0.2rem;
}

.sun-line {
  opacity: 0.75;
  font-size: 1.4rem;
}
</style>
