<template>
  <div class="society-drift" aria-hidden="true">
    <div v-for="row in rows" :key="row.key" class="row ambient-loop" :style="row.style">
      <span class="bar left" :style="{ width: `${row.left}%` }" />
      <span class="bar right" :style="{ width: `${row.right}%` }" />
    </div>
  </div>
</template>
<script lang="ts" setup>
import { seededRandom } from '~~/lib/random'

/**
 * The society card's ground: an age pyramid, abstracted.
 *
 * Paired bars narrowing upward — the silhouette every population shares,
 * whatever its numbers. Generated rather than taken from PYRAMIDS, because a
 * real country's structure is precisely what the pyramid round asks a player
 * to recognise.
 */
const props = defineProps<{ seed: number }>()

const ROWS = 17

const rows = computed(() => {
  const random = seededRandom(props.seed)
  return Array.from({ length: ROWS }, (_, index) => {
    // Cohorts thin toward the top, with the jitter real censuses carry.
    const share = (1 - index / ROWS) ** 1.35
    const jitter = 0.82 + random() * 0.36
    const width = Math.max(4, share * 42 * jitter)
    return {
      key: `row-${index}`,
      left: width,
      right: width * (0.86 + random() * 0.28),
      style: {
        animationDelay: `${(-random() * 14).toFixed(2)}s`,
        animationDuration: `${(9 + random() * 7).toFixed(2)}s`,
        opacity: (0.3 + random() * 0.35).toFixed(2),
      } as Record<string, string>,
    }
  })
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.society-drift {
  inset: 0;
  z-index: 0;
  gap: 0.5%;
  display: flex;
  overflow: hidden;
  position: absolute;
  padding: 4% 0;
  flex-flow: column-reverse nowrap;
  pointer-events: none;
  opacity: 0.85;
  mask-image: radial-gradient(ellipse 50% 44% at 50% 50%, transparent 34%, black 80%);
}

.row {
  flex: 1;
  gap: 0.7%;
  display: flex;
  min-height: 0;
  align-items: stretch;
  justify-content: center;
  animation: cohort-breathe 11s ease-in-out infinite;
}

.bar {
  background: ink(0.42);
  border-radius: 2px;
}

.left {
  justify-self: end;
}

// Resting state is the full bar; the breath only narrows it.
@keyframes cohort-breathe {
  0%,
  100% {
    transform: scaleX(1);
  }
  50% {
    transform: scaleX(0.93);
  }
}
</style>
