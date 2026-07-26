<template>
  <div ref="host" class="empire-flag" />
</template>
<script lang="ts" setup>
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
  const parsed = new DOMParser().parseFromString(props.svg, 'image/svg+xml')
  const svg = parsed.documentElement
  if (svg.nodeName.toLowerCase() !== 'svg') return
  svg.querySelectorAll('script, foreignObject').forEach(node => node.remove())
  for (const element of [svg, ...svg.querySelectorAll('*')]) {
    for (const attribute of [...element.attributes]) {
      if (attribute.name.toLowerCase().startsWith('on')) element.removeAttribute(attribute.name)
    }
  }
  // Commons files sometimes size themselves with width/height and no viewBox;
  // stripping the dimensions without one crops the art instead of scaling it.
  if (!svg.getAttribute('viewBox')) {
    const width = Number.parseFloat(svg.getAttribute('width') ?? '')
    const height = Number.parseFloat(svg.getAttribute('height') ?? '')
    if (width > 0 && height > 0) svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  }
  svg.removeAttribute('width')
  svg.removeAttribute('height')
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
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
