<template>
  <div class="place-drift" aria-hidden="true">
    <span v-for="mark in marks" :key="mark.key" class="mark ambient-loop" :style="mark.style" />
  </div>
</template>
<script lang="ts" setup>
import { seededRandom } from '~~/lib/random'

/**
 * The places card's ground: pins over nothing.
 *
 * The temptation is landmark photographs, and they are the one thing this
 * cannot use — 330KB apiece, and every photo is a subject the round deals.
 * Concentric drop-pin rings say "a place, located" without being any place.
 */
const props = defineProps<{ seed: number }>()

const MARKS = 16

const marks = computed(() => {
  const random = seededRandom(props.seed)
  return Array.from({ length: MARKS }, (_, index) => {
    const size = 6 + random() * 16
    return {
      key: `mark-${index}`,
      style: {
        left: `${(random() * 108 - 4).toFixed(1)}%`,
        top: `${(random() * 108 - 4).toFixed(1)}%`,
        width: `${size.toFixed(1)}rem`,
        height: `${size.toFixed(1)}rem`,
        animationDelay: `${(-random() * 12).toFixed(2)}s`,
        animationDuration: `${(9 + random() * 8).toFixed(2)}s`,
        opacity: (0.2 + random() * 0.35).toFixed(2),
      } as Record<string, string>,
    }
  })
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.place-drift {
  inset: 0;
  z-index: 0;
  overflow: hidden;
  position: absolute;
  pointer-events: none;
  opacity: 0.7;
  mask-image: radial-gradient(ellipse 50% 44% at 50% 50%, transparent 34%, black 80%);
}

.mark {
  display: block;
  position: absolute;
  border-radius: 50%;
  border: 1.5px solid ink(0.32);
  // The inner ring makes it a pin rather than a bubble.
  box-shadow:
    inset 0 0 0 0.6rem transparent,
    inset 0 0 0 0.75rem ink(0.14);
  animation: pin-settle 12s ease-in-out infinite;
}

@keyframes pin-settle {
  0%,
  100% {
    transform: scale(0.94);
  }
  50% {
    transform: scale(1.06);
  }
}
</style>
