<template>
  <aside class="keyboard-lab" aria-hidden="true">
    <div>layout {{ readings.layoutHeight }}px</div>
    <div>vv {{ readings.vvHeight }}px @{{ readings.vvScale }}</div>
    <div>vv offsetTop {{ readings.vvOffsetTop }}px</div>
    <div>scrollY {{ readings.scrollY }}px</div>
    <div>inset {{ readings.inset }}</div>
    <div>focus {{ readings.field }} ↓{{ readings.fieldBottom }}px</div>
    <div>clamps {{ readings.clamps }}</div>
  </aside>
</template>
<script lang="ts" setup>
import { keyboardClampCount } from '~~/lib/use-viewport'

/**
 * The keyboard engine's live vitals, for on-device debugging of typed
 * consoles (test-views mounts it behind ?diagnostics). Reads only —
 * pointer-inert, own rAF loop while mounted.
 */
const readings = ref({
  layoutHeight: 0,
  vvHeight: 0,
  vvOffsetTop: 0,
  vvScale: 1,
  scrollY: 0,
  inset: '',
  field: '—',
  fieldBottom: 0,
  clamps: 0,
})

let frame = 0
const read = () => {
  const viewport = window.visualViewport
  const field = document.activeElement
  readings.value = {
    layoutHeight: document.documentElement.clientHeight,
    vvHeight: Math.round(viewport?.height ?? 0),
    vvOffsetTop: Math.round(viewport?.offsetTop ?? 0),
    vvScale: Math.round((viewport?.scale ?? 1) * 100) / 100,
    scrollY: Math.round(window.scrollY),
    inset:
      getComputedStyle(document.documentElement).getPropertyValue('--keyboard-inset').trim() ||
      '0px',
    field: field && field !== document.body ? field.tagName.toLowerCase() : '—',
    fieldBottom:
      field instanceof HTMLElement ? Math.round(field.getBoundingClientRect().bottom) : 0,
    clamps: keyboardClampCount.value,
  }
  frame = requestAnimationFrame(read)
}

onMounted(() => {
  frame = requestAnimationFrame(read)
})
onBeforeUnmount(() => cancelAnimationFrame(frame))
</script>
<style lang="scss" scoped>
.keyboard-lab {
  top: 4.6rem;
  left: 0.6rem;
  z-index: 2000;
  position: fixed;
  padding: 0.5rem 0.8rem;
  font-size: 1.05rem;
  line-height: 1.45;
  font-family: monospace;
  color: hsl(140, 70%, 75%);
  background: hsla(220, 30%, 8%, 0.82);
  border-radius: 0.6rem;
  pointer-events: none;
}
</style>
