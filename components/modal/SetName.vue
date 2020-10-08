<template>
  <div class="modal-wrapper">
    <a role="button" class="modal-background"></a>

    <article class="modal theme-highlight-background theme-color slide-block">
      <form @submit.prevent="setName">
        <div class="form-content">
          <header>
            <h1>Welcome!</h1>
            <a role="button" @click="invite">
              <svg
                width="64"
                height="64"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle
                  cx="32"
                  cy="20"
                  r="10"
                  stroke="currentColor"
                  stroke-width="2"
                />
                <path
                  d="M15.035 53c.274-3.985 2.13-8.79 5.04-12.718C23.244 36.008 27.482 33 32 33c4.519 0 8.757 3.008 11.925 7.282 2.91 3.928 4.766 8.733 5.04 12.718h-33.93zM7 31h10M12 26v10"
                  stroke="currentColor"
                  stroke-width="2"
                />
              </svg>
            </a>
          </header>
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
import { defineComponent } from '@nuxtjs/composition-api'
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
    invite() {
      if (navigator?.clipboard && window) {
        const { protocol, host } = window.location
        const url = `${protocol}//${host}/room/${this.game.id}`
        navigator.clipboard.writeText(url)
      }
    },
  },
})
</script>
