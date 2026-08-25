<template>
  <svg
    class="city-plan"
    :viewBox="`0 0 ${CITY_TILE_SPAN} ${CITY_TILE_HEIGHT}`"
    :preserveAspectRatio="fit ? 'xMidYMid meet' : 'xMidYMid slice'"
    aria-hidden="true"
  >
    <!-- Water is the base frame, never a ladder rung: the city is where it is
         because of the water, so withholding it would invert what the round
         teaches. Even-odd carves the river islands out of their own water. -->
    <path v-if="paths.sea" class="sea" :d="paths.sea" />
    <path v-if="paths.waterFill" class="water-fill" :d="paths.waterFill" />
    <path
      v-if="paths.waterLine"
      class="water-line"
      :d="paths.waterLine"
      :stroke-width="paths.waterLineWidth ?? 8"
    />
    <path v-if="showGreen && paths.green" class="green" :d="paths.green" />

    <!-- A layer wipes on rather than drawing its strokes end to end: the
         `stroke-draw` dash trick normalizes the WHOLE path, so a fabric layer
         of several thousand subpaths would draw each one a sliver at a time and
         read as nothing happening at all. -->
    <g
      v-for="layer in drawn"
      :key="layer"
      :class="['layer', layer]"
      :clip-path="`url(#${wipeId(layer)})`"
    >
      <path :d="paths[layer]" />
    </g>

    <defs>
      <clipPath v-for="layer in drawn" :id="wipeId(layer)" :key="layer">
        <rect class="wipe" x="0" y="0" :height="CITY_TILE_HEIGHT" :width="CITY_TILE_SPAN" />
      </clipPath>
    </defs>
  </svg>
</template>
<script lang="ts" setup>
/**
 * A city's plan, drawn one layer class at a time on cream paper.
 *
 * The tile FILLS its stage edge to edge. It can afford to: the cut is authored
 * 16:9 around a centred square safe zone that holds the city's diagnostic
 * shape, so a landscape screen crops into the wings and a portrait one crops
 * the sides, and neither reaches the shape the round is asking about.
 */
import type { CityPlanPaths, GroundPlanLayer } from '~~/types/challenges/group-modes.type'
import { CITY_TILE_HEIGHT, CITY_TILE_SPAN } from '~~/lib/ground-plan'

const props = defineProps<{
  paths: CityPlanPaths
  /** Layer classes revealed so far, in ladder order. */
  layers: GroundPlanLayer[]
  /** Parks and cemeteries land at the reveal, not during play. */
  showGreen?: boolean
  /**
   * Show the whole cut rather than filling the stage.
   *
   * A 16:9 cut filled into a portrait screen keeps only 46% of the safe zone's
   * width — measured — which crops the very shape the round is asking about.
   * Taller-than-wide viewports fit instead, and the plan floats on its paper.
   */
  fit?: boolean
}>()

const uid = useId()
const wipeId = (layer: GroundPlanLayer) => `wipe-${uid}-${layer}`

const drawn = computed(() => props.layers.filter(layer => props.paths[layer]))
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.city-plan {
  inset: 0;
  width: 100%;
  height: 100%;
  position: absolute;
  background: milk();
}

// Even-odd, matching the water fill: the sea path carries its islands as
// nested rings, and parity is what knocks them out.
.sea {
  fill: var(--plan-water);
  fill-rule: evenodd;
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
  stroke-linecap: round;
}

.green {
  fill: var(--plan-green);
  stroke: none;
  animation: fade-in 0.9s var(--ease-smooth) both;
}

// Weight is the language, not colour: the grain is a hairline, the skeleton is
// heavy, and the rail is the only dashed thing on the page.
.layer path {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.wipe {
  transform-origin: 0 50%;
  animation: plan-wipe 1.5s var(--ease-out-expressive) both;
}

.fabric path {
  stroke: ink(0.32);
  stroke-width: 1.5;
}

.arterials path {
  stroke: ink(0.92);
  stroke-width: 3.6;
}

.rail path {
  stroke: ink(0.5);
  stroke-width: 1.8;
  stroke-dasharray: 9 7;
}

.bridges path {
  stroke: #{ember()};
  stroke-width: 5;
}

// The bridges are the beat the whole round builds to, so they land with a
// flourish the other layers do not get.
.bridges {
  animation: fade-in 0.5s var(--ease-out-expressive) both;
}

@media (prefers-reduced-motion: reduce) {
  .wipe,
  .green,
  .bridges {
    animation-duration: 0.01s;
  }
}
</style>
