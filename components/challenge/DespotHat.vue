<template>
  <svg class="despot-hat" viewBox="0 0 48 30" aria-hidden="true">
    <!-- One crown: parade-wide top pinching into the band — the overhang IS
         the silhouette (a detached brim reads as a sailor's boater). -->
    <path
      class="cap"
      d="M6 12.5C4.6 5.5 13 2.5 24 2.5s19.4 3 18 10c-.35 1.8-2 2.5-4 2.1-8-1.6-20-1.6-28 0-2 .4-3.65-.3-4-2.1z"
    />
    <!-- The band, red as tradition demands, then the smile of a visor. -->
    <path class="band" d="M11 15h26v4.2q0 1.2-1.2 1.2H12.2Q11 20.4 11 19.2z" />
    <path class="visor" d="M12.5 20.4c3 4.6 20 4.6 23 0-5 2.6-18 2.6-23 0z" />
    <!-- Gold braid and one enormous star, obviously. -->
    <path class="trim-line" d="M12.5 16.6h23" />
    <path
      class="trim"
      d="M24 4.6l1.45 2.95 3.25.5-2.35 2.3.55 3.25L24 12.05l-2.9 1.55.55-3.25-2.35-2.3 3.25-.5z"
    />
  </svg>
</template>
<script lang="ts" setup>
/**
 * The Despot's cap, drawn filled so the silhouette survives a jaunty tilt —
 * thin strokes at an angle read as a prohibition sign, not headwear.
 */
</script>
<style lang="scss" scoped>
.despot-hat {
  display: block;

  .cap {
    fill: var(--hat-cap, var(--dark-blue));
  }

  .band {
    fill: var(--hat-band, hsl(355, 62%, 38%));
  }

  .visor {
    fill: var(--hat-visor, hsl(215.7, 60%, 12%));
  }

  .trim {
    fill: var(--hat-trim, hsl(42, 80%, 55%));
  }

  .trim-line {
    fill: none;
    stroke: var(--hat-trim, hsl(42, 80%, 55%));
    stroke-width: 2;
    stroke-linecap: round;
  }
}
</style>
