<template>
  <ModalWrapper>
    <article class="pane tutorial-card tr tl decorator-bottom">
      <form class="pane-content" @submit.prevent="closeTutorial">
        <h1>Let's start!</h1>
        <p>Let's see who is the best at geography. There are three separate phases to the game:</p>
        <ol>
          <li>The Group Challenge</li>
          <li>The Movement Phase</li>
          <li>Individual Challenges</li>
        </ol>
        <p>
          Do well in the group challenge and you get to take more steps during the movement phase.
          But to be able to progress fully, you have to beat any individual challenges that you
          might come across.
        </p>
        <nav>
          <TransitionGroup tag="div" name="pawn-arrive" class="players-playing" appear>
            <PlayerPawn
              v-for="player in playersPlaying"
              :key="player.id"
              class="pawn"
              :player="player"
            />
          </TransitionGroup>
          <ButtonFilled>Close tutorial</ButtonFilled>
        </nav>
      </form>
    </article>
  </ModalWrapper>
</template>
<script lang="ts" setup>
import { useClientEvents } from '~~/lib/events/client-side'

const { gameStore, update, playerId } = useClientEvents()
const playersPlaying = computed(() =>
  Object.values(gameStore.game?.players || {}).filter(player => player.phase !== 'tutorial')
)

const closeTutorial = () => {
  if (gameStore.game?.players[playerId.value]) {
    gameStore.game.players[playerId.value].phase = 'group-challenge'
  }

  update({ event: 'close-tutorial' })
}
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;

.tutorial-card {
  margin: auto auto 0 auto;
  max-width: 50rem;
}

ol {
  padding: 1em;
}

nav {
  display: grid;
  padding-top: 2rem;
  align-items: center;
  grid-template-columns: 2fr 1fr;
}

.players-playing {
  gap: 1rem;
  width: 100%;
  height: 3.5rem;
  display: flex;
  align-items: stretch;
}

// Pawns pop in as other players finish reading the tutorial
.pawn-arrive-enter-from {
  opacity: 0;
  transform: translateY(100%);
}
.pawn-arrive-enter-active,
.pawn-arrive-move {
  transition:
    opacity var(--motion-base) var(--ease-out-expressive),
    transform var(--motion-base) var(--ease-out-expressive);
}

@media screen and (min-width: $tablet) {
  .tutorial-card {
    margin: auto;
  }
}
</style>
