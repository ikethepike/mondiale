<template>
  <main class="dead-end-card">
    <h1 class="wordmark">
      <span class="mark" aria-hidden="true" />
      <span class="visually-hidden">Mondiale</span>
    </h1>
    <div v-if="removed" class="message">
      <h2>The host removed you</h2>
      <p>You're out of this game. You'll have to catch the next one.</p>
    </div>
    <div v-else-if="roomFull" class="message">
      <h2>This table is full</h2>
      <p v-if="gameStore.spectatable">
        All {{ MAX_PLAYERS }} seats are taken, but the room is open to watchers.
      </p>
      <p v-else>All {{ MAX_PLAYERS }} seats are taken. You'll have to catch the next game.</p>
    </div>
    <div v-else-if="sealedBeforeStart" class="message">
      <h2>The room is sealed</h2>
      <p>The host closed the room to watchers. You'll have to catch the next game.</p>
    </div>
    <div v-else class="message">
      <h2>This game already started</h2>
      <p>The players are already out in the world. You'll have to catch the next one.</p>
    </div>
    <nav class="card-nav">
      <ButtonFilled v-if="roomFull && gameStore.spectatable" @click="watchInstead">
        <span>Watch instead</span>
      </ButtonFilled>
      <ButtonLine v-if="roomFull && gameStore.spectatable" element="NuxtLink" to="/">
        <span>Start your own game</span>
      </ButtonLine>
      <ButtonFilled v-else element="NuxtLink" to="/">
        <span>Start your own game</span>
      </ButtonFilled>
    </nav>
  </main>
</template>

<script lang="ts" setup>
import ButtonFilled from '~/components/button/ButtonFilled.vue'
import ButtonLine from '~/components/button/ButtonLine.vue'
import { MAX_PLAYERS } from '~~/lib/player'
import { useJoinRoom } from '~~/lib/use-join-room'
import { useGameStore } from '~~/store/game.store'

const gameStore = useGameStore()
const joinRoom = useJoinRoom()

// The mid-watch ejection paths reach this card with `rejected` unset — the
// explicit copy branches only show on their own refusal (or, for the sealed
// balcony, on an unstarted game with no refusal on record).
const removed = computed(() => gameStore.rejected === 'removed')
const roomFull = computed(() => gameStore.rejected === 'full')
const sealedBeforeStart = computed(
  () => !gameStore.rejected && !!gameStore.game && !gameStore.game.started
)

// A spectatable room-full left the socket connected, so this is a plain
// re-emit of join with the watch intent. If the door closed meanwhile the
// server refuses again (spectatable: false, disconnect) and the card
// re-renders buttonless — clearing `rejected` first drops us to the loading
// state instead of a stale card while the round-trip is in flight.
const watchInstead = () => {
  gameStore.rejected = false
  gameStore.spectatable = false
  gameStore.joinAsSpectator = true
  joinRoom()
}
</script>
