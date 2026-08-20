<template>
  <svg class="water-drift" viewBox="0 0 400 200" preserveAspectRatio="none" aria-hidden="true">
    <path
      v-for="line in lines"
      :key="line.key"
      class="isobath ambient-loop"
      :d="line.d"
      pathLength="1"
      :style="line.style"
    />
  </svg>
</template>
<script lang="ts" setup>
import { seededRandom } from '~~/lib/random'

/** Isobaths — the nested contours a chart draws round a depth. */
const props = defineProps<{ seed: number }>()

const LINES = 13
const STEPS = 52

const lines = computed(() => {
  const random = seededRandom(props.seed)
  return Array.from({ length: LINES }, (_, index) => {
    const base = (index / (LINES - 1)) * 200
    const amplitude = 4 + random() * 11
    const frequency = 1 + random() * 2.2
    const phase = random() * Math.PI * 2
    const points = Array.from({ length: STEPS + 1 }, (_, step) => {
      const t = step / STEPS
      const y = base + Math.sin(t * Math.PI * 2 * frequency + phase) * amplitude
      return `${(t * 400).toFixed(1)},${y.toFixed(1)}`
    })
    return {
      key: `iso-${index}`,
      d: `M ${points.join(' L ')}`,
      style: {
        '--draw-delay': `${(index * 0.07).toFixed(2)}s`,
        animationDelay: `${(-random() * 30).toFixed(2)}s`,
        animationDuration: `${(24 + random() * 18).toFixed(2)}s`,
        animationDirection: index % 2 ? 'reverse' : 'normal',
        opacity: (0.45 + random() * 0.45).toFixed(2),
      } as Record<string, string>,
    }
  })
})
</script>
<style lang="scss" scoped>
.water-drift {
  mask-image: radial-gradient(ellipse 50% 44% at 50% 50%, transparent 36%, black 82%);
  inset: 0;
  z-index: 0;
  position: absolute;
  pointer-events: none;
  opacity: 0.95;
}

.isobath {
  fill: none;
  stroke: var(--soft-blue);
  stroke-width: 2.4;
  vector-effect: non-scaling-stroke;
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation:
    stroke-draw 1.2s var(--ease-out-expressive) var(--draw-delay, 0s) forwards,
    isobath-drift 30s linear infinite;
}

@media (prefers-reduced-motion: reduce) {
  .isobath {
    stroke-dashoffset: 0;
  }
}

@keyframes isobath-drift {
  from {
    transform: translate3d(-8%, 0, 0);
  }
  to {
    transform: translate3d(8%, 0, 0);
  }
}
</style>
