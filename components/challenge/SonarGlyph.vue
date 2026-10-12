<template>
  <svg class="sonar-glyph" viewBox="-8 -8 16 16" aria-hidden="true">
    <circle r="1.6" />
    <path d="M-3.4 -3.4a4.8 4.8 0 0 1 6.8 0M-5.7 -5.7a8 8 0 0 1 11.4 0" />
  </svg>
</template>
<script lang="ts" setup>
/** The sonar mark: a ping in The Despot, wherever one is drawn. */
</script>
<style lang="scss" scoped>
.sonar-glyph {
  width: 1.4rem;
  height: 1.4rem;
  flex-shrink: 0;
  fill: var(--sonar-color, currentColor);
  stroke: var(--sonar-color, currentColor);
  stroke-width: 1.4;
  stroke-linecap: round;

  path {
    fill: none;
  }
}
</style>
