<template>
  <div class="modal-wrapper">
    <article class="modal theme-highlight-background theme-color slide-block">
      <div class="form-content">
        <header>
          <h1>Ready to go?</h1>
          <div class="player-count">
            <span
              >Players Ready: {{ playerCounts.ready }}/{{
                playerCounts.total
              }}</span
            >
          </div>
        </header>
        <ul class="player-listing">
          <li
            v-for="p in game.players"
            :key="p.id"
            :class="{
              ready: p.name,
              self: p.id === player.id,
              waving: waving[p.id],
            }"
          >
            <div class="gutter">
              <a
                v-if="isPlayerHost && p.id !== player.id"
                title="Kick player"
                role="button"
                @click="kick(p.id)"
                >✕</a
              >
            </div>
            <span class="name" @click="wave(p.id)">
              {{ p.name || p.id }}
              <span v-if="p.id === game.host" class="host">( host )</span>
            </span>
          </li>
        </ul>
      </div>

      <template v-if="isPlayerHost">
        <button
          v-if="playerCounts.total === 1"
          class="line-button"
          @click="invite"
        >
          <span id="invite-player-text"
            >{{ invited ? 'Link Copied' : 'Invite Players' }}
          </span>
        </button>

        <button
          v-else
          class="line-button slide-block"
          :disabled="playerCounts.ready !== playerCounts.total"
          @click="startGame"
        >
          Start Game
        </button>
      </template>
      <template v-else>
        <div class="status form-content">
          <span v-if="playerCounts.ready !== playerCounts.total"
            >Waiting for other players...</span
          >
          <span v-else>Waiting for host...</span>
        </div>
      </template>
    </article>
  </div>
</template>
<script lang="ts">
import { defineComponent } from '@vue/composition-api'
import { Player } from '../../types/game'
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
    waving: {
      type: Object,
      required: true,
    },
  },
  data: () => ({
    invited: false,
  }),
  methods: {
    startGame(): void {
      if (!this.isPlayerHost) return

      update({
        event: 'start-game',
        gameId: this.game.id,
        playerId: this.player.id,
      })
    },
    wave(targetPlayer: string) {
      if (targetPlayer === this.player.id) return
      update({
        event: 'wave-at-player',
        gameId: this.game.id,
        playerId: this.player.id,
        targetPlayer,
      })
    },
    kick(targetPlayer: string) {
      if (this.game.host !== this.player.id) return
      update({
        event: 'kick-player',
        gameId: this.game.id,
        playerId: this.player.id,
        targetPlayer,
      })
    },
    invite() {
      if (!navigator?.clipboard || !window) return

      this.invited = true

      const { protocol, host } = window.location
      const url = `${protocol}//${host}/room/${this.game.id}`
      navigator.clipboard.writeText(url)

      setTimeout(() => {
        this.invited = false
      }, 2000)
    },
  },
  computed: {
    playerCounts(): {
      total: number
      ready: number
    } {
      const players: Player[] = Object.values(this.game.players)

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
ul {
  margin: 1rem 0;
}
li {
  display: flex;
  align-items: center;
  margin-bottom: 0.5rem;
}
li .gutter {
  width: 1rem;
  cursor: pointer;
  margin-right: 1rem;
}
li.self .name {
  text-decoration: underline;
}
li.waving::after {
  margin-left: 0.5em;
  content: 'Waving!';
}
</style>
