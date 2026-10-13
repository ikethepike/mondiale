<template>
  <svg class="parachute-glyph" viewBox="0 0 24 24" aria-hidden="true">
    <path
      class="canopy"
      d="M3 10a9 7 0 0 1 18 0c-1.5-1.2-3-1.2-4.5 0-1.5-1.2-3-1.2-4.5 0-1.5-1.2-3-1.2-4.5 0C6 8.8 4.5 8.8 3 10z"
    />
    <path class="shrouds" d="M3 10l9 9M21 10l-9 9M12 10v9" />
  </svg>
</template>
<script lang="ts" setup>
/** The rip cord's mark — the canopy it deploys. Stroke language of the stat glyphs. */
</script>
<style lang="scss" scoped>
.parachute-glyph {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;

  .canopy {
    fill: currentColor;
    fill-opacity: 0.18;
  }
}
</style>
