<template>
  <span v-if="entry" class="far-flung-reveal">
    <strong class="lesson">{{ entry.name }} — {{ entry.blurb }}</strong>
    <span class="owner-row">
      <span class="owner-lead">A piece of</span>
      <CountryChip :country="getCountry(entry.iso)" tag="span" compact />
      <span v-if="entry.separationKm" class="separation">
        {{ separationLabel }} from the rest of it
      </span>
    </span>
    <span v-if="missedCountry" class="missed">
      Not <s>{{ countryName(missedCountry) }}</s>
    </span>
  </span>
</template>
<script lang="ts" setup>
import CountryChip from '~/components/country/CountryChip.vue'
import { FAR_FLUNG } from '~~/data/far-flung.gen'
import { countryName, getCountry } from '~~/lib/country'
import { formatApproxKm, formatKm } from '~~/lib/number'
import { wrongTokenFor } from '~~/lib/use-gate-challenge'
import type { IndividualChallenge } from '~~/types/challenges/individual-challenge.type'
import type { ISOCountryCode } from '~~/types/geography.types'

const props = defineProps<{
  challenge: IndividualChallenge
  submitted?: ISOCountryCode
}>()

// The same entry the dealer staged — name, blurb and distance can't drift.
const entry = computed(() => {
  const slug = props.challenge.farFlung?.slug
  return slug ? FAR_FLUNG[slug] : undefined
})
// A clock expiry submits the can't-match token, not a guess — "Not
// Switzerland" on a timeout reads as a bizarre accusation. Only a country
// the player actually chose earns the strike-through.
const missedCountry = computed(() => {
  if (!props.submitted || props.submitted === entry.value?.iso) return undefined
  if (props.submitted === wrongTokenFor(props.challenge)) return undefined
  return props.submitted
})
// The approx grain is 100 km — honest for the Galápagos, but it rounds a
// 40 km exclave hop to "0 km". Near separations keep their real figure.
const separationLabel = computed(() => {
  const km = entry.value?.separationKm ?? 0
  return km >= 200 ? formatApproxKm(km) : formatKm(km)
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.far-flung-reveal {
  gap: 0.8rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;
}

.lesson {
  font-size: 1.5rem;
  line-height: 1.45;
  text-align: center;
  max-width: 44rem;
  color: var(--dark-blue);
}

.owner-row {
  gap: 0.8rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
}

.owner-lead,
.separation {
  font-size: 1.3rem;
  color: var(--soft-blue);
}

.missed {
  font-size: 1.3rem;
  color: ink(0.6);
}
</style>
