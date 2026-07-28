<template>
  <component :is="tag" class="country-chip" :class="{ compact }">
    <CountryFlag class="chip-flag" :country="country" mode="background" />
    <span class="chip-name">{{ countryName(country) }}</span>
    <slot />
  </component>
</template>
<script lang="ts" setup>
import CountryFlag from '~/components/country/CountryFlag.vue'
import { countryName } from '~~/lib/country'
import type { Country } from '~~/types/geography.types'

/**
 * The one chosen-country label: flag + name, everywhere a view lists the
 * countries already picked, guessed or walked. Layout and flag sizing live in
 * templates/_country-chip.scss; hosts add their surface (`map-caption` over
 * the map, a pane's own tint in reveals) and any verdict classes (`stray`,
 * `head`, `held`, …). The trailing slot carries suffixes — a distance, a
 * remove ×. A chip without a flag is a bug, not a variant.
 */
defineProps({
  country: {
    type: Object as PropType<Country>,
    required: true,
  },
  // 'li' in lists, 'button' when the chip itself is the action, 'span' inline.
  tag: {
    type: String,
    default: 'li',
  },
  // Denser chip for in-pane reveals and removable picks (smaller flag).
  compact: {
    type: Boolean,
    default: false,
  },
})
</script>
