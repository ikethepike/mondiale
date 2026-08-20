<template>
  <span class="tri-chip-host">
    <button
      type="button"
      class="tri-chip"
      :class="[selected, { disabled }]"
      :disabled="disabled"
      :aria-label="`${label}: ${STATE_LABELS[selected]}`"
      @click="advance"
    >
      <span class="dot" aria-hidden="true" />
      <span class="state">{{ STATE_LABELS[selected] }}</span>
    </button>
    <!-- Outside the button: a form control may not sit inside one, and a
         disabled ancestor is what bars a control from FormData. -->
    <input type="hidden" :name="name" :value="selected" />
    <span class="visually-hidden" role="status">{{ label }}: {{ STATE_LABELS[selected] }}</span>
  </span>
</template>
<script lang="ts" setup>
/** A tri-state in one tap-target: auto → on → off → auto. */
const STATES = ['auto', 'on', 'off'] as const
type TriState = (typeof STATES)[number]

const STATE_LABELS: Record<TriState, string> = {
  auto: 'Auto',
  on: 'On',
  off: 'Off',
}

const props = withDefaults(
  defineProps<{
    /** FormData key — `game-challenges-<group>`. */
    name: string
    /** Accessible name; the chip itself only shows the state. */
    label: string
    modelValue?: string
    disabled?: boolean
  }>(),
  { modelValue: 'auto', disabled: false }
)

const emit = defineEmits<{ 'update:modelValue': [TriState]; change: [] }>()

const asState = (value: string): TriState =>
  (STATES as readonly string[]).includes(value) ? (value as TriState) : 'auto'

// Held locally and re-synced, like SegmentedControl: the prop is server state
// that only lands after the round trip this tap starts.
const selected = ref<TriState>(asState(props.modelValue))
watch(
  () => props.modelValue,
  value => (selected.value = asState(value))
)

const advance = () => {
  if (props.disabled) return
  selected.value = STATES[(STATES.indexOf(selected.value) + 1) % STATES.length]!
  emit('update:modelValue', selected.value)
  // The settings form is driven by @change, and a hidden input never fires one
  // of its own — so the cycle announces itself, after the value has landed.
  nextTick(() => emit('change'))
}
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.tri-chip-host {
  display: inline-flex;
  align-items: center;
}

.visually-hidden {
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  position: absolute;
  clip-path: inset(50%);
  white-space: nowrap;
}

.tri-chip {
  gap: 0.6rem;
  border: 0;
  cursor: pointer;
  display: flex;
  padding: 0.5rem 1.1rem;
  font-size: 1.3rem;
  min-width: 8.4rem;
  align-items: center;
  font-weight: 600;
  border-radius: 999px;
  justify-content: flex-start;
  color: var(--dark-blue);
  background: ink(0.06);
  transition: background var(--motion-quick) var(--ease-smooth);

  &.disabled {
    cursor: default;
    opacity: 0.5;
  }
}

.dot {
  width: 0.8rem;
  height: 0.8rem;
  flex: none;
  border-radius: 50%;
  background: ink(0.3);
}

// A row the table has DECIDED reads loud: the list is for spotting overrides.
.on {
  background: color-mix(in srgb, var(--soft-mint) 28%, transparent);

  .dot {
    background: var(--soft-mint);
  }
}

.off {
  background: flame(0.14);
  color: ink(0.55);

  .dot {
    background: var(--hior-ange);
  }
}
</style>
