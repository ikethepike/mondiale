<template>
  <span class="challenge-toggle">
    <button
      type="button"
      role="switch"
      class="switch"
      :class="{ playing, pinned, disabled }"
      :aria-checked="playing"
      :aria-label="ariaLabel"
      :disabled="disabled"
      @click="toggle"
    >
      <span class="track" aria-hidden="true"><span class="knob" /></span>
      <span class="state">{{ pinned ? (playing ? 'On' : 'Off') : 'Auto' }}</span>
    </button>
  </span>
</template>
<script lang="ts" setup>
/**
 * A group's place in the deck, as one switch: the knob says whether the group
 * deals anything, the fill says whether the host decided that or the
 * difficulty did. Its predecessor cycled auto → on → off behind a single
 * unlabelled tap, which advertised neither the third state nor a way back.
 *
 * The way back out of a pinned state is a worded control in the group's own
 * accordion panel — a second glyph on every row would be a permanent cost for
 * a rare action, and 'undo' has no icon a player reads without guessing.
 */
import type { ChallengeToggleState } from '~~/types/challenges/challenge-groups.type'

const props = withDefaults(
  defineProps<{
    /** Accessible name; the switch itself only shows the state. */
    label: string
    modelValue: ChallengeToggleState
    /** Whether the group deals anything as currently set — the resolved
     *  answer, so AUTO under a difficulty that withholds the group reads
     *  honestly as off rather than as an unexplained third state. */
    playing: boolean
    disabled?: boolean
  }>(),
  { disabled: false }
)

const emit = defineEmits<{ 'update:modelValue': [ChallengeToggleState] }>()

const pinned = computed(() => props.modelValue !== 'auto')

const ariaLabel = computed(
  () =>
    `${props.label}: ${props.playing ? 'on' : 'off'}` +
    (pinned.value ? '' : ', following the difficulty')
)

// Always pins. A switch whose two ends are "auto" and "off" would make the
// host's choice depend on a difficulty they might change afterwards.
const toggle = () => {
  if (props.disabled) return
  emit('update:modelValue', props.playing ? 'off' : 'on')
}
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.challenge-toggle {
  gap: 0.2rem;
  display: flex;
  flex: none;
  align-items: center;
}

.switch {
  gap: 0.8rem;
  border: 0;
  padding: 0.5rem 0.9rem;
  cursor: pointer;
  display: flex;
  font: inherit;
  font-size: 1.3rem;
  font-weight: 600;
  min-width: 8.4rem;
  align-items: center;
  border-radius: 999px;
  background: transparent;
  color: ink(0.6);
  transition: background var(--motion-quick) var(--ease-smooth);

  &:hover:not(.disabled) {
    background: ink(0.05);
  }

  &.disabled {
    cursor: default;
    opacity: 0.55;
  }
}

.track {
  width: 3.2rem;
  height: 1.8rem;
  flex: none;
  display: block;
  position: relative;
  border-radius: 999px;
  background: ink(0.1);
  // Dashed while the difficulty is driving: the border is the whole tell for
  // "nobody has decided this", and it survives greyscale and colour blindness
  // in a way a mint-versus-grey fill does not.
  border: 0.1rem dashed ink(0.35);
  transition:
    background var(--motion-quick) var(--ease-smooth),
    border-color var(--motion-quick) var(--ease-smooth);
}

.knob {
  top: 50%;
  left: 0.2rem;
  width: 1.2rem;
  height: 1.2rem;
  position: absolute;
  border-radius: 50%;
  background: ink(0.45);
  transform: translateY(-50%);
  transition:
    left var(--motion-quick) var(--ease-out-expressive),
    background var(--motion-quick) var(--ease-smooth);
}

.playing {
  color: var(--dark-blue);

  .track {
    background: color-mix(in srgb, var(--soft-mint) 42%, transparent);
    border-color: color-mix(in srgb, var(--soft-mint) 70%, transparent);
  }

  .knob {
    left: calc(100% - 1.4rem);
    background: var(--dark-blue);
  }
}

// Solid edge = a decision on the record. Pinned OFF keeps the alert hue the
// list already uses for a group switched off.
.pinned .track {
  border-style: solid;
}

.pinned:not(.playing) {
  color: ink(0.55);

  .track {
    background: flame(0.16);
    border-color: flame(0.4);
  }

  .knob {
    background: var(--hior-ange);
  }
}
</style>
