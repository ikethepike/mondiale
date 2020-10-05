<template>
  <div class="modal-wrapper">
    <article class="modal theme-highlight-background theme-color slide-block">
      <form @submit.prevent="startGame">
        <div class="form-content">
          <header>
            <h1>Ready to go?</h1>
            <div class="player-count">
              <span>{{ playerCounts.ready }}</span>
              <span>/</span>
              <span>{{ playerCounts.total }} </span>
            </div>
          </header>
          <ul class="player-listing">
            <li
              v-for="p in game.players"
              :key="p.id"
              :class="{ ready: p.name }"
            >
              {{ p.name || p.id }}
            </li>
          </ul>
        </div>

        <template v-if="isPlayerHost">
          <button
            class="line-button"
            :disabled="playerCounts.ready !== playerCounts.total"
          >
            Start Game
          </button>
        </template>
        <template v-else>
          <div class="status">
            <span v-if="playerCounts.ready !== playerCounts.total"
              >Waiting for other players...</span
            >
            <span v-else>Waiting for host...</span>
          </div>
        </template>
      </form>
    </article>
  </div>
</template>
<script lang="ts">
import { defineComponent, PropType } from '@vue/composition-api'
import { Game, Player } from '../../types/game'
import { update } from '~/lib/CSE'

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
  methods: {
    startGame(): void {
      if (!this.isPlayerHost) return

      update({
        event: 'start-game',
        gameId: this.game.id,
        playerId: this.player.id,
      })
    },
  },
  computed: {
    playerCounts(): {
      total: number
      ready: number
    } {
      const players = Object.values(this.game.players)

      return {
        total: players.length,
        ready: players.filter((player) => player.name).length,
      }
    },
    isPlayerHost(): boolean {
      return this.player.id === this.game.host
    },
  },
})
</script>
<style scoped>
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
</style>
