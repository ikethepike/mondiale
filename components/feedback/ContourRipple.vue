<template>
  <svg class="contour-ripple" :class="tone" viewBox="0 0 200 200" aria-hidden="true">
    <path v-for="(ring, index) in RINGS" :key="index" ref="rings" :d="ring" pathLength="1" />
  </svg>
</template>
<script lang="ts" setup>
import { gsap } from 'gsap'
import { prefersReducedMotion } from '~~/lib/motion'

// The one success flourish: three irregular contour rings expanding outward —
// the 2D twin of the board terrain's shader ripple. No particles, one color.
const props = defineProps({
  autoplay: {
    type: Boolean,
    default: true,
  },
  delay: {
    type: Number,
    default: 0,
  },
  // 'success' rings in mint, 'alert' rings in coral (challenge hits)
  tone: {
    type: String as PropType<'success' | 'alert'>,
    default: 'success',
  },
})

// Hand-tuned wobbly closed paths, echoing hand-drawn contour lines
const RINGS = [
  'M100 62c22-3 36 8 40 24s-5 34-24 40-40-2-46-18 3-43 30-46z',
  'M100 42c30-4 52 12 58 34s-6 48-33 57-58-2-66-26 3-60 41-65z',
  'M100 22c40-5 70 16 77 45s-9 63-44 75-77-3-87-35 4-78 54-85z',
]

const rings = ref<SVGPathElement[]>([])

const play = () => {
  if (!rings.value.length || prefersReducedMotion()) return

  gsap.fromTo(
    rings.value,
    { scale: 0.4, opacity: 0.9, transformOrigin: '50% 50%' },
    {
      scale: 1.12,
      opacity: 0,
      duration: 0.9,
      ease: 'expo.out',
      stagger: 0.12,
      delay: props.delay,
    }
  )
}

onMounted(() => {
  gsap.set(rings.value, { opacity: 0 })
  if (props.autoplay) play()
})

onUnmounted(() => {
  rings.value.forEach(ring => gsap.killTweensOf(ring))
})

defineExpose({ play })
</script>
<style scoped>
.contour-ripple {
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: none;
}

path {
  fill: none;
  opacity: 0;
  stroke-width: 2;
  stroke: var(--soft-mint);
}

.alert path {
  stroke: var(--hior-ange);
}
</style>
