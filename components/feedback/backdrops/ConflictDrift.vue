<template>
  <svg
    class="conflict-drift"
    viewBox="0 0 2000 1001"
    preserveAspectRatio="xMidYMid slice"
    aria-hidden="true"
  >
    <g v-for="strike in strikes" :key="strike.key" :style="strike.style">
      <circle class="shock" :cx="strike.x" :cy="strike.y" :r="strike.reach" />
      <circle class="shock late" :cx="strike.x" :cy="strike.y" :r="strike.reach" />
      <circle class="core" :cx="strike.x" :cy="strike.y" :r="strike.core" />
    </g>
  </svg>
</template>
<script lang="ts" setup>
import { CONFLICT_FIELDS } from '~~/data/conflict-events.gen'
import { sampleMany } from '~~/lib/arrays'
import { seededRandom } from '~~/lib/random'

/** Real UCDP event points, pre-projected — so the field carries the shape of
 *  where the world actually fights. Each lands as a flashpoint: a core, then
 *  two shock rings pushing out and fading. No country named. */
const props = defineProps<{ seed: number }>()

const STRIKES = 110

const strikes = computed(() => {
  const random = seededRandom(props.seed)
  const points = Object.values(CONFLICT_FIELDS).flatMap(
    field => field?.eras.flatMap(era => era.points) ?? []
  )
  return sampleMany(points, STRIKES, random).map((point, index) => ({
    key: `${index}-${point[0]}-${point[1]}`,
    x: point[0],
    y: point[1],
    core: 4 + random() * 6,
    reach: 22 + random() * 34,
    style: {
      '--at': `${(index * 0.018 + random() * 0.3).toFixed(2)}s`,
      '--beat': `${(3.6 + random() * 2.4).toFixed(2)}s`,
    } as Record<string, string>,
  }))
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.conflict-drift {
  // Paints its own ground: the shell's backdrop blur is ~90% of the frame
  // budget at 4x throttle, and an opaque field makes it unnecessary.
  background: var(--sour-milk);
  inset: 0;
  z-index: 0;
  position: absolute;
  pointer-events: none;
  opacity: 0.9;
}

.conflict-drift > * {
  mask-image: radial-gradient(ellipse 46% 40% at 50% 50%, transparent 30%, black 76%);
}

.core {
  fill: flame(0.95);
  opacity: 0;
  transform-box: fill-box;
  transform-origin: center;
  animation: strike-land 0.5s var(--ease-out-expressive) var(--at, 0s) forwards;
}

.shock {
  fill: none;
  stroke: flame(0.8);
  stroke-width: 3;
  opacity: 0;
  transform-box: fill-box;
  transform-origin: center;
  animation: shock-out 1.5s ease-out var(--at, 0s) forwards;
}

.late {
  animation-delay: calc(var(--at, 0s) + 0.4s);
}

@media (prefers-reduced-motion: reduce) {
  .core {
    opacity: 0.8;
    animation: none;
  }

  .shock {
    opacity: 0.25;
    animation: none;
  }
}

@keyframes strike-land {
  from {
    opacity: 0;
    scale: 0.2;
  }
  to {
    opacity: 0.95;
    scale: 1;
  }
}

@keyframes shock-out {
  0% {
    opacity: 0;
    scale: 0.15;
  }
  18% {
    opacity: 0.85;
  }
  100% {
    opacity: 0;
    scale: 1;
  }
}
</style>
