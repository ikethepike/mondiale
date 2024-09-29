<template>
  <ModalWrapper>
    <article class="view-victory pane decorator-bottom" v-if="game">
      <div class="pane-content">
        <h1>Congratulations!</h1>
        <!-- <p>Nicely done, {{ player?.name }}! You placed {{ placement }}</p> -->

        <hr />
        <h3>Leaderboard</h3>
        <ul>
          <!-- <li v-for="leader in game.leaderboard">
            <span class="name">{{ game.players[leader.playerId].name }}</span>
            <span class="round">{{ leader.round }}</span>
          </li> -->
        </ul>
      </div>
    </article>
  </ModalWrapper>
</template>
<script lang="ts" setup>
import { useClientEvents } from '~~/lib/events/client-side'

const { player, game } = useClientEvents()

// const placement = computed(() => {
//   if (!game.value) return 0
//   return game.value.leaderboard.findIndex(({ playerId }) => playerId === player.value?.id) + 1
// })
</script>
<style lang="scss">
.view-victory {
  margin: auto;
  width: 90%;
  max-width: 52rem;
  animation: slide-in 0.5s 1;
}

@keyframes slide-in {
  0% {
    opacity: 0.3;
    transform: translateY(5rem);
  }
}
</style>
