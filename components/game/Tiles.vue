<template>
  <section id="game-tiles">
    <a
      v-for="(tile, index) in tiles"
      :key="index"
      :class="['game-tile', 'slide-block', 'bottom', tile.type]"
      role="button"
    >
      {{ tile.type }}
    </a>
  </section>
</template>
<script lang="ts">
import { defineComponent, PropType } from '@vue/composition-api'
import { Tile } from '~/types/game'

export default defineComponent({
  props: {
    tiles: {
      required: true,
      type: Array as PropType<Tile[]>,
    },
  },
})
</script>
<style lang="scss" scoped>
#game-tiles {
  display: flex;
  z-index: 540000;
  overflow-x: auto;
  position: relative;
}

#game-tiles:hover .game-tile {
  width: 8vmax;
  height: 8vmax;
}

.game-tile {
  width: 8vmax;
  height: 2rem;
  display: flex;
  flex-shrink: 0;
  transition: 0.6s;
  position: relative;
  align-items: center;
  justify-content: center;
  border-right: 0.0125rem solid;
  &.normal {
    background: #5d9caa;
  }
  &.challenge-capital,
  &.challenge-country {
    background: #ffd166;
  }
  &.start {
    background: #d2e7b7;
  }
  &.final {
    background-color: #e5e5f7;
    opacity: 0.4;
    background-image: repeating-linear-gradient(
        45deg,
        #000 25%,
        transparent 25%,
        transparent 75%,
        #000 75%,
        #000
      ),
      repeating-linear-gradient(45deg, #000 25%, transparent 25%, transparent 75%, #000 75%, #000);
    background-position: 0 0, 20px 20px;
    background-size: 40px 40px;
  }
}
</style>
