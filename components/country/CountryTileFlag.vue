<template>
  <CountryFlag
    class="wide-tile-flag"
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
<style lang="scss" scoped>
// The recomposed art is exactly 3:1 — rendered at any other ratio the cover
// crop shears off the hoist, where Nordic crosses (and most defining
// elements) live. Call-sites that set an explicit width + height still win
// (aspect-ratio yields when both axes are constrained) — prefer sizing one
// axis and letting this hold the other.
.wide-tile-flag {
  aspect-ratio: 3 / 1;
}
</style>
