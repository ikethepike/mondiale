<template>
  <div class="modal-wrapper">
    <a role="button" class="modal-background"></a>

    <article class="modal theme-highlight-background theme-color slide-block">
      <form @submit.prevent="setName">
        <div class="form-content">
          <header>
            <h1>Welcome!</h1>
          </header>
          <p>
            Drückeberger und Trinkhalle stagnieren verhärmt Zeche. Die dufte
            Schenkelbürste katzbuckeln. Das einfältig Schindluder abkupfern.
            Fressalien und Kerbholz katzbuckeln bräsig Weltschmerz. Das
            blindwütig Lausbub meucheln!
          </p>

          <div class="input-wrapper slide-block">
            <label for="name">Name</label>
            <input id="name" v-model="name" type="text" />
          </div>
        </div>

        <button class="line-button">Save</button>
      </form>
    </article>
  </div>
</template>
<script lang="ts">
import { defineComponent } from '@vue/composition-api'
import { update } from '~/lib/CSE'

export default defineComponent({
  props: {
    player: {
      type: Object,
      required: true,
    },
    game: {
      type: Object,
      required: true,
    },
  },
  data: () => ({
    name: '',
  }),
  methods: {
    async setName() {
      const { game, player, name } = this

      await update({
        event: 'set-name',
        name,
        gameId: String(game?.id),
        playerId: String(player?.id),
      })
    },
  },
})
</script>
<style scoped>
.input-wrapper {
  display: flex;
  padding: 1.125rem 0;
  align-items: center;
}
.input-wrapper label {
  padding-right: 1rem;
}
</style>
