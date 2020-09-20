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
import axios from 'axios'
import { defineComponent, ref } from '@vue/composition-api'

export default defineComponent({
  data: () => ({
    started: false,
  }),
  methods: {
    startGame() {
      this.$store.dispatch('game/startGame', this.name)
    },
  },
  setup() {
    const name = ref('')

    return {
      name,
    }
  },
  mounted() {
    const source = new EventSource('/api')
    source.addEventListener('message', (message) => {
      console.log(message)
    })
  },
})
</script>
