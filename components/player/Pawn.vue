<template>
  <a class="player" :style="{ backgroundColor: player?.color }" />
</template>
<script lang="ts" setup>
import { PropType } from 'vue'
import { Player } from '~~/types/player.type'

defineProps({
  player: {
    type: Object as PropType<Player>,
  },
})
</script>
<style lang="scss">
.player {
  width: 3rem;
  height: 3rem;
  display: block;
  border-radius: 50%;
  border: 0.1rem solid;
}
</style>
