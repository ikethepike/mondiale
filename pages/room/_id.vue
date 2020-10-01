<template>
  <div class="main-board">
    <div v-if="game" class="player-progress">
      <PlayerProgress
        v-for="player in game.players"
        :key="player.id"
        :progress="player.progress"
        :color="player.color"
      />
    </div>

    <div v-if="!player.name" class="modal-wrapper">
      <a role="button" class="modal-background"></a>

      <article class="modal theme-highlight-background theme-color slide-block">
        <form class="modal" @submit.prevent="setName">
          <div class="form-content">
            <h1>Welcome!</h1>
            <p>Add copy...</p>

            <div class="input-wrapper slide-block">
              <label for="name">Name</label>
              <input id="name" v-model="playerName" type="text" />
            </div>
          </div>

          <button class="line-button">Save</button>
        </form>
      </article>
    </div>

    <WorldMap />
  </div>
</template>
<script lang="ts">
import { defineComponent } from '@vue/composition-api'
import { parseCookie } from '../../lib/cookie'
import { Command, Game, Player } from '~/types/game'

const update = async (cmd: Command) => {
  try {
    const response = await fetch(process.env.baseUrl + 'api/commands', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(cmd),
    })
    return await response.json()
  } catch (e) {
    return undefined
  }
}

interface GameData {
  game?: Game
  player?: Player
  roomName: string
  playerName: string
}

export default defineComponent({
  data: (): GameData => ({
    roomName: '',
    playerName: '',
    game: undefined,
    player: undefined,
  }),
  async asyncData({ params, req }) {
    const cookies = parseCookie(String(req.headers.cookie))

    const response: {
      game: Game
      player: Player
    } = await update({
      gameId: params.id,
      event: 'connect',
      playerId: cookies.player,
    })

    const { game, player } = response

    return {
      game,
      player,
    }
  },
  methods: {
    async setName() {
      const { game, player, playerName } = this

      await update({
        playerId: String(player?.id),
        gameId: String(game?.id),
        event: 'set-name',
        name: playerName,
      })
    },
  },
  mounted() {
    if (!this.game) {
      throw new Error('Game not instantiated')
    }
    const source = new EventSource(`/api/feed/${this.game.id}`)
    source.addEventListener('message', (message) => {
      console.log(message)
      try {
        const game: Game = JSON.parse(message.data)
        this.game = game
        if (this.player) {
          this.player = game.players[this.player.id]
        }
      } catch (e) {
        console.log('failed to parse response')
      }
    })
  },
})
</script>
<style scoped>
.grid-overlay {
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: grid;
  position: absolute;
  background: rgba(255, 255, 255, 0.5);
}
.tile {
  width: 5rem;
  height: 5rem;
  border-radius: 5px;
  background: tomato;
}
.player-progress {
  width: 100%;
  position: absolute;
}

.modal-wrapper {
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  position: fixed;
}
.modal-background {
  width: 100%;
  height: 100%;
  position: absolute;
  background: rgba(#fff, 0.3);
}
.modal {
  width: 95%;
  margin: auto;
  max-width: 43rem;
  position: relative;
}
.form-content {
  padding: 1rem;
}
</style>
