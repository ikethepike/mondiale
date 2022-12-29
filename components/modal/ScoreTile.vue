<template>
  <div class="score-tile" v-if="country && amount">
    <div
      class="flag"
      :style="{
        backgroundImage: `url('data:image/svg+xml;base64, ${baseEncode(country.flag)}')`,
      }"
    ></div>
    <p class="country-name">{{ country.name.english }}</p>
    <p v-if="showAmount">
      <span>{{ amount.amount }}</span>
      <span>{{ amount.unit }}</span>
    </p>
  </div>
</template>
<script lang="ts" setup>
import { PropType } from 'vue'
import { COUNTRIES } from '~~/data/countries.gen'
import { useClientEvents } from '~~/lib/events/client-side'
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
