<template>
  <div v-if="mode === 'inline'" ref="inlineHost" class="country-flag" />
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

// Inline flags are parsed and sanitized (no scripts, no foreignObject, no
// on* handlers) before entering the DOM — stricter than v-html, and it
// keeps working even if a hostile flag ever sneaks into the dataset.
const inlineHost = ref<HTMLElement>()
watchEffect(() => {
  if (!inlineHost.value || props.mode !== 'inline') return

  const parsed = new DOMParser().parseFromString(namespacedMarkup.value, 'image/svg+xml')
  const svg = parsed.documentElement
  if (svg.nodeName.toLowerCase() !== 'svg') return

  svg.querySelectorAll('script, foreignObject').forEach(node => node.remove())
  for (const element of [svg, ...svg.querySelectorAll('*')]) {
    for (const attribute of [...element.attributes]) {
      if (attribute.name.toLowerCase().startsWith('on')) {
        element.removeAttribute(attribute.name)
      }
    }
  }

  inlineHost.value.replaceChildren(svg)
})
</script>
<style scoped>
.country-flag :deep(svg) {
  width: 100%;
  display: block;
}
</style>
