<template>
  <div class="modal-wrapper board-wrapper">
    <a class="background" />
    <GameBoard />
  </div>
</template>
<script lang="ts" setup>
import { useClientEvents } from '~~/lib/events/client-side'
import type { Player } from '~~/types/player.type'

const { game } = useClientEvents()

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
</script>
<style lang="scss" scoped>
.background {
  width: 100%;
  height: 100%;
  display: block;
  position: absolute;
  background: var(--soft-mint);
}
</style>
