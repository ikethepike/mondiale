<template>
  <svg class="trend-drift" viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true">
    <path
      v-for="line in lines"
      :key="line.key"
      class="line ambient-loop"
      :d="line.d"
      :style="line.style"
    />
  </svg>
</template>
<script lang="ts" setup>
import { seededRandom } from '~~/lib/random'

/**
 * The trends card's ground: curves climbing and falling.
 *
 * Drawn, not read from a series — every real curve here is somebody's answer
 * later in the round, and a backdrop that plots one has shown the shape of it.
 * A random walk with a drift term reads like the genuine article and says
 * nothing about anybody.
 */
const props = defineProps<{ seed: number }>()

const LINES = 10
const STEPS = 28

const lines = computed(() => {
  const random = seededRandom(props.seed)
  return Array.from({ length: LINES }, (_, index) => {
    const drift = (random() - 0.4) * 2.6
    let value = 30 + random() * 60
    const points = Array.from({ length: STEPS + 1 }, (_, step) => {
      value = Math.max(6, Math.min(114, value + drift + (random() - 0.5) * 11))
      return `${((step / STEPS) * 400).toFixed(1)},${value.toFixed(1)}`
    })
    return {
      key: `line-${index}`,
      d: `M ${points.join(' L ')}`,
      style: {
        animationDelay: `${(-random() * 24).toFixed(2)}s`,
        animationDuration: `${(20 + random() * 16).toFixed(2)}s`,
        opacity: (0.45 + random() * 0.45).toFixed(2),
      } as Record<string, string>,
    }
  })
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.trend-drift {
  inset: 0;
  z-index: 0;
  position: absolute;
  pointer-events: none;
  opacity: 0.95;
  mask-image: radial-gradient(ellipse 50% 44% at 50% 50%, transparent 36%, black 82%);
}

.line {
  fill: none;
  stroke: ink(0.42);
  stroke-width: 2.4;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
  animation: trend-slide 26s linear infinite;
}

@keyframes trend-slide {
  from {
    transform: translate3d(-6%, 0, 0);
  }
  to {
    transform: translate3d(6%, 0, 0);
  }
}
</style>
