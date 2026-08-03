<template>
  <main class="rejected-room">
    <h1 class="wordmark">
      <span class="mark" aria-hidden="true" />
      <span class="visually-hidden">Mondiale</span>
    </h1>
    <div v-if="roomFull" class="message" role="alert">
      <h2>This table is full</h2>
      <p>All {{ MAX_PLAYERS }} seats are taken. You'll have to catch the next game.</p>
    </div>
    <div v-else class="message" role="alert">
      <h2>This game already started</h2>
      <p>The players are already out in the world. You'll have to catch the next one.</p>
    </div>
    <ButtonFilled element="NuxtLink" to="/">
      <span>Start your own game</span>
    </ButtonFilled>
  </main>
</template>

<script lang="ts" setup>
import ButtonFilled from '~/components/button/ButtonFilled.vue'
import { MAX_PLAYERS } from '~~/lib/player'
import { useGameStore } from '~~/store/game.store'

// The mid-watch ejection path reaches this card with `rejected` unset — the
// full-table copy shows only on an explicit capacity refusal.
const roomFull = computed(() => useGameStore().rejected === 'full')
</script>

<style lang="scss" scoped>
.rejected-room {
  height: var(--viewport-height);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2rem;
  pointer-events: auto;
  text-align: center;
  padding: 0 calc(2rem + var(--safe-right)) 0 calc(2rem + var(--safe-left));
}

.wordmark {
  margin: 0;
  width: 100%;
  max-width: 32rem;
}

.mark {
  display: block;
  height: 3.2rem;
  background: var(--text-color);
  mask: url(~/assets/logos/mondiale.svg) no-repeat center/contain;
}

.message {
  max-width: 34rem;

  h2 {
    margin: 0 0 0.8rem;
    font-size: 2rem;
  }

  p {
    margin: 0;
    color: var(--dark-blue);
    opacity: 0.75;
  }
}
</style>
