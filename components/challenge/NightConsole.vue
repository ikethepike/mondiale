<template>
  <div class="night-console">
    <div class="tally"><span class="lit">{{ lit }} lit</span> · {{ quota }} to pass</div>
    <div class="console-row">
      <div class="console-input"><slot /></div>
      <ChallengeTimerRadial :value="secondsLeft" :total="durationSeconds" />
    </div>
    <p v-if="feedback !== undefined" class="feedback" :class="{ visible: feedback }">
      {{ feedback }}
    </p>
  </div>
</template>
<script lang="ts" setup>
import ChallengeTimerRadial from '~/components/challenge/ChallengeTimerRadial.vue'

/**
 * The night modes' shared bottom card: dark glass, the lit/quota tally, a
 * slotted input (bare or CountryGuessInput) with the round clock docked at
 * the row's end — the radial dial dressed for the dark, its arc in the same
 * amber as the lit tally.
 */
defineProps<{
  lit: number
  quota: number
  secondsLeft: number
  durationSeconds: number
  feedback?: string
}>()
</script>
<style lang="scss" scoped>
.night-console {
  gap: 0.6rem;
  left: 50%;
  bottom: 1.6rem;
  display: flex;
  padding: 1.2rem 1.6rem;
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
  width: min(44rem, calc(100vw - 3.2rem));

  // The dial wears the night: dark glass disc, moonlit ink, the arc in the
  // tally's amber so "time left" and "lit" read as one system.
  --clock-size: 5.2rem;
  --clock-seconds-size: 1.7rem;
  --clock-ink: hsla(216, 30%, 78%, 1);
  --clock-arc: hsla(45, 96%, 72%, 1);
  --clock-disc-fill: hsla(216, 45%, 16%, 0.75);
  --clock-disc-stroke: hsla(216, 30%, 50%, 0.35);
}

.console-row {
  gap: 1rem;
  width: 100%;
  display: flex;
  align-items: center;
}

.console-input {
  flex: 1;
  min-width: 0;
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
// light-on-light against the night text. Dress the pill dark to match, and
// let it flex into the console row instead of keeping its fixed width.
.night-console :deep(.guess-form) {
  width: 100%;
  min-width: 0;
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
