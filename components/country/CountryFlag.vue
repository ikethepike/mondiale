<template>
  <div v-if="mode === 'inline'" class="country-flag" v-html="namespacedMarkup" />
  <div
    v-else
    class="country-flag"
    :style="{
      backgroundImage: `url('${flagDataUri(country)}')`,
      backgroundSize: fit,
      backgroundPosition: position,
      backgroundRepeat: 'no-repeat',
    }"
  />
</template>
<script lang="ts" setup>
import { flagDataUri } from '~~/lib/country'
import type { Country } from '~~/types/geography.types'

const props = defineProps({
  country: {
    type: Object as PropType<Country>,
    required: true,
  },
  // 'inline' injects the SVG markup, 'background' paints it as a background image
  mode: {
    type: String as PropType<'inline' | 'background'>,
    default: 'inline',
  },
  fit: {
    type: String as PropType<'cover' | 'contain'>,
    default: 'cover',
  },
  position: {
    type: String,
    default: 'center',
  },
})

/**
 * Flag SVGs share generic element ids (`star`, `t`, `a`, ...) and reference
 * them via <use>/url(). Inlining several flags into one document makes the
 * browser resolve those refs against the FIRST matching id anywhere on the
 * page — another flag's geometry (see: Panama rendering with giant mangled
 * stars). Namespacing ids per country keeps every inline flag self-contained.
 */
const namespacedMarkup = computed(() => {
  const prefix = `flag-${props.country.isoCode}-`
  return props.country.flag
    .replaceAll(/id="([^"]+)"/g, (_, id) => `id="${prefix}${id}"`)
    .replaceAll(/(xlink:href|href)="#([^"]+)"/g, (_, attribute, id) => `${attribute}="#${prefix}${id}"`)
    .replaceAll(/url\(#([^)]+)\)/g, (_, id) => `url(#${prefix}${id})`)
})
</script>
<style scoped>
.country-flag :deep(svg) {
  width: 100%;
  display: block;
}
</style>
