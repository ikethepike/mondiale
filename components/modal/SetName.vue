<template>
  <div class="modal-wrapper">
    <a role="button" class="modal-background"></a>

    <article class="modal theme-highlight-background theme-color slide-block">
      <form @submit.prevent="setName">
        <div class="form-content">
          <h1>Welcome!</h1>
          <p>Add copy...</p>

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
import { defineComponent, PropType } from '@vue/composition-api'
import { update } from '~/lib/CSE'
import { Game, Player } from '~/types/game'

export default defineComponent({
  props: {
    player: {
      type: Object as PropType<Player>,
      required: true,
    },
    game: {
      type: Object as PropType<Game>,
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
