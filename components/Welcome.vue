<template>
  <main>
    <form class="start-game" :action="`/room/${roomName}`">
      <section class="intro">
        <article>
          <h1>Welcome to Globalissimo</h1>
          <p>
            Horrido! Das famos Rädelsführer piesacken. Die Wurstkessel auftakeln
            das adrett Schmock. Der bräsig Schluckspecht. Sülze und Schuhwichse
            dengeln fidel Herrengedeck. Der Wildfang festnageln die gemach
            Pantoffelheld. Das Schindluder abkupfern die grobschlächtig Flausen.
            Das blümerant Flickschusterei. Der halbstark Haubitze abkupfern. Das
            einfältig Unhold. Das Flausen bauchpinseln die hold Lametta.
            Lümmeltüte und Schenkelbürste erquicken altbacken Grüne Minna. Mein
            lieber Herr Gesangsverein!
          </p>
        </article>
        <button class="line-button">Start Game</button>
      </section>
      <section class="variant-picker">
        <div class="variant-display">
          <!-- vector graphics here  -->
        </div>
        <input v-model="variants[variant]" name="variant" type="hidden" />
        <div class="variant-nav">
          <a role="button" class="arrow left" @click="nextVariant">←</a>
          <span class="variant-title">{{ variants[variant] }}</span>
          <a role="button" class="arrow right" @click="prevVariant">→</a>
        </div>
      </section>
    </form>
  </main>
</template>
<script lang="ts">
import randomWords from 'random-words'
import { defineComponent } from '@vue/composition-api'
import { variants } from '~/types/game'

export default defineComponent({
  data: () => ({
    variants,
    variant: 0,
    started: false,
    roomName: randomWords({ exactly: 3, join: '-' }),
  }),
  methods: {
    nextVariant() {
      if (this.variants[this.variant + 1]) {
        this.variant += 1
      } else {
        this.variant = 0
      }
    },
    prevVariant() {
      if (this.variant - 1 < 0) {
        this.variant = this.variants.length - 1
      } else {
        this.variant -= 1
      }
    },
  },
  mounted() {
    // const source = new EventSource('/api')
    // source.addEventListener('message', (message) => {
    //   console.log(message)
    // })
  },
})
</script>
<style>
main {
  display: flex;
  min-height: 100vh;
  color: var(--text-color-light);
  background: linear-gradient(
      180deg,
      var(--soft-mint) 0%,
      var(--warm-sand) 100%
    ),
    var(--soft-blue);
}

.start-game {
  width: 100%;
  margin: auto;
  display: flex;
  max-width: 70rem;
  min-height: 30rem;
  background: #fff;
  align-items: stretch;
}

.start-game > section {
  width: 50%;
}
.start-game .intro {
  display: flex;
  flex-direction: column;
  padding: 3rem 2rem 0 2rem;
  justify-content: space-between;
}
.variant-picker {
  background: var(--soft-mint);
}

@media (prefers-color-scheme: dark) {
  main {
    color: var(--text-color-dark);
    background: linear-gradient(
        180deg,
        var(--dark-blue) 0%,
        var(--soft-mint) 100%
      ),
      var(--soft-blue);
  }
}
</style>
