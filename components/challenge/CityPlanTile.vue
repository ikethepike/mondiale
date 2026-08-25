<template>
  <svg
    class="city-plan"
    :viewBox="`0 0 ${CITY_TILE_SPAN} ${CITY_TILE_SPAN}`"
    preserveAspectRatio="xMidYMid meet"
    aria-hidden="true"
  >
    <!-- Water is the base frame, never a ladder rung: the city is where it is
         because of the water, so withholding it would invert what the round
         teaches. Even-odd carves the river islands out of their own water. -->
    <path v-if="paths.shore" class="shore" :d="paths.shore" />
    <path v-if="paths.waterFill" class="water-fill" :d="paths.waterFill" />
    <path v-if="paths.waterLine" class="water-line" :d="paths.waterLine" />
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
        <rect class="wipe" x="0" y="0" :height="CITY_TILE_SPAN" :width="CITY_TILE_SPAN" />
      </clipPath>
    </defs>
  </svg>
</template>
<script lang="ts" setup>
/**
 * A city's plan, drawn one layer class at a time on cream paper.
 *
 * The tile FITS rather than fills: the cut is square and its composition is the
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

const uid = useId()
const wipeId = (layer: GroundPlanLayer) => `wipe-${uid}-${layer}`

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
