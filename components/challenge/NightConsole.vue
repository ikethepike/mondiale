<template>
  <div class="night-console" :class="{ low }">
    <div class="tally">
      <span class="lit"
        >{{ lit }}<template v-if="beads"> of {{ beads.length }}</template> lit</span
      >
      · {{ quota }} to pass
    </div>
    <div v-if="beads" class="lanterns" aria-hidden="true">
      <span v-for="(bead, index) in beads" :key="index" class="lantern" :class="bead" />
    </div>
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

export type LanternState = 'pending' | 'lit' | 'dark'

/**
 * The night modes' shared bottom card: dark glass, the lit/quota tally, an
 * optional lantern row (one bead per subject in play, in the order the night
 * takes them), a slotted input (bare or CountryGuessInput) with the round
 * clock docked at the row's end — the radial dial dressed for the dark, its
 * arc in the same amber as the lit tally.
 */
const props = defineProps<{
  lit: number
  quota: number
  secondsLeft: number
  durationSeconds: number
  feedback?: string
  beads?: LanternState[]
}>()

// The console's border warms over the round's final fifth — the same slow
// tide as the day console's pill.
const low = computed(
  () => props.durationSeconds > 0 && props.secondsLeft / props.durationSeconds <= 0.2
)
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;
@use '~/assets/scss/rules/ink' as *;
// Stands in a .shell-footer — the footer owns the berth and the keyboard
// lift; the console only centers itself and dresses the glass.
.night-console {
  gap: 0.6rem;
  margin: 0 auto;
  display: flex;
  padding: 1.2rem 1.6rem;
  overflow: visible; // suggestions open upward, past the card (anchored to .guess-form)
  align-items: center;
  flex-flow: column nowrap;
  border-radius: 1.4rem;
  pointer-events: auto;
  border: 0.1rem solid hsla(216, 30%, 45%, 0.35);
  background: hsla(216, 45%, 12%, 0.85);
  backdrop-filter: blur(0.6rem);
  box-shadow: 0 0.4rem 2.4rem hsla(216, 58%, 4%, 0.5);
  width: min(44rem, calc(100vw - 3.2rem));
  transition: border-color 2s var(--ease-smooth);

  &.low {
    border-color: flame(0.7);
  }

  // The dial wears the night: dark glass disc, moonlit ink, the arc in the
  // tally's amber so "time left" and "lit" read as one system.
  --clock-size: 5.2rem;
  --clock-seconds-size: 1.7rem;
  --clock-ink: hsla(216, 30%, 78%, 1);
  --clock-arc: var(--night-amber);
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
  position: relative; // anchors a slotted bare input's ghost placeholder
}

.tally {
  font-size: 1.2rem;
  color: hsla(216, 30%, 78%, 1);
  letter-spacing: 0.12em;
  text-transform: uppercase;

  .lit {
    color: var(--night-amber);
    font-weight: bold;
  }
}

.lanterns {
  gap: 0.7rem;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
}

.lantern {
  width: 1.3rem;
  height: 1.3rem;
  border-radius: 50%;
  border: 0.1rem solid hsla(216, 30%, 65%, 0.5);
  background: hsla(216, 45%, 22%, 0.8);
  transition:
    background var(--motion-base) var(--ease-smooth),
    border-color var(--motion-base) var(--ease-smooth),
    box-shadow var(--motion-base) var(--ease-smooth);

  &.lit {
    border-color: var(--night-amber);
    background: var(--night-amber);
    box-shadow: 0 0 0.6rem hsla(45, 96%, 65%, 0.75);
  }

  &.dark {
    border-color: hsla(216, 30%, 40%, 0.4);
    background: var(--night-page);
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

  &:focus {
    outline: none;
  }

  &:disabled {
    opacity: 0.6;
  }
}

// The prompt's inert twin (templates/_ghost-placeholder.scss) wears the
// night in place of ::placeholder — bare inputs and CountryGuessInput alike.
.night-console.night-console :deep(.ghost-placeholder) {
  font-size: 2rem;
  color: hsla(216, 30%, 65%, 0.6);
}

// A phone's console is narrower than the prompt at display size — the
// centred ghost overflowed both ends and read as "ype a country before it"
@media (max-width: $phone) {
  .night-console.night-console :deep(input),
  .night-console.night-console :deep(.ghost-placeholder) {
    font-size: 1.6rem;
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
