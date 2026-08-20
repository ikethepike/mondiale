<template>
  <svg class="water-drift" viewBox="0 0 400 200" preserveAspectRatio="none" aria-hidden="true">
    <path
      v-for="line in lines"
      :key="line.key"
      class="isobath ambient-loop"
      :d="line.d"
      :style="line.style"
    />
  </svg>
</template>
<script lang="ts" setup>
import { seededRandom } from '~~/lib/random'

/**
 * The water card's ground: isobaths — the nested contours a chart draws round
 * a depth. The hand-drawn idiom ContourRipple established, held still and
 * spread wide instead of expanding from a point.
 */
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
        animationDelay: `${(-random() * 30).toFixed(2)}s`,
        animationDuration: `${(24 + random() * 18).toFixed(2)}s`,
        animationDirection: index % 2 ? 'reverse' : 'normal',
        opacity: (0.25 + random() * 0.4).toFixed(2),
      } as Record<string, string>,
    }
  })
})
</script>
<style lang="scss" scoped>
.water-drift {
  inset: 0;
  z-index: 0;
  position: absolute;
  pointer-events: none;
  opacity: 0.6;
  mask-image: radial-gradient(ellipse 50% 44% at 50% 50%, transparent 36%, black 82%);
}

.isobath {
  fill: none;
  stroke: var(--soft-blue);
  stroke-width: 1.5;
  vector-effect: non-scaling-stroke;
  animation: isobath-drift 30s linear infinite;
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
