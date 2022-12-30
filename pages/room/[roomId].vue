<template>
  <div class="main-board theme-background">
    <template v-if="game && player">
      <!-- First phase, player set-up -->
      <ModalPlayerConfiguration v-if="!game.started && player.phase === 'naming'" />

      <!-- Second phase, lobby -->
      <ModalWaiting v-if="!game.started && player.phase === 'waiting-for-game'" />

      <!-- GAME HAS STARTED AFTER THIS POINT -->
      <!-- Third phase, tutorial  -->
      <ModalTutorial v-if="player.phase === 'tutorial'" />

      <!-- Fourth phase, playing -->
      <main :class="{ playing: game.started && player.phase !== 'tutorial' }" class="map-wrapper">
        <GameMap v-if="player.phase === 'group-challenge'" :visible="true" />
      </main>

      <template v-if="currentRound?.round">
        <ModalGroupChallenge v-if="player.phase === 'group-challenge'" />
        <ModalScores v-if="player.phase === 'group-scores'" />
        <ModalMoving v-if="['moving', 'movement-summary'].includes(player.phase)" />
        <ModalIndividualChallenge v-if="player.phase === 'individual-challenge'" />
      </template>
    </template>
    <template v-else>
      <main class="map-wrapper">
        <span>Loading...</span>
      </main>
    </template>
  </div>
</template>
<script lang="ts" setup>
import { useClientEvents } from '~~/lib/events/client-side'
import { gameVariants } from '~~/types/game.types'

const { update, game, player, currentRound } = useClientEvents()

onMounted(() => {
  update({
    event: 'join',
    variant: gameVariants[0],
  })
})
</script>
<style scoped>
.main-board {
  height: 100vh;
  max-width: 100%;
  overflow: hidden;
  position: relative;
}

.grid-overlay {
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: grid;
  position: absolute;
  background: rgba(255, 255, 255, 0.5);
}

.tile {
  width: 5rem;
  height: 5rem;
  border-radius: 5px;
  background: tomato;
}

.player-progress {
  width: 100%;
  position: absolute;
}

.map-wrapper {
  transition: 0.5s;
  filter: grayscale(1);
  transform: scale(0.9);
}

.map-wrapper.playing {
  transform: scale(1);
  filter: grayscale(0);
}
</style>
