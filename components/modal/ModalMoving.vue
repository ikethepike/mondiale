<template>
  <div class="modal-wrapper board-wrapper">
    <a class="background" @click="closeModal" />
    <GameBoard />
  </div>
</template>
<script lang="ts" setup>
import { useClientEvents } from '~~/lib/events/client-side'
import { Player } from '~~/types/player.type'

const { game, gameStore } = useClientEvents()

const playerPositions = computed<{ player: Player; position: number }[]>(() => {
  let positionVector: Record<string, { player: Player; position: number }> = {}
  if (!game.value) return Object.values(positionVector)

  for (const player of Object.values(game.value.players)) {
    positionVector[player.id] = {
      player,
      position: 0,
    }
  }

  for (const round of game.value.rounds.slice(0, -1)) {
    for (const [playerId, score] of Object.entries(round.playerTurns)) {
      positionVector[playerId].position = +score.points.scored
    }
  }

  return Object.values(positionVector)
})

const closeModal = () => {
  gameStore.phase = 'waiting'
}
</script>
<style lang="scss" scoped>
.background {
  width: 100%;
  height: 100%;
  display: block;
  position: absolute;
  background: rgb(2, 0, 36);
  background: radial-gradient(
    circle,
    rgba(2, 0, 36, 1) 0%,
    rgba(2, 0, 36, 0.9814814814814815) 93%,
    rgba(2, 0, 36, 1) 100%
  );
}
</style>
