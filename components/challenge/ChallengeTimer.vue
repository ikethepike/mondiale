<template>
  <div class="timer-track" aria-hidden="true">
    <div class="timer-fill" :style="{ width: `${percent}%` }" />
  </div>
</template>
<script lang="ts" setup>
import { computed } from 'vue'

/**
 * The round's progress bar. `value` of `total` — seconds remaining out of the
 * round's duration for the timed modes, clues revealed out of clues for
 * stat-detective, which drains the other way but reads the same.
 */
const props = defineProps<{ value: number; total: number }>()

// Timed modes decrement once more on the tick that fires onTimeout, so `value`
// reaches -1. Clamp rather than render a negative width.
const percent = computed(() => {
  if (!props.total) return 0
  return Math.min(100, Math.max(0, (props.value / props.total) * 100))
})
</script>
<style lang="scss" scoped>
// No outer margin: spacing belongs to the call site's layout, not the bar.
.timer-track {
  width: 100%;
  height: 0.5rem;
  max-width: 46rem;
  overflow: hidden;
  border-radius: 0.25rem;
  background: hsla(215.7, 76.4%, 21.6%, 0.12);
}

.timer-fill {
  height: 100%;
  background: var(--soft-blue);
  transition: width 1s linear;
}
</style>
