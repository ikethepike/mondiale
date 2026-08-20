<template>
  <svg
    class="empire-drift"
    viewBox="0 0 2000 1001"
    preserveAspectRatio="xMidYMid slice"
    aria-hidden="true"
  >
    <path
      v-for="ghost in ghosts"
      :key="ghost.key"
      class="ghost ambient-loop"
      :d="ghost.d"
      pathLength="1"
      :style="ghost.style"
    />
  </svg>
</template>
<script lang="ts" setup>
import { EMPIRE_PATHS } from '~~/data/empire-paths.gen'
import { sampleMany } from '~~/lib/arrays'
import { seededRandom } from '~~/lib/random'

/** Real historical extents, surfacing and fading. */
const props = defineProps<{ seed: number }>()

const GHOSTS = 7

const ghosts = computed(() => {
  const random = seededRandom(props.seed)
  const extents = Object.entries(EMPIRE_PATHS)
    .map(([id, paths]) => ({ id, d: paths[Math.floor(random() * paths.length)] }))
    .filter((entry): entry is { id: string; d: string } => !!entry.d)
  return sampleMany(extents, GHOSTS, random).map((entry, index) => ({
    key: entry.id,
    d: entry.d,
    style: {
      '--draw-delay': `${(index * 0.22).toFixed(2)}s`,
      animationDelay: `${(-index * 2.6 - random() * 2).toFixed(2)}s`,
      animationDuration: `${(17 + random() * 7).toFixed(2)}s`,
    } as Record<string, string>,
  }))
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/backdrop' as *;
@use '~/assets/scss/rules/ink' as *;

.empire-drift {
  @include backdrop-field(0.95, 1.08);
}

.ghost {
  fill: ink(0.07);
  stroke: ink(0.42);
  stroke-dasharray: 1;
  stroke-dashoffset: 0;
  stroke-width: 3.4;
  stroke-linejoin: round;
  opacity: 0.55;
  animation:
    stroke-draw 1.4s var(--ease-out-expressive) var(--draw-delay, 0s) both,
    empire-surface 20s ease-in-out infinite;
}

@keyframes empire-surface {
  0%,
  100% {
    opacity: 0.06;
  }
  18%,
  40% {
    opacity: 0.9;
  }
  62% {
    opacity: 0.06;
  }
}
</style>
