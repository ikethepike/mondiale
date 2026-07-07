<template>
  <div class="sketch-overlay">
    <svg viewBox="-0.65 -0.65 1.3 1.3" aria-hidden="true">
      <polygon v-if="targetPoints" :points="targetPoints" class="target" />
      <polygon v-if="sketchPoints" :points="sketchPoints" class="drawn" />
    </svg>
    <div class="legend">
      <span class="key target-key">{{ countryName(country) }}</span>
      <span v-if="sketchPoints" class="key drawn-key">The drawing</span>
    </div>
  </div>
</template>
<script lang="ts" setup>
import { countryName } from '~~/lib/country'
import {
  countryPathData,
  largestRing,
  normalizeOutline,
  type OutlinePoint,
  resampleClosed,
} from '~~/lib/outline'
import type { ISOCountryCode } from '~~/types/geography.types'

/** The sketch-round reveal: the real outline with a player's drawing overlaid. */
const props = defineProps({
  country: {
    type: String as PropType<ISOCountryCode>,
    required: true,
  },
  sketch: {
    type: Array as PropType<OutlinePoint[]>,
    default: undefined,
  },
})

const toPointsAttribute = (points: OutlinePoint[]) =>
  points.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(' ')

const targetPoints = ref<string>()
onMounted(() => {
  const pathData = countryPathData(props.country)
  const ring = pathData ? largestRing(pathData) : undefined
  if (ring) targetPoints.value = toPointsAttribute(normalizeOutline(resampleClosed(ring, 128)))
})

const sketchPoints = computed(() =>
  props.sketch?.length ? toPointsAttribute(props.sketch) : undefined
)
</script>
<style lang="scss" scoped>
.sketch-overlay {
  gap: 1rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;
}

svg {
  width: 30rem;
  max-width: 100%;
  aspect-ratio: 1;
}

.target {
  fill: hsla(170.5, 24.7%, 65.1%, 0.25);
  stroke: var(--dark-blue);
  stroke-width: 0.008;
  stroke-linejoin: round;
}

.drawn {
  fill: none;
  stroke: var(--hior-ange);
  stroke-width: 0.01;
  stroke-linejoin: round;
  stroke-dasharray: 0.03 0.018;
}

.legend {
  gap: 1.6rem;
  display: flex;
  font-size: 1.3rem;

  .key::before {
    content: '';
    width: 1.6rem;
    height: 0.3rem;
    margin-right: 0.6rem;
    display: inline-block;
    vertical-align: middle;
  }
  .target-key::before {
    background: var(--dark-blue);
  }
  .drawn-key::before {
    background: var(--hior-ange);
  }
}
</style>
