<template>
  <ModalWrapper>
    <article
      class="pane tutorial-card tr tl decorator-bottom"
      :class="{ 'has-animated': hasCardAnimated }"
      ref="card"
    >
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
          <div class="players-playing">
            <PlayerPawn class="pawn" v-for="player in playersPlaying" :player="player" />
          </div>
          <ButtonFilled>Close tutorial</ButtonFilled>
        </nav>
      </form>
    </article>
  </ModalWrapper>
</template>
<script lang="ts" setup>
import { useClientEvents } from '~~/lib/events/client-side'

const card = ref<HTMLElement>()
const hasCardAnimated = ref(false)

onMounted(() => {
  console.log(card.value)
  card.value?.addEventListener('animationend', () => (hasCardAnimated.value = true))
  card.value?.addEventListener('animationcancel', () => (hasCardAnimated.value = true))
})

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
.tutorial-card {
  margin: auto;
  max-width: 50rem;
  animation: slide-up 0.5s 1;
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

.tutorial-card .players-playing .pawn {
  opacity: 0;
  transform: translateY(100%);
  @for $i from 1 through 10 {
    &:nth-child(#{$i}) {
      transition: #{$i * 0.2s};
    }
  }
}
.tutorial-card.has-animated .players-playing .pawn {
  opacity: 1;
  transform: translateY(0);
}

@keyframes slide-up {
  0% {
    opacity: 0.3;
    transform: translateY(10%);
  }
}
</style>
