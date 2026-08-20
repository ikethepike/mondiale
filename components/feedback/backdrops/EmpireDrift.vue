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

/** Real historical extents, surfacing and fading. They cross-fade rather than
 *  morph — morphing is the empire ROUND's own language (EmpireGhostField). */
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
      // The draw happens once on arrival; the surfacing loop opens mid-way.
      '--draw-delay': `${(index * 0.22).toFixed(2)}s`,
      animationDelay: `${(-index * 2.6 - random() * 2).toFixed(2)}s`,
      animationDuration: `${(17 + random() * 7).toFixed(2)}s`,
    } as Record<string, string>,
  }))
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.empire-drift {
  // Paints its own ground: the shell's backdrop blur is ~90% of the frame
  // budget at 4x throttle, and an opaque field makes it unnecessary.
  background: var(--sour-milk);
  inset: 0;
  z-index: 0;
  position: absolute;
  pointer-events: none;
  opacity: 0.95;
}

.empire-drift > * {
  mask-image: radial-gradient(ellipse 54% 48% at 50% 50%, transparent 40%, black 86%);
}

@media (prefers-reduced-motion: reduce) {
  .ghost {
    stroke-dashoffset: 0;
  }
}

.ghost {
  fill: ink(0.07);
  stroke: ink(0.42);
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  stroke-width: 3.4;
  stroke-linejoin: round;
  // The RESTING state is visible, and the animation moves away from it — not
  // toward it. Under reduced motion `.ambient-loop` stops the animation dead,
  // so an outline that starts at opacity 0 stays at opacity 0 and the card
  // renders blank. This is the ContourRipple mistake, and it is easy to make
  // twice: paint the still frame first, animate second.
  opacity: 0.55;
  animation:
    stroke-draw 1.4s var(--ease-out-expressive) var(--draw-delay, 0s) forwards,
    empire-surface 20s ease-in-out infinite;
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
