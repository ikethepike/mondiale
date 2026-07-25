<template>
  <div class="challenge-console" :class="{ low }">
    <div class="console-input"><slot /></div>
    <ChallengeTimerRadial class="console-clock" :value="value" :total="total" />
  </div>
</template>
<script lang="ts" setup>
import { computed } from 'vue'
import ChallengeTimerRadial from '~/components/challenge/ChallengeTimerRadial.vue'

/**
 * The timed modes' guess console: one map-caption pill holding the slotted
 * input and the round clock, its face bare so the bezel reads as part of the
 * control. Over the round's final fifth the pill's border slowly warms to the
 * warning hue — the earliest rung of the time-pressure ladder (20% border,
 * 10s ink, 5s breath). `value` of `total` seconds, the ChallengeTimer contract.
 */
const props = defineProps<{ value: number; total: number }>()

const low = computed(
  () => props.total > 0 && props.value / props.total <= 0.2 && props.value / props.total < 1
)
</script>
<style lang="scss" scoped>
.challenge-console {
  gap: 0.2rem;
  display: flex;
  align-items: center;
  padding: 0.3rem 0.4rem 0.3rem 0;
  border-radius: 1.2rem;
  pointer-events: auto;
  backdrop-filter: blur(0.5rem);
  background: hsla(36, 100%, 98%, 0.85);
  border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.2);
  // Slow on purpose: the warming border is a tide, not an alarm.
  transition: border-color 2s var(--ease-smooth);

  &.low {
    border-color: var(--hior-ange);
  }
}

.console-input {
  flex: 1;
  min-width: 0;

  // The slotted guess input sheds its own pill — the console is the pill.
  :deep(.guess-form) {
    width: 100%;
    border: none;
    min-width: 0;
    background: none;
    backdrop-filter: none;
  }
}

.console-clock {
  flex: none;
  --clock-size: 4.6rem;
  --clock-seconds-size: 1.5rem;
  --clock-disc-fill: transparent;
  --clock-disc-stroke: transparent;
}

@media (prefers-reduced-motion: reduce) {
  .challenge-console {
    transition: none;
  }
}
</style>
