<template>
  <!-- Spans throughout: this also renders inside ChallengeResult's lesson
       body. Blocks would be legal there now; the spans stay because they work. -->
  <span class="capital-reveal">
    <span class="capital-head">
      <strong class="capital-name">{{ capitalName }}</strong>
      <span v-if="nativeName" class="capital-native">{{ nativeName }}</span>
    </span>
    <span v-if="factLine" class="capital-facts">{{ factLine }}</span>
    <span v-if="facts?.etymology" class="capital-etymology">
      <span class="line-label">The name</span>
      {{ facts.etymology }}
    </span>
    <span v-if="pickedLine" class="capital-picked">{{ pickedLine }}</span>
    <span class="source-line">
      <SourceInfo :attributions="attributions" label="Sources" />
    </span>
  </span>
</template>
<script lang="ts" setup>
import SourceInfo from '~/components/feedback/SourceInfo.vue'
import { datasetAttribution } from '~~/lib/attribution'
import { capitalCityLight } from '~~/lib/capitals'
import { countryName, getCountry } from '~~/lib/country'
import { formatCompact } from '~~/lib/number'
import type { CapitalFacts } from '~~/data/capital-facts.gen'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * The capital dossier: name (native spelling where it differs), population
 * from the city-lights dataset, timezone, and the name's etymology. The
 * narrative facts load lazily — they never ride the main bundle.
 */
const props = defineProps<{
  country: ISOCountryCode
  /** capital-match gate: the wrongly picked country, taught its own capital. */
  pickedCountry?: ISOCountryCode
}>()

const facts = ref<CapitalFacts>()

watch(
  () => props.country,
  async country => {
    facts.value = undefined
    const { CAPITAL_FACTS } = await import('~~/data/capital-facts.gen')
    if (country === props.country) facts.value = CAPITAL_FACTS[country]
  },
  { immediate: true }
)

const capitalName = computed(() => getCountry(props.country)?.geography.capital.name ?? '')

const cityLight = computed(() => capitalCityLight(props.country))

/** Native/local spelling, only when it adds something over the headline. */
const nativeName = computed(() => {
  const city = cityLight.value
  const distinct = city?.native ?? city?.local
  return distinct && distinct !== capitalName.value ? distinct : undefined
})

const factLine = computed(() => {
  const parts = [
    `capital of ${countryName(props.country)}`,
    cityLight.value ? `${formatCompact(cityLight.value.population)} people` : undefined,
    facts.value?.timezone,
  ].filter(Boolean)
  return parts.join(' · ')
})

const pickedLine = computed(() => {
  if (!props.pickedCountry || props.pickedCountry === props.country) return undefined
  const picked = getCountry(props.pickedCountry)
  if (!picked) return undefined
  return `You picked ${countryName(picked)} — its capital is ${picked.geography.capital.name}.`
})

const attributions = computed(() => datasetAttribution('capitals'))
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.capital-reveal {
  gap: 0.6rem;
  display: flex;
  text-align: left;
  flex-flow: column nowrap;
}

.capital-head {
  gap: 0.8rem;
  display: flex;
  align-items: baseline;
  flex-flow: row wrap;
}

.capital-name {
  font-size: 1.8rem;
  color: var(--dark-blue);
}

.capital-native {
  opacity: 0.6;
  font-size: 1.4rem;
}

.capital-facts {
  font-size: 1.3rem;
  color: var(--dark-blue);
}

.capital-etymology {
  opacity: 0.8;
  font-size: 1.3rem;
  line-height: 1.5;
}

.line-label {
  display: block;
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--soft-blue);
}

.capital-picked {
  font-size: 1.3rem;
  color: var(--hior-ange);
}
</style>
