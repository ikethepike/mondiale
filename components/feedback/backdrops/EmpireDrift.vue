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
      :style="ghost.style"
    />
  </svg>
</template>
<script lang="ts" setup>
import { EMPIRE_PATHS } from '~~/data/empire-paths.gen'
import { sampleMany } from '~~/lib/arrays'
import { seededRandom } from '~~/lib/random'

/**
 * The empires card's ground: old borders, surfacing and fading.
 *
 * Real keyframe extents from the historical basemaps, drawn as outlines in the
 * map's own space — so the shapes are the actual reach of actual empires, not
 * decorative blobs. They cross-fade rather than morph: a morph is the empire
 * ROUND's own language (EmpireGhostField), and a backdrop that animates the
 * same way would read as the question starting early.
 */
const props = defineProps<{ seed: number }>()

const GHOSTS = 7

const ghosts = computed(() => {
  const random = seededRandom(props.seed)
  // One extent per empire — a single empire's own keyframes are near-identical
  // shapes, and stacking them just thickens one outline.
  const extents = Object.entries(EMPIRE_PATHS)
    .map(([id, paths]) => ({ id, d: paths[Math.floor(random() * paths.length)] }))
    .filter((entry): entry is { id: string; d: string } => !!entry.d)
  return sampleMany(extents, GHOSTS, random).map((entry, index) => ({
    key: entry.id,
    d: entry.d,
    style: {
      // Staggered so one is always arriving as another leaves.
      animationDelay: `${(-index * 2.6 - random() * 2).toFixed(2)}s`,
      animationDuration: `${(17 + random() * 7).toFixed(2)}s`,
    } as Record<string, string>,
  }))
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.empire-drift {
  inset: 0;
  z-index: 0;
  position: absolute;
  pointer-events: none;
  opacity: 0.75;
  mask-image: radial-gradient(ellipse 54% 48% at 50% 50%, transparent 40%, black 86%);
}

.ghost {
  fill: ink(0.07);
  stroke: ink(0.42);
  stroke-width: 2.5;
  stroke-linejoin: round;
  // The RESTING state is visible, and the animation moves away from it — not
  // toward it. Under reduced motion `.ambient-loop` stops the animation dead,
  // so an outline that starts at opacity 0 stays at opacity 0 and the card
  // renders blank. This is the ContourRipple mistake, and it is easy to make
  // twice: paint the still frame first, animate second.
  opacity: 0.55;
  animation: empire-surface 20s ease-in-out infinite;
}

// Never fully present: an extent that resolves completely reads as the answer
// to a round that has not been asked yet.
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
