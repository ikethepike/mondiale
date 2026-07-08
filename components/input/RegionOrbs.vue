<template>
  <div class="region-orbs" :class="{ disabled }" role="radiogroup" aria-label="Region">
    <button
      v-for="variant in gameVariants"
      :key="variant"
      type="button"
      role="radio"
      :aria-checked="variant === selected"
      :disabled="disabled"
      class="orb"
      :class="{ active: variant === selected }"
      @click="select(variant)"
    >
      <span class="orb-face">
        <component :is="regionMaps[variant]" class="orb-map" />
      </span>
      <span class="orb-label">{{ formatLabel(variant) }}</span>
    </button>
    <input type="hidden" name="variant" :value="selected" />
  </div>
</template>
<script lang="ts" setup>
import { type GameVariant, gameVariants } from '~~/types/game.types'

const props = defineProps({
  modelValue: {
    type: String as PropType<GameVariant>,
    required: true,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits<{ 'update:modelValue': [value: GameVariant]; change: [value: GameVariant] }>()

// Optimistic local selection: the picked value shows instantly rather than
// waiting for the server to round-trip game.variant back (which reads the
// hidden input, so a purely-controlled value would deadlock). Server state
// still wins when it changes — a peer or reconnect updates the prop.
const selected = ref<GameVariant>(props.modelValue)
watch(
  () => props.modelValue,
  value => (selected.value = value)
)

// The hand-drawn region maps, keyed by variant (same set VariantPicker uses)
const regionMaps: { [variant in GameVariant]: ReturnType<typeof resolveComponent> } = {
  world: resolveComponent('MapWorld'),
  europe: resolveComponent('MapEurope'),
  africa: resolveComponent('MapAfrica'),
  asia: resolveComponent('MapAsia'),
  'north-america': resolveComponent('MapNorthAmerica'),
  'south-america': resolveComponent('MapSouthAmerica'),
}

const select = (variant: GameVariant) => {
  selected.value = variant
  emit('update:modelValue', variant)
  emit('change', variant)
}

const formatLabel = (variant: GameVariant) =>
  variant.replace(/-/g, ' ').replace(/\b\w/g, character => character.toUpperCase())
</script>
<style lang="scss" scoped>
.region-orbs {
  gap: 1.6rem 1.4rem;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  max-width: 46rem;

  &.disabled {
    opacity: 0.7;
    pointer-events: none;
  }
}

.orb {
  gap: 0.7rem;
  border: none;
  display: flex;
  cursor: pointer;
  padding: 0.4rem 0;
  background: none;
  align-items: center;
  font-family: inherit;
  flex-flow: column nowrap;
}

// The orb IS the globe — a clean circle. The region map drapes ON it: we
// hide each map's own rect/circle chrome and show only the landmass paths,
// which sit atop (and can gently overflow) the sphere.
.orb-face {
  --orb-ink: var(--soft-blue);
  display: grid;
  width: 7.2rem;
  height: 7.2rem;
  overflow: hidden;
  place-items: center;
  border-radius: 50%;
  background: hsla(36, 100%, 98%, 0.7);
  border: 0.2rem solid hsla(215.7, 76.4%, 21.6%, 0.16);
  transition:
    transform var(--motion-base) var(--ease-out-expressive),
    border-color var(--motion-base) var(--ease-out-expressive),
    box-shadow var(--motion-base) var(--ease-out-expressive),
    background-color var(--motion-base) var(--ease-out-expressive);
}

.orb-map {
  width: 92%;
  height: 92%;

  // The maps carry their own square background and globe outline — the orb
  // provides both, so strip them and keep only the landmass strokes.
  :deep(rect),
  :deep(circle) {
    display: none;
  }
  // Most region SVGs hardcode `stroke: #000` inline (only MapWorld uses
  // currentColor), so !important is needed to make every one follow the
  // orb's ink — which flips to light when the orb goes dark on selection.
  :deep(path) {
    stroke: var(--orb-ink) !important;
    stroke-width: 3.5 !important;
  }
}

.orb:hover .orb-face {
  transform: translateY(-0.3rem);
  border-color: hsla(215.7, 76.4%, 21.6%, 0.35);
}

.orb.active .orb-face {
  // Landmass flips to a light cream ink so it reads on the dark globe
  --orb-ink: hsl(36, 100%, 98%);
  transform: scale(1.08);
  border-color: var(--dark-blue);
  background: var(--dark-blue);
  box-shadow: 0 0.4rem 1.4rem hsla(215.7, 76.4%, 21.6%, 0.35);
}

.orb-label {
  font-size: 1.4rem;
  font-weight: 600;
  text-align: center;
  color: var(--dark-blue);
  transition: opacity var(--motion-base) var(--ease-out-expressive);
}

.orb:not(.active) .orb-label {
  opacity: 0.6;
}
</style>
