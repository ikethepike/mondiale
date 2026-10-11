<template>
  <div class="region-orbs" :class="{ disabled }" role="group" aria-label="Regions">
    <button
      v-for="variant in gameVariants"
      :key="variant"
      type="button"
      role="checkbox"
      :aria-checked="isChosen(variant)"
      :disabled="disabled"
      class="orb"
      :class="{ active: isChosen(variant) }"
      @click="select(variant)"
    >
      <span class="orb-globe">
        <span
          class="orb-face"
          :class="{ ticking: ticked === variant }"
          @animationend.self="ticked = undefined"
        >
          <RegionMap :variant="variant" class="orb-map" />
        </span>
        <Transition name="badge">
          <span v-if="isChosen(variant)" class="orb-badge" aria-hidden="true">
            <svg viewBox="0 0 12 12">
              <path d="M2.4 6.3l2.3 2.3 4.9-5.1" pathLength="1" />
            </svg>
          </span>
        </Transition>
      </span>
      <span class="orb-label">{{ formatLabel(variant) }}</span>
    </button>
    <input v-for="region in selected" :key="region" type="hidden" name="regions" :value="region" />
  </div>
</template>
<script lang="ts" setup>
import RegionMap from '~/components/map/RegionMap.vue'
import { titleCase } from '~~/lib/strings'
import { isWorldBoard, toggleBoardRegion } from '~~/lib/board-regions'
import { type BoardRegion, type GameVariant, gameVariants } from '~~/types/game.types'

const props = defineProps({
  modelValue: {
    type: Array as PropType<BoardRegion[]>,
    required: true,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits<{
  'update:modelValue': [value: BoardRegion[]]
  change: [value: BoardRegion[]]
}>()

// Optimistic local selection: the picked value shows instantly rather than
// waiting for the server to round-trip game.regions back (which reads the
// hidden inputs, so a purely-controlled value would deadlock). Server state
// still wins when it changes — a peer or reconnect updates the prop.
const selected = ref<BoardRegion[]>(props.modelValue)
watch(
  () => props.modelValue,
  value => (selected.value = value)
)

const isChosen = (variant: GameVariant) =>
  variant === 'world' ? isWorldBoard(selected.value) : selected.value.includes(variant)

const ticked = ref<GameVariant>()

const select = (variant: GameVariant) => {
  ticked.value = variant
  selected.value = toggleBoardRegion(selected.value, variant)
  emit('update:modelValue', selected.value)
  emit('change', selected.value)
}

const formatLabel = (variant: GameVariant) => titleCase(variant)
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
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
.orb-globe {
  position: relative;
  width: 7.2rem;
  height: 7.2rem;
  transition: transform var(--motion-base) var(--ease-out-expressive);
}

.orb-face {
  --orb-ink: var(--soft-blue);
  display: grid;
  width: 7.2rem;
  height: 7.2rem;
  overflow: hidden;
  place-items: center;
  border-radius: 50%;
  background: milk(0.7);
  border: 0.1rem solid ink(0.16);
  transition:
    border-color var(--motion-base) var(--ease-out-expressive),
    box-shadow var(--motion-base) var(--ease-out-expressive);

  &.ticking {
    animation: orb-tick var(--motion-base) var(--ease-out-expressive);
  }
}

// RegionMap's root is display: contents, so size the svg itself.
.orb-map :deep(svg) {
  width: 92%;
  height: 92%;
  opacity: 0.55;
  transition: opacity var(--motion-base) var(--ease-out-expressive);
}

.orb-map {
  // The maps carry their own square background and globe outline — the orb
  // provides both, so strip them and keep only the landmass strokes.
  :deep(rect),
  :deep(circle) {
    display: none;
  }
  // Most region SVGs hardcode `stroke: #000` inline (only MapWorld uses
  // currentColor), so !important is needed to make every one follow the
  // orb's ink.
  :deep(path) {
    stroke: var(--orb-ink) !important;
    stroke-width: 3.5 !important;
    transition: stroke var(--motion-base) var(--ease-out-expressive);
  }
}

.orb:hover {
  .orb-globe {
    transform: translateY(-0.3rem);
  }
  .orb-face {
    border-color: ink(0.35);
  }
}

.orb.active .orb-face {
  --orb-ink: var(--dark-blue);
  border-color: var(--dark-blue);
  box-shadow: inset 0 0 0 0.1rem var(--dark-blue);

  .orb-map :deep(svg) {
    opacity: 1;
  }
}

.orb-badge {
  top: -0.3rem;
  right: -0.3rem;
  width: 2.4rem;
  height: 2.4rem;
  display: grid;
  position: absolute;
  place-items: center;
  border-radius: 50%;
  background: var(--dark-blue);
  border: 0.2rem solid var(--background-color);

  svg {
    width: 1.2rem;
    height: 1.2rem;
  }

  path {
    fill: none;
    stroke: milk();
    stroke-width: 1.9;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 1;
    stroke-dashoffset: 0;
  }
}

.badge-enter-active {
  animation: badge-pop var(--motion-base) var(--ease-out-expressive);

  path {
    stroke-dashoffset: 1;
    animation: stroke-draw var(--motion-base) var(--ease-out-expressive) var(--motion-quick) both;
  }
}

.badge-leave-active {
  transition:
    opacity var(--motion-quick) var(--ease-in-soft),
    transform var(--motion-quick) var(--ease-in-soft);
}

.badge-leave-to {
  opacity: 0;
  transform: scale(0.4);
}

@keyframes orb-tick {
  40% {
    transform: scale(0.94);
  }
}

@keyframes badge-pop {
  0% {
    opacity: 0;
    transform: scale(0.3);
  }
  60% {
    opacity: 1;
    transform: scale(1.15);
  }
  100% {
    transform: scale(1);
  }
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
