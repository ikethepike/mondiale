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
        '--at': `${(index * 0.05 + random() * 0.25).toFixed(2)}s`,
        opacity: (0.3 + random() * 0.35).toFixed(2),
      } as Record<string, string>,
    }
  })
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.bloc-drift {
  // Paints its own ground: the shell's backdrop blur is ~90% of the frame
  // budget at 4x throttle, and an opaque field makes it unnecessary.
  background: var(--sour-milk);
  inset: 0;
  z-index: 0;
  overflow: hidden;
  position: absolute;
  pointer-events: none;
  opacity: 1;
}

.bloc-drift > * {
  mask-image: radial-gradient(ellipse 50% 44% at 50% 50%, transparent 34%, black 80%);
}

.ring {
  display: block;
  position: absolute;
  border-radius: 50%;
  border: 3px solid var(--soft-blue);
  opacity: 0;
  animation: bloc-in 0.7s var(--ease-out-expressive) var(--at, 0s) forwards;
}

@keyframes bloc-in {
  from {
    opacity: 0;
    scale: 0.75;
  }
  to {
    opacity: 1;
    scale: 1;
  }
}
</style>
