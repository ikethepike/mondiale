<template>
  <div v-if="conicGradient" class="flag-pinwheel" :style="{ background: conicGradient }" />
</template>
<script lang="ts" setup>
import type { Country } from '~~/types/geography.types'

const props = defineProps({
  country: {
    type: Object as PropType<Country>,
    required: true,
  },
})

const pinwheelColors = computed<string[]>(() => {
  let filtered = props.country.identity.colors
  if (!filtered.length) return []

  if (filtered.length === 2) {
    filtered = filtered.concat([...filtered])
  } else {
    filtered = [...new Set(filtered)]
  }

  return filtered
})

const conicGradient = computed(() => {
  const degreesPer = 360 / pinwheelColors.value.length

  let offset = 0
  return `conic-gradient(${pinwheelColors.value
    .map(color => `${color} ${offset}deg ${(offset += degreesPer)}deg`)
    .join(',')})`
})
</script>
