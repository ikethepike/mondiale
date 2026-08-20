<template>
  <svg
    class="conflict-drift"
    viewBox="0 0 2000 1001"
    preserveAspectRatio="xMidYMid slice"
    aria-hidden="true"
  >
    <g class="swarm ambient-loop">
      <circle
        v-for="dot in dots"
        :key="dot.key"
        :cx="dot.x"
        :cy="dot.y"
        :r="dot.r"
        :style="dot.style"
      />
    </g>
  </svg>
</template>
<script lang="ts" setup>
import { CONFLICT_FIELDS } from '~~/data/conflict-events.gen'
import { sampleMany } from '~~/lib/arrays'
import { seededRandom } from '~~/lib/random'

/**
 * The conflicts card's ground: real UCDP event points, breathing.
 *
 * The points are already projected into the map's own viewBox (the generator
 * does it, so ConflictDotField can lay them straight over the map), which
 * means the swarm carries the SHAPE of where the world actually fights — the
 * Sahel, the Levant, the Horn — rather than a scatter that only looks busy.
 * Nothing here is a question: no country is named and no borders are drawn.
 */
const props = defineProps<{ seed: number }>()

const DOTS = 320

const dots = computed(() => {
  const random = seededRandom(props.seed)
  const points = Object.values(CONFLICT_FIELDS).flatMap(
    field => field?.eras.flatMap(era => era.points) ?? []
  )
  return sampleMany(points, DOTS, random).map((point, index) => ({
    key: `${index}-${point[0]}-${point[1]}`,
    x: point[0],
    y: point[1],
    r: 2.5 + random() * 6,
    style: {
      // Each dot breathes on its own phase, so the field never pulses as one
      // body — a swarm, not a heartbeat.
      animationDelay: `${(-random() * 9).toFixed(2)}s`,
      animationDuration: `${(6 + random() * 6).toFixed(2)}s`,
      opacity: (0.25 + random() * 0.55).toFixed(2),
    } as Record<string, string>,
  }))
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.conflict-drift {
  inset: 0;
  z-index: 0;
  position: absolute;
  pointer-events: none;
  opacity: 0.85;
  mask-image: radial-gradient(ellipse 46% 40% at 50% 50%, transparent 30%, black 76%);
}

circle {
  fill: flame(0.55);
  animation: conflict-breathe 8s ease-in-out infinite;
  transform-box: fill-box;
  transform-origin: center;
}

@keyframes conflict-breathe {
  0%,
  100% {
    transform: scale(0.75);
  }
  50% {
    transform: scale(1.25);
  }
}
</style>
