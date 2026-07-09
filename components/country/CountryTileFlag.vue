<template>
  <CountryFlag
    :country="country"
    mode="background"
    fit="cover"
    variant="wide"
    :position="position"
  />
</template>
<script lang="ts" setup>
import CountryFlag from '~/components/country/CountryFlag.vue'
import type { Country } from '~~/types/geography.types'

// The "wide tile" flag: a recomposed 3:1 variant that fills a wide box edge to
// edge (falling back to a contained original for flags without a wide variant).
// Owns the wide-tile intent so the ~15 cover tile call-sites don't each repeat
// the mode/fit/variant props — and a future default change is one edit here.
defineProps({
  country: {
    type: Object as PropType<Country>,
    required: true,
  },
  position: {
    type: String,
    default: 'center',
  },
})
</script>
