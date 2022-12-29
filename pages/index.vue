

<template>
  <main class="theme-gradient">
    <form class="start-game" :action="`/room/${roomName}`">
      <section class="intro theme-background theme-color">
        <article>
          <h1>Welcome to Globalissimo</h1>
          <p>
            Horrido! Das famos Rädelsführer piesacken. Die Wurstkessel auftakeln das adrett Schmock.
            Der bräsig Schluckspecht. Sülze und Schuhwichse dengeln fidel Herrengedeck. Der Wildfang
            festnageln die gemach Pantoffelheld. Das Schindluder abkupfern die grobschlächtig
            Flausen. Das blümerant Flickschusterei. Der halbstark Haubitze abkupfern. Das einfältig
            Unhold. Das Flausen bauchpinseln die hold Lametta. Lümmeltüte und Schenkelbürste
            erquicken altbacken Grüne Minna. Mein lieber Herr Gesangsverein!
          </p>
        </article>
        <button class="line-button">Start Game</button>
      </section>
      <section class="variant-picker">
  
        <div class="variant-display">
          <MapWorld />
        </div>
        <input v-model="gameVariants[activeVariant]" name="variant" type="hidden" />
        <footer class="variant-nav">
          <a role="button" class="arrow left" @click="nextVariant">←</a>
          <span class="variant-title">{{ gameVariants[activeVariant].replace('-', ' ') }}</span>
          <a role="button" class="arrow right" @click="prevVariant">→</a>
        </footer>
      </section>
    </form>
  </main>
</template>
<script lang="ts">
import randomWords from 'random-words'
import { gameVariants } from '~~/types/game.types'


export default defineComponent({
  setup() {
    const roomName = ref(randomWords({ exactly: 3, join: '-' }))
    const activeVariant = ref(0)
    const nextVariant = () => {
      if (gameVariants[activeVariant.value + 1]) {
        activeVariant.value += 1
      } else {
        activeVariant.value = 0
      }
    }

    const prevVariant = () => {
      if (activeVariant.value - 1 < 0) {
        activeVariant.value = gameVariants.length - 1
      } else {
        activeVariant.value -= 1
      }
    }

    return {
      roomName,
      gameVariants, 
      nextVariant, 
      prevVariant,
      activeVariant, 
    }
  }
})
</script>
<style>
main {
  display: flex;
  min-height: 100vh;
}

.start-game {
  z-index: 2;
  width: 100%;
  margin: auto;
  display: flex;
  overflow: hidden;
  max-width: 90rem;
  min-height: 35rem;
  position: relative;
  align-items: stretch;
}

.start-game>section {
  width: 50%;
}

.start-game .intro {
  display: flex;
  flex-direction: column;
  padding: 5rem 3rem 0 3rem;
  justify-content: space-between;
}

.variant-picker {
  display: flex;
  position: relative;
  flex-flow: column nowrap;
  text-transform: capitalize;
  background: var(--soft-mint);
  justify-content: space-between;
}

.variant-picker header,
.variant-picker footer {
  width: 100%;
  display: flex;
  position: absolute;
  align-items: center;
  pointer-events: none;
  justify-content: flex-end;
  padding: var(--button-padding);
}

.settings-button {
  font-size: 1.75rem;
  pointer-events: auto;
}

.variant-picker footer {
  left: 0;
  bottom: 0;
  user-select: none;
  line-height: 100%;
  align-items: center;
  justify-content: space-between;
}

.arrow {
  font-size: 2rem;
  padding: 0 1rem;
  pointer-events: auto;
}

.settings {
  top: 10%;
  left: 10%;
  width: 80%;
  height: 80%;
  padding: 1.5rem;
  position: absolute;
  animation: settings-slide 0.5s 1;
}

#copyright {
  left: 0;
  width: 100%;
  bottom: 1rem;
  text-align: center;
  position: absolute;
}

@keyframes settings-slide {
  0% {
    transform: scale(0.8) translateY(-100%) rotateX(90deg);
  }

  50% {
    transform: scale(0.9) translateY(-50%) rotateX(90deg);
  }
}
</style>
