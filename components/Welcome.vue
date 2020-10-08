<template>
  <main class="theme-gradient">
    <form class="start-game" :action="`/room/${roomName}`">
      <section class="intro theme-background theme-color">
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
          <header>
            <a
              class="settings-button"
              role="button"
              @click="view.settings = true"
              >⚙</a
            >
          </header>

          <MapWorld />
        </div>
        <input v-model="variants[variant]" name="variant" type="hidden" />
        <footer class="variant-nav">
          <a role="button" class="arrow left" @click="nextVariant">←</a>
          <span class="variant-title">{{
            variants[variant].replace('-', ' ')
          }}</span>
          <a role="button" class="arrow right" @click="prevVariant">→</a>
        </footer>
      </section>
    </form>

    <small id="copyright" class="theme-color">© Nicholas, Lovisa, Isaac</small>
  </main>
</template>
<script lang="ts">
import randomWords from 'random-words'
import { defineComponent, reactive } from '@nuxtjs/composition-api'
import { variants } from '~/types/game'
import { Country } from '~/types/geography'
import { RootState } from '~/store/index'

export default defineComponent({
  setup() {
    const state = reactive({
      variants,
      variant: 0,
      started: false,
      roomName: randomWords({ exactly: 3, join: '-' }),
      view: {
        settings: false,
      },
    })

    return state
  },
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
  computed: {
    countries(): Country[] {
      return (this.$store.state as RootState).countries
    },
  },
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
  max-width: 70rem;
  min-height: 30rem;
  position: relative;
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

#copyright {
  left: 0;
  width: 100%;
  bottom: 1rem;
  text-align: center;
  position: absolute;
}
</style>
