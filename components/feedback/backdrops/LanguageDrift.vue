<template>
  <div class="language-drift" aria-hidden="true">
    <svg
      v-for="wave in waves"
      :key="wave.key"
      class="wave ambient-loop"
      :style="wave.style"
      viewBox="0 0 400 40"
      preserveAspectRatio="none"
    >
      <path :d="wave.d" />
    </svg>
  </div>
</template>
<script lang="ts" setup>
import { seededRandom } from '~~/lib/random'

/**
 * The language card's ground: speech seen rather than heard.
 *
 * Waveforms, because every mode under this toggle is something SAID — an
 * anthem playing, a language spoken aloud, a tongue named. Drawn rather than
 * sampled from the real audio: the actual clip is the round's subject, and a
 * backdrop tracing it would leak the answer's shape.
 */
const props = defineProps<{ seed: number }>()

const WAVES = 7
const STEPS = 64

const waves = computed(() => {
  const random = seededRandom(props.seed)
  return Array.from({ length: WAVES }, (_, index) => {
    // A sum of three sines reads as speech; one reads as a test tone.
    const a = 0.5 + random() * 1.6
    const b = 1.4 + random() * 2.8
    const c = 3 + random() * 4
    const phase = random() * Math.PI * 2
    const points = Array.from({ length: STEPS + 1 }, (_, step) => {
      const t = step / STEPS
      const value =
        Math.sin(t * Math.PI * 2 * a + phase) * 0.5 +
        Math.sin(t * Math.PI * 2 * b + phase) * 0.3 +
        Math.sin(t * Math.PI * 2 * c + phase) * 0.2
      return `${(t * 400).toFixed(1)},${(20 + value * 17).toFixed(1)}`
    })
    return {
      key: `wave-${index}`,
      d: `M ${points.join(' L ')}`,
      style: {
        top: `${8 + index * 13}%`,
        animationDelay: `${(-random() * 30).toFixed(2)}s`,
        animationDuration: `${(26 + random() * 20).toFixed(2)}s`,
        animationDirection: index % 2 ? 'reverse' : 'normal',
        opacity: (0.3 + random() * 0.4).toFixed(2),
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
  overflow: hidden;
  position: absolute;
  pointer-events: none;
  opacity: 0.55;
  mask-image: radial-gradient(ellipse 50% 44% at 50% 50%, transparent 36%, black 82%);
}

.wave {
  left: -30%;
  width: 160%;
  height: 12%;
  position: absolute;
  animation: wave-slide 32s linear infinite;

  path {
    fill: none;
    stroke: ink(0.4);
    stroke-width: 1.4;
    vector-effect: non-scaling-stroke;
  }
}

@keyframes wave-slide {
  from {
    transform: translate3d(-12%, 0, 0);
  }
  to {
    transform: translate3d(12%, 0, 0);
  }
}
</style>
