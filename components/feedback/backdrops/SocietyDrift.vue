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

/** An age pyramid, abstracted. */
const props = defineProps<{ seed: number }>()

const ROWS = 17

const rows = computed(() => {
  const random = seededRandom(props.seed)
  return Array.from({ length: ROWS }, (_, index) => {
    const share = (1 - index / ROWS) ** 1.35
    const jitter = 0.82 + random() * 0.36
    const width = Math.max(4, share * 42 * jitter)
    return {
      key: `row-${index}`,
      left: width,
      right: width * (0.86 + random() * 0.28),
      style: {
        '--at': `${(index * 0.05 + random() * 0.25).toFixed(2)}s`,
        opacity: (0.3 + random() * 0.35).toFixed(2),
      } as Record<string, string>,
    }
  })
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/backdrop' as *;
@use '~/assets/scss/rules/ink' as *;

.society-drift {
  @include backdrop-field(0.4);
  gap: 0.5%;
  display: flex;
  overflow: hidden;
  padding: 4% 0;
  flex-flow: column-reverse nowrap;
}

.row {
  flex: 1;
  gap: 0.7%;
  display: flex;
  min-height: 0;
  align-items: stretch;
  justify-content: center;
  animation: cohort-in 0.5s var(--ease-out-expressive) var(--at, 0s) backwards;
}

.bar {
  background: ink(0.3);
  border-radius: 2px;
}

.left {
  justify-self: end;
}

@keyframes cohort-in {
  from {
    opacity: 0;
    scale: 0.4 1;
  }
  to {
    opacity: 1;
    scale: 1 1;
  }
}
</style>
