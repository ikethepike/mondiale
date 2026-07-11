<template>
  <!-- Safe v-html: our own generated flag SVGs, parsed and rebuilt locally;
       no user input ever flows in -->
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div class="flag-sketch" :style="{ '--draw-seconds': `${drawSeconds}s` }" v-html="sketch" />
</template>
<script lang="ts" setup>
/**
 * The flag as a drawing lesson: every shape stripped of its fill and drawn on
 * as a single ink line, all shapes in step (pathLength normalizes them), the
 * whole sketch finishing exactly when the round's clock does. Vector in,
 * vector out — it scales to a full background without a pixel in sight.
 */
const props = defineProps<{
  /** The raw flag SVG markup (COUNTRIES[iso].flag). */
  flag: string
  /** Seconds the draw-on takes — sync to the remaining clock. */
  drawSeconds: number
}>()

const SHAPES = 'path, rect, circle, ellipse, polygon, polyline, line'

const sketch = computed(() => {
  if (typeof window === 'undefined') return ''
  const doc = new DOMParser().parseFromString(props.flag, 'image/svg+xml')
  const svg = doc.documentElement
  if (svg.nodeName !== 'svg') return ''

  svg.setAttribute('width', '100%')
  svg.setAttribute('height', '100%')
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  svg.removeAttribute('id')

  // Groups often carry the fills; shapes get ink lines and a shared,
  // normalized length so every stroke draws in step
  for (const group of svg.querySelectorAll('g')) {
    group.removeAttribute('style')
    group.setAttribute('fill', 'none')
  }
  for (const shape of svg.querySelectorAll(SHAPES)) {
    shape.removeAttribute('style')
    shape.setAttribute('fill', 'none')
    shape.setAttribute('stroke', 'currentColor')
    shape.setAttribute('stroke-width', '1.5')
    shape.setAttribute('vector-effect', 'non-scaling-stroke')
    shape.setAttribute('pathLength', '1')
    shape.classList.add('sketch-line')
  }
  return svg.outerHTML
})
</script>
<style lang="scss">
// Unscoped: the svg arrives via v-html, outside the scoped-attr reach
.flag-sketch {
  inset: 0;
  position: absolute;
  color: hsla(215.7, 76.4%, 21.6%, 0.4);
  pointer-events: none;

  .sketch-line {
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: sketch-draw linear forwards;
    animation-duration: var(--draw-seconds, 20s);
  }
}

@keyframes sketch-draw {
  to {
    stroke-dashoffset: 0;
  }
}

// A landscape flag letterboxes small on a phone — portrait screens get it
// rotated to fill the tall canvas instead
@media (orientation: portrait) {
  .flag-sketch svg {
    top: 50%;
    left: 50%;
    width: 100vh;
    height: 100vw;
    position: absolute;
    transform: translate(-50%, -50%) rotate(90deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .flag-sketch .sketch-line {
    animation-duration: 0.6s;
  }
}
</style>
