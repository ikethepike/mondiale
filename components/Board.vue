<template>
  <div class="board" :style="{ '--tileSize': tileSize }">
    <!-- <template v-if="game"> -->
    <ShapeRectangle v-for="tile in 1" class="tile" height="15vw" :width="tileSize" color="red" />

    <!--     
    
    <ShapeRectangle class="tile" height="1vw" :width="tileSize" color="red" />
    <ShapeRectangle class="tile" height="1vw" :width="tileSize" color="red" />
    <ShapeRectangle class="tile" height="1vw" :width="tileSize" color="red" />
    <ShapeRectangle class="tile" height="1vw" :width="tileSize" color="red" />
    <ShapeRectangle class="tile" height="1vw" :width="tileSize" color="red" />
    <ShapeRectangle class="tile" height="1vw" :width="tileSize" color="red" />
    <ShapeRectangle class="tile" height="1vw" :width="tileSize" color="red" />
    <ShapeRectangle class="tile" height="1vw" :width="tileSize" color="red" />
    <ShapeRectangle class="tile" height="1vw" :width="tileSize" color="red" /> -->
  </div>
</template>
<script setup lang="ts">
import { useClientEvents } from '~~/lib/events/client-side'

const tileSize = `15vw`

const { game } = useClientEvents()
</script>
<style lang="scss" scoped>
.board {
  top: calc(var(--tileSize) / 2 * -1);
  width: 100%;
  padding: calc(var(--tileSize) / 2) 0;

  display: flex;

  overflow: auto;
  left: 0;
  z-index: 500;
  position: relative;
  height: min(100vh, 100dvh);

  @for $i from 1 through 100 {
    .tile:nth-child(#{$i}) {
      // top: -5rem;
      // left: -5rem;
      // position: relative;
      // flex-shrink: 0;
      margin-top: calc((var(--tileSize) * 0.33333334) * #{$i});
      margin-right: calc(var(--tileSize) * 0.3333334);
      // margin-right: var(--tileSize);
    }
  }
}
</style>
