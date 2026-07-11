<template>
  <div class="night-console">
    <div class="tally">
      <span class="lit">{{ lit }} lit</span> · {{ quota }} to pass · {{ clock }}
    </div>
    <slot />
    <p v-if="feedback !== undefined" class="feedback" :class="{ visible: feedback }">
      {{ feedback }}
    </p>
    <ChallengeTimer :value="secondsLeft" :total="durationSeconds" />
  </div>
</template>
<script lang="ts" setup>
import ChallengeTimer from '~/components/challenge/ChallengeTimer.vue'

/**
 * The night modes' shared bottom card: dark glass, the lit/quota/clock tally,
 * a slotted input (bare or CountryGuessInput), and the round timer as the
 * card's bottom edge. Pass `feedback` (even '') to reserve the flash line.
 */
const props = defineProps<{
  lit: number
  quota: number
  secondsLeft: number
  durationSeconds: number
  feedback?: string
}>()

const clock = computed(() => {
  const seconds = Math.max(0, props.secondsLeft)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
})
</script>
<style lang="scss" scoped>
.night-console {
  gap: 0.6rem;
  left: 50%;
  bottom: 1.6rem;
  display: flex;
  padding: 1.2rem 1.6rem 0;
  position: absolute;
  overflow: visible; // suggestions open upward, past the card
  transform: translateX(-50%);
  align-items: center;
  flex-flow: column nowrap;
  border-radius: 1.4rem;
  pointer-events: auto;
  border: 0.1rem solid hsla(216, 30%, 45%, 0.35);
  background: hsla(216, 45%, 12%, 0.85);
  backdrop-filter: blur(0.6rem);
  box-shadow: 0 0.4rem 2.4rem hsla(216, 58%, 4%, 0.5);
  width: min(40rem, calc(100vw - 3.2rem));

  // The timer is the card's bottom edge, not a bar floating inside it
  :deep(.timer-track) {
    margin: 0.6rem -1.6rem 0;
    max-width: none;
    width: calc(100% + 3.2rem);
    border-radius: 0 0 1.4rem 1.4rem;
    background: hsla(216, 30%, 45%, 0.25);
  }
}

.tally {
  font-size: 1.2rem;
  color: hsla(216, 30%, 78%, 1);
  letter-spacing: 0.12em;
  text-transform: uppercase;

  .lit {
    color: hsla(45, 96%, 72%, 1);
    font-weight: bold;
  }
}

// Any slotted input — bare or CountryGuessInput's — wears the night. Doubled
// class outranks the slotted components' own scoped rules without !important.
.night-console.night-console :deep(input) {
  width: 100%;
  border: none;
  padding: 0.4rem 1.2rem;
  font-size: 2rem;
  text-align: center;
  font-family: inherit;
  color: hsla(36, 100%, 94%, 0.95);
  background: none;

  &::placeholder {
    color: hsla(216, 30%, 65%, 0.6);
  }

  &:focus {
    outline: none;
  }

  &:disabled {
    opacity: 0.6;
  }
}

// CountryGuessInput's form wears the parchment .map-caption pill by default —
// light-on-light against the night text. Dress the pill dark to match.
.night-console :deep(.guess-form) {
  border-color: hsla(216, 30%, 50%, 0.35);
  background: hsla(216, 45%, 16%, 0.75);
}

// CountryGuessInput hugs the bottom edge here — suggestions open upward
.night-console :deep(.suggestions) {
  top: auto;
  bottom: 100%;
  margin: 0 0 0.6rem;
}

.feedback {
  margin: 0;
  opacity: 0;
  padding: 0;
  min-height: 1.6rem;
  font-size: 1.2rem;
  color: hsla(216, 30%, 78%, 0.9);
  transition: opacity var(--motion-base) var(--ease-smooth);

  &.visible {
    opacity: 1;
  }
}
</style>
