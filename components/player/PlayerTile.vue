<template>
  <li class="player-tile" :style="[`--player-color: ${player.color} `]">
    <PlayerPawn class="pawn" :player="player" />
    <span class="player-name">{{ player.name }}</span>
    <slot />
  </li>
</template>
<script lang="ts" setup>
import { PropType } from 'vue'
import { Player } from '~~/types/player.type'

defineProps({
  player: {
    type: Object as PropType<Player>,
    required: true,
  },
})
</script>
<style lang="scss" scoped>
.player-tile {
  gap: 2rem;
  height: 5rem;
  display: flex;
  padding: 0 2rem;
  overflow: hidden;
  position: relative;
  align-items: center;
  margin-bottom: 1.5rem;
  border-top-left-radius: 0.6rem;
  border: 0.1rem solid var(--black);
  border-bottom-left-radius: 0.6rem;
  border-right: 0.3rem solid var(--black);
  > * {
    position: relative;
  }
  .pawn {
    height: 70%;
  }
  &::before {
    top: 0;
    left: 0;
    content: '';
    width: 100%;
    height: 100%;
    opacity: 0.4;
    position: absolute;
    background-color: var(--player-color);
  }
}
</style>
