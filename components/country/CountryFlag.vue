<template>
  <div v-if="mode === 'inline'" ref="inlineHost" class="country-flag" />
  <div
    v-else
    class="country-flag"
    :style="{
      backgroundImage: backgroundUri ? `url('${backgroundUri}')` : 'none',
      backgroundSize: effectiveFit,
      backgroundPosition: position,
      backgroundRepeat: 'no-repeat',
    }"
  />
</template>
<script lang="ts" setup>
import { flagDataUri, flagMarkup, flagWideDataUri, loadFlags, loadFlagsWide } from '~~/lib/country'
import type { Country } from '~~/types/geography.types'
import { sanitizeSvg } from '~~/lib/svg'

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
  // 'wide' uses the recomposed 3:1 tile variant (background+cover only); flags
  // with no wide variant transparently fall back to the contained original.
  variant: {
    type: String as PropType<'original' | 'wide'>,
    default: 'original',
  },
})

// Both flag artifacts are lazy; these refs flip once each is loaded so the
// markup/URI computeds recompute. The base flags are always needed …
const flagsReady = ref(false)
loadFlags().then(() => {
  flagsReady.value = true
})

// … the wide artifact only when a wide variant is actually requested.
const wideReady = ref(false)
watchEffect(() => {
  if (props.variant === 'wide' && props.mode === 'background') {
    loadFlagsWide().then(() => {
      wideReady.value = true
    })
  }
})

const wideUri = computed(() =>
  props.variant === 'wide' && wideReady.value ? flagWideDataUri(props.country) : null
)

// Use the wide flag when available; otherwise the original. When we fall back
// for an excluded flag, force `contain` so it letterboxes cleanly instead of
// cropping the untailored original.
const backgroundUri = computed(
  () => wideUri.value ?? (flagsReady.value ? flagDataUri(props.country) : null)
)
const effectiveFit = computed(() =>
  props.variant === 'wide' && !wideUri.value ? 'contain' : props.fit
)

/**
 * Flag SVGs share generic element ids (`star`, `t`, `a`, ...) and reference
 * them via <use>/url(). Inlining several flags into one document makes the
 * browser resolve those refs against the FIRST matching id anywhere on the
 * page — another flag's geometry (see: Panama rendering with giant mangled
 * stars). Namespacing ids per country keeps every inline flag self-contained.
 * The \b is load-bearing: without it `marker-mid="url(#a)"` matches as
 * `id="url(#a)"` and the rewrite corrupts the attribute (the US stars ride
 * a marker-mid path).
 */
const namespacedMarkup = computed(() => {
  const markup = flagsReady.value ? flagMarkup(props.country) : null
  if (!markup) return null
  const prefix = `flag-${props.country.isoCode}-`
  return markup
    .replaceAll(/\bid="([^"]+)"/g, (_, id) => `id="${prefix}${id}"`)
    .replaceAll(
      /(xlink:href|href)="#([^"]+)"/g,
      (_, attribute, id) => `${attribute}="#${prefix}${id}"`
    )
    .replaceAll(/url\(#([^)]+)\)/g, (_, id) => `url(#${prefix}${id})`)
})

// Inline flags are parsed and sanitized (no scripts, no foreignObject, no
// on* handlers) before entering the DOM — stricter than v-html, and it
// keeps working even if a hostile flag ever sneaks into the dataset.
const inlineHost = ref<HTMLElement>()
watchEffect(() => {
  if (!inlineHost.value || props.mode !== 'inline' || !namespacedMarkup.value) return

  // Flags carry all aspect ratios (2:1, 3:2, 1:1, Nepal's pennon, Switzerland's
  // square). Sizing scales to the container; the host box uses `fit` (contain
  // = whole flag with letterboxing, cover = fill+crop) to decide how.
  const svg = sanitizeSvg(namespacedMarkup.value, {
    fit: props.fit === 'cover' ? 'cover' : 'contain',
  })
  if (!svg) return

  inlineHost.value.replaceChildren(svg)
})
</script>
<style scoped>
/* The inline flag fills its host box in BOTH dimensions; preserveAspectRatio
   (set on the svg) keeps the flag undistorted — 'meet' letterboxes, 'slice'
   crops. A host that only sets a width should give the flag a matching height
   (e.g. aspect-ratio) so it isn't collapsed; the reveal/atlas cards do. */
.country-flag {
  overflow: hidden;
  /* Fallback height when a host sets only a width — most flags are ~3:2. Hosts
     that pin their own height (atlas/score/tile) override this harmlessly. */
  aspect-ratio: 3 / 2;
}
.country-flag :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
