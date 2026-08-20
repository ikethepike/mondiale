<template>
  <div class="bloc-drift" aria-hidden="true">
    <span v-for="ring in rings" :key="ring.key" class="ring ambient-loop" :style="ring.style" />
  </div>
</template>
<script lang="ts" setup>
import { seededRandom } from '~~/lib/random'

/**
 * The blocs card's ground: overlapping memberships.
 *
 * Every mode under this toggle asks who belongs to what — the EU, NATO, OPEC,
 * Schengen — and those rosters overlap rather than partition. Interlocking
 * rings are that idea and nothing more; no ring is labelled, so none is a set
 * a player could name.
 */
const props = defineProps<{ seed: number }>()

const RINGS = 11

const rings = computed(() => {
  const random = seededRandom(props.seed)
  return Array.from({ length: RINGS }, (_, index) => {
    const size = 16 + random() * 30
    return {
      key: `ring-${index}`,
      style: {
        left: `${(random() * 100 - 12).toFixed(1)}%`,
        top: `${(random() * 100 - 12).toFixed(1)}%`,
        width: `${size.toFixed(1)}rem`,
        height: `${size.toFixed(1)}rem`,
        animationDelay: `${(-random() * 20).toFixed(2)}s`,
        animationDuration: `${(16 + random() * 12).toFixed(2)}s`,
        opacity: (0.16 + random() * 0.26).toFixed(2),
      } as Record<string, string>,
    }
  })
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.bloc-drift {
  inset: 0;
  z-index: 0;
  overflow: hidden;
  position: absolute;
  pointer-events: none;
  opacity: 0.8;
  mask-image: radial-gradient(ellipse 50% 44% at 50% 50%, transparent 34%, black 80%);
}

.ring {
  display: block;
  position: absolute;
  border-radius: 50%;
  border: 2px solid var(--soft-blue);
  animation: bloc-breathe 20s ease-in-out infinite;
}

@keyframes bloc-breathe {
  0%,
  100% {
    transform: scale(0.96) translate3d(0, 0, 0);
  }
  50% {
    transform: scale(1.05) translate3d(2%, -2%, 0);
  }
}
</style>
