<template>
  <svg
    class="city-plan"
    :viewBox="`0 0 ${CITY_TILE_SPAN} ${CITY_TILE_SPAN}`"
    preserveAspectRatio="xMidYMid meet"
    aria-hidden="true"
  >
    <!-- Water is the base frame, never a ladder rung: the city is where it is
         because of the water, so hiding it would invert what the round teaches. -->
    <path v-if="paths.shore" class="shore" :d="paths.shore" />
    <path v-if="paths.waterFill" class="water-fill" :d="paths.waterFill" />
    <path v-if="paths.waterLine" class="water-line" :d="paths.waterLine" />
    <path v-if="showGreen && paths.green" class="green" :d="paths.green" />

    <path
      v-for="(layer, index) in drawn"
      :key="layer"
      :class="['layer', layer]"
      :d="paths[layer]"
      pathLength="1"
      :style="{ '--draw-delay': `${index * 0.08}s` }"
    />
  </svg>
</template>
<script lang="ts" setup>
/**
 * A city's plan, drawn one layer class at a time on cream paper.
 *
 * The tile FITS rather than fills: the cut is square and the composition is the
 * question, so slicing it to a wide stage would crop away the shape the round
 * is asking about.
 */
import type { CityPlanPaths, GroundPlanLayer } from '~~/types/challenges/group-modes.type'
import { CITY_TILE_SPAN } from '~~/lib/ground-plan'

const props = defineProps<{
  paths: CityPlanPaths
  /** Layer classes revealed so far, in ladder order. */
  layers: GroundPlanLayer[]
  /** Parks and cemeteries land at the reveal, not during play. */
  showGreen?: boolean
}>()

const drawn = computed(() => props.layers.filter(layer => props.paths[layer]))
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.city-plan {
  width: 100%;
  height: 100%;
  max-height: 100%;
  background: milk();
}

.shore {
  fill: milk();
  stroke: none;
}

.water-fill {
  fill: var(--plan-water);
  fill-rule: evenodd;
  stroke: var(--plan-water-edge);
  stroke-width: 1.5;
}

.water-line {
  fill: none;
  stroke: var(--plan-water);
  stroke-width: 8;
  stroke-linecap: round;
}

.green {
  fill: var(--plan-green);
  stroke: none;
}

// Weight is the language, not colour: the grain is a hairline, the skeleton is
// heavy, and the rail is the only dashed thing on the page.
.layer {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: stroke-draw 1.1s var(--ease-out-expressive) var(--draw-delay, 0s) forwards;
}

.fabric {
  stroke: ink(0.32);
  stroke-width: 1.5;
}

.arterials {
  stroke: ink(0.92);
  stroke-width: 3.6;
}

.rail {
  stroke: ink(0.5);
  stroke-width: 1.8;
  stroke-dasharray: 9 7;
  // A dashed stroke cannot also carry the draw-on dash, so the rail simply
  // fades in where the other layers are drawn.
  stroke-dashoffset: 0;
  animation-name: fade-in;
}

.bridges {
  stroke: #{ember()};
  stroke-width: 5;
}

@media (prefers-reduced-motion: reduce) {
  .layer {
    animation-duration: 0.01s;
  }
}
</style>
