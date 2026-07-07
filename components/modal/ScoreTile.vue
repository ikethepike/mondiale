<template>
  <div v-if="country" class="score-tile">
    <CountryFlag class="flag" :country="country" mode="background" />
    <strong class="country-name">{{ countryName(country) }}</strong>
    <p v-if="showAmount && amount">
      <span>{{ formatNumber(amount.amount) }}</span>
      <span>{{ ` ${amount.unit}` }}</span>
    </p>
  </div>
</template>
<script lang="ts" setup>
import { countryName, getCountry } from '~~/lib/country'
import { useClientEvents } from '~~/lib/events/client-side'
import { formatNumber } from '~~/lib/number'
import { getValueByAccessorID } from '~~/lib/values'
import { isTraversalChallenge } from '~~/types/challenges/traversal-challenge.type'
import type { ISOCountryCode } from '~~/types/geography.types'

const { currentRound } = useClientEvents()

const props = defineProps({
  isoCode: {
    type: String as PropType<ISOCountryCode>,
    required: true,
  },
  showAmount: {
    type: Boolean,
    default: true,
  },
})

const amount = computed(() => {
  const challenge = currentRound.value?.round.groupChallenge
  // Traversal rounds have no ranking accessor — tiles render without a value
  if (!challenge || isTraversalChallenge(challenge)) return undefined

  return getValueByAccessorID(props.isoCode, challenge.id)
})

const country = computed(() => {
  return getCountry(props.isoCode)
})
</script>
<style lang="scss" scoped>
.score-tile {
  display: grid;
  justify-content: stretch;
  grid-template-rows: repeat(2, max-content);
  .flag {
    width: 100%;
    height: 8rem;
    border: 0.1rem solid var(--text-color);
  }
}
</style>
