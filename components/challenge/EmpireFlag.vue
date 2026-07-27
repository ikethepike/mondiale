<template>
  <div ref="host" class="empire-flag" />
</template>
<script lang="ts" setup>
import { sanitizeSvg } from '~~/lib/svg'
/**
 * A historical flag from data/empire-flags.gen, sanitized before it enters
 * the DOM — the ViewGhostState trust boundary: no scripts, no foreignObject,
 * no on* handlers, stricter than v-html. One component so the option tiles
 * and the reveal card can never drift.
 */
const props = defineProps<{ svg: string }>()

const host = ref<HTMLElement>()

watchEffect(() => {
  if (!host.value || !props.svg) return
  // Commons files sometimes size themselves with width/height and no viewBox.
  const svg = sanitizeSvg(props.svg, { synthesizeViewBox: true })
  if (!svg) return
  host.value.replaceChildren(svg)
})
</script>
<style lang="scss" scoped>
.empire-flag {
  display: flex;
  align-items: center;
  justify-content: center;

  :deep(svg) {
    max-width: 100%;
    max-height: 100%;
  }
}
</style>
