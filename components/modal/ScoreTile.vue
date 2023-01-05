<template>
  <div class="score-tile" v-if="country && amount">
    <div
      class="flag"
      :style="{
        backgroundImage: `url('data:image/svg+xml;base64, ${baseEncode(country.flag)}')`,
      }"
    />
    <strong class="country-name">{{ country.name.english }}</strong>
    <p v-if="showAmount">
      <span>{{ formatNumber(amount.amount) }}</span>
      <span>{{ ` ${amount.unit}` }}</span>
    </p>
  </div>
</template>
<script lang="ts" setup>
import { PropType } from 'vue'
import { COUNTRIES } from '~~/data/countries.gen'
import { useClientEvents } from '~~/lib/events/client-side'
import { formatNumber } from '~~/lib/number'
import { baseEncode } from '~~/lib/strings'
import { getValueByAccessorID } from '~~/lib/values'
import { ISOCountryCode } from '~~/types/geography.types'

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
  const accessorId = currentRound.value?.round.groupChallenge.id
  if (!accessorId) return undefined

  return getValueByAccessorID(props.isoCode, accessorId)
})

const country = computed(() => {
  return COUNTRIES[props.isoCode]
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
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    border: 0.1rem solid var(--text-color);
  }
}
</style>
