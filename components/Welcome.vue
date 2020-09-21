<template>
  <main>
    <WorldMap />

    <form v-if="!started" @submit.prevent="startGame">
      <h1>Welcome to Globalissimo</h1>

      <div class="slide-block">
        <label for="name">Name</label>
        <input id="name" v-model="name" type="text" required />
      </div>

      <div class="slide-block"><button>Start Game</button></div>
    </form>
  </main>
</template>
<script lang="ts">
import { defineComponent, ref } from '@vue/composition-api'
import { Game } from '~/types/game'

export default defineComponent({
  data: () => ({
    started: false,
  }),
  methods: {
    startGame() {
      this.$store.dispatch('game/connect', this.name)
      this.started = true

      const game: Game = this.$store.state.game.game

      if (game) {
        history.pushState(null, '', `/game/${game.id}`)
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
@media (prefers-color-scheme: dark) {
  main {
    color: orange;
    background: darkslategrey;
  }
}
</style>
