<template>
  <div
    class="segmented"
    :class="{ disabled }"
    role="radiogroup"
    :aria-label="label"
    :style="{ '--segments': options.length }"
  >
    <!-- Sliding highlight. Width = one segment's share of the track; it moves
         by whole multiples of ITS OWN width (translateX 100% = one segment),
         so it's mathematically pinned inside the padded track — no gaps in the
         transform means no corner overflow at the ends. -->
    <div
      class="segmented-thumb"
      aria-hidden="true"
      :style="{
        width: `calc((100% - 0.8rem) / ${options.length})`,
        transform: `translateX(${activeIndex * 100}%)`,
      }"
    />
    <button
      v-for="option in options"
      :key="option"
      type="button"
      role="radio"
      :aria-checked="option === selected"
      :disabled="disabled"
      class="segment"
      :class="{ active: option === selected }"
      @click="select(option)"
    >
      {{ formatLabel(option) }}
    </button>
    <!-- Carries the value into the surrounding FormData contract -->
    <input type="hidden" :name="name" :value="selected" />
  </div>
</template>
<script lang="ts" setup>
const props = defineProps({
  /** The hidden input's name — becomes a FormData key on the parent form. */
  name: {
    type: String,
    required: true,
  },
  options: {
    type: Array as PropType<string[]>,
    required: true,
  },
  modelValue: {
    type: String,
    required: true,
  },
  label: {
    type: String,
    default: '',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits<{ 'update:modelValue': [value: string]; change: [value: string] }>()

// Optimistic local selection — the tab moves instantly; server state (via
// modelValue) still wins when it changes. A purely-controlled value would
// deadlock: the parent reads this control's hidden input to build the config
// it sends, so the value must update before the round-trip, not after.
const selected = ref(props.modelValue)
watch(
  () => props.modelValue,
  value => (selected.value = value)
)

const activeIndex = computed(() => Math.max(0, props.options.indexOf(selected.value)))

const select = (option: string) => {
  if (props.disabled || option === selected.value) return
  selected.value = option
  emit('update:modelValue', option)
  emit('change', option)
}

const formatLabel = (option: string) =>
  option.replace(/-/g, ' ').replace(/\b\w/g, character => character.toUpperCase())
</script>
<style lang="scss" scoped>
// Equal-width segments (no gaps — gaps in the track would desync the thumb's
// pure-percentage transform). Grid, not flex: a max-content flex track hands
// wide labels ("Auto") more room than narrow ones ("On"), and the thumb's
// stepped translate assumes exact equal columns. Equal 1fr columns are the
// geometry the thumb math is built on. It sits in the 0.4rem-padded inner area.
.segmented {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  padding: 0.4rem;
  position: relative;
  width: max-content;
  max-width: 100%;
  border-radius: 1rem;
  background: hsla(215.7, 76.4%, 21.6%, 0.06);
  border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.14);

  &.disabled {
    opacity: 0.6;
    pointer-events: none;
  }
}

.segmented-thumb {
  top: 0.4rem;
  left: 0.4rem;
  bottom: 0.4rem;
  position: absolute;
  border-radius: 0.7rem;
  background: var(--dark-blue);
  box-shadow: 0 0.2rem 0.6rem hsla(215.7, 76.4%, 21.6%, 0.25);
  transition: transform var(--motion-base) var(--ease-out-expressive);
}

.segment {
  z-index: 1;
  border: none;
  flex: 1 1 0;
  cursor: pointer;
  font-size: 1.5rem;
  font-weight: 600;
  white-space: nowrap;
  font-family: inherit;
  background: transparent;
  border-radius: 0.7rem;
  padding: 0.7rem 1.8rem;
  color: var(--dark-blue);
  transition: color var(--motion-base) var(--ease-out-expressive);

  &.active {
    color: hsl(36, 100%, 98%);
  }

  &:not(.active):hover {
    color: var(--soft-blue);
  }
}
</style>
