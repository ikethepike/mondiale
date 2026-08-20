<template>
  <svg
    class="language-drift"
    viewBox="0 0 400 300"
    preserveAspectRatio="xMidYMid slice"
    aria-hidden="true"
  >
    <!-- Back to front, so a nearer ridge masks the one behind it. -->
    <path
      v-for="ridge in ridges"
      :key="ridge.key"
      class="ridge"
      :d="ridge.d"
      :style="ridge.style"
    />
  </svg>
</template>
<script lang="ts" setup>
import { seededRandom } from '~~/lib/random'

/** Stacked waveform ridges — one line per voice, each filled so it occludes
 *  the one behind. Synthesised, not sampled: the real clip is the round's
 *  subject. */
const props = defineProps<{ seed: number }>()

const RIDGES = 22
const STEPS = 90
const W = 400
const H = 300

const ridges = computed(() => {
  const random = seededRandom(props.seed)
  return Array.from({ length: RIDGES }, (_, index) => {
    const baseline = 22 + (index / (RIDGES - 1)) * (H - 44)
    // Energy peaks mid-line and dies at the edges, so each ridge sits flat on
    // its baseline before and after it speaks.
    const centre = 0.4 + random() * 0.2
    const spread = 0.1 + random() * 0.08
    const height = 13 + random() * 15
    const detail = 2 + Math.floor(random() * 3)
    const waves = Array.from({ length: detail }, () => ({
      frequency: 5 + random() * 13,
      amplitude: 0.35 + random() * 0.65,
      phase: random() * Math.PI * 2,
    }))
    const points = Array.from({ length: STEPS + 1 }, (_, step) => {
      const t = step / STEPS
      const envelope = Math.exp(-((t - centre) ** 2) / (2 * spread * spread))
      let value = 0
      for (const wave of waves) {
        value += Math.sin(t * Math.PI * 2 * wave.frequency + wave.phase) * wave.amplitude
      }
      const y = baseline - Math.abs(value) * envelope * height
      return `${(t * W).toFixed(1)},${y.toFixed(1)}`
    })
    // Closed along its own baseline so the fill hides whatever is behind.
    return {
      key: `ridge-${index}`,
      d: `M 0,${baseline.toFixed(1)} L ${points.join(' L ')} L ${W},${baseline.toFixed(1)} z`,
      style: {
        '--at': `${(index * 0.075).toFixed(2)}s`,
      } as Record<string, string>,
    }
  })
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.language-drift {
  inset: 0;
  z-index: 0;
  position: absolute;
  pointer-events: none;
  opacity: 0.55;
  mask-image: radial-gradient(ellipse 54% 48% at 50% 50%, transparent 38%, black 86%);
}

.ridge {
  fill: var(--sour-milk);
  stroke: ink(0.5);
  stroke-width: 1.1;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
  opacity: 0;
  animation: ridge-in 0.75s var(--ease-out-expressive) var(--at, 0s) forwards;
}

@media (prefers-reduced-motion: reduce) {
  .ridge {
    opacity: 1;
    animation: none;
  }
}

// Each voice fades up and settles, top to bottom.
@keyframes ridge-in {
  from {
    opacity: 0;
    translate: 0 8px;
  }
  to {
    opacity: 1;
    translate: 0 0;
  }
}
</style>
