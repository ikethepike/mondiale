<template>
  <main class="dead-end-card">
    <h1 class="wordmark">
      <span class="mark" aria-hidden="true" />
      <span class="visually-hidden">Mondiale</span>
    </h1>
    <div class="message">
      <h2>You're on the balcony</h2>
      <p>
        Every seat at this table is taken, but you're in. The race hasn't started yet — the moment
        it does, you'll watch it live.
      </p>
    </div>
    <section class="seated" aria-label="Players at the table">
      <header>
        <p class="counter">{{ seated.length }}/{{ MAX_PLAYERS }}</p>
        <p v-if="gameStore.spectatorCount > 1" class="watching">
          {{ gameStore.spectatorCount }} waiting to watch
        </p>
      </header>
      <ul>
        <PlayerTile v-for="seatedPlayer in seated" :key="seatedPlayer.id" :player="seatedPlayer" />
      </ul>
    </section>
    <nav class="card-nav">
      <ButtonLine element="NuxtLink" to="/">
        <span>Back to the home screen</span>
      </ButtonLine>
    </nav>
  </main>
</template>

<script lang="ts" setup>
import ButtonLine from '~/components/button/ButtonLine.vue'
import PlayerTile from '~/components/player/PlayerTile.vue'
import { MAX_PLAYERS } from '~~/lib/player'
import { useGameStore } from '~~/store/game.store'

// The balcony is in the socket room, so the seated list stays live: names,
// colours and the door all update off the same broadcasts the lobby gets.
// Game start swaps this view for the booth via the room page's routing.
const gameStore = useGameStore()
const seated = computed(() => Object.values(gameStore.game?.players ?? {}))
</script>

<style lang="scss" scoped>
.seated {
  width: 100%;
  max-width: 24rem;

  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;

    .counter,
    .watching {
      margin: 0 0 0.6rem;
      opacity: 0.65;
    }
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-height: 40vh;
    overflow-y: auto;
  }
}
</style>
