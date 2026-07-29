<template>
  <svg class="verdict-stamp" :class="status" viewBox="0 0 48 48" aria-hidden="true">
    <circle cx="24" cy="24" r="21" />
    <circle cx="24" cy="24" r="16.5" />
    <path v-if="status === 'correct'" d="M15.5 24.5l6 6 11-12" />
    <path v-else d="M17.5 17.5l13 13M30.5 17.5l-13 13" />
  </svg>
</template>
<script lang="ts" setup>
/**
 * The verdict's ink: a tilted passport stamp that thumps down beside the
 * result heading — teal ring and check for a correct call, flame ring and
 * cross for a miss. Size from the host via width/height (default 5.2rem);
 * the thump plays on mount, so re-key to replay.
 */
defineProps({
  status: {
    type: String as PropType<'correct' | 'incorrect'>,
    required: true,
  },
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.verdict-stamp {
  width: 5.2rem;
  height: 5.2rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  transform: rotate(-8deg);
  animation: stamp-thump 0.45s var(--ease-out-expressive) both;
  animation-delay: 0.3s;

  &.correct {
    color: hsl(170.5, 44%, 32%);
  }
  &.incorrect {
    color: flame();
  }
}

@keyframes stamp-thump {
  from {
    opacity: 0;
    transform: scale(1.8) rotate(-16deg);
  }
  60% {
    opacity: 1;
    transform: scale(0.92) rotate(-8deg);
  }
  to {
    opacity: 1;
    transform: scale(1) rotate(-8deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .verdict-stamp {
    animation: none;
  }
}
</style>
