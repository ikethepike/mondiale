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
    <span v-if="waving" style="font-size: 20rem">WAVING</span>
    <ModalSetName v-if="!player.name" :player="player" :game="game" />
    <ModalWaiting v-if="player.name" :game="game" :player="player" />
    <WorldMap />
  </div>
</template>
<script lang="ts">
import { defineComponent } from '@vue/composition-api'
import { parseCookie } from '../../lib/cookie'
import { update } from '../../lib/CSE'
import { generateHash } from '../../lib/hashing'
import { Game, Player, Update } from '~/types/game'

interface GameData {
  game?: Game
  waving: boolean
  playerId: string
  roomName: string
  playerName: string
}

export default defineComponent({
  data: (): GameData => ({
    playerId: '',
    roomName: '',
    waving: false,
    playerName: '',
    game: undefined,
  }),
  async asyncData({ params, res, req }) {
    const cookies = parseCookie(String(req?.headers?.cookie))
    const playerId = cookies.player || generateHash()

    const response: {
      game: Game
      player: Player
    } = await update({
      gameId: params.id,
      event: 'connect',
      playerId,
    })

    const { game, player } = response

    res.setHeader(
      'set-cookie',
      `player=${playerId}; httpOnly; Max-Age=${60 * 60 * 24 * 7}`
    )

    return {
      game,
      playerId: player.id,
    }
  },
  computed: {
    player(): Player | undefined {
      if (!this.game) return undefined
      return this.game.players[this.playerId]
    },
  },
  mounted() {
    if (!this.game) {
      throw new Error('Game not instantiated')
    }

    const { game, playerId } = this

    const source = new EventSource(`/api/feed/${game.id}/${playerId}`)
    source.addEventListener('message', (message) => {
      const update: Update = JSON.parse(message.data)

      switch (update.event) {
        case 'name-set':
          this.game = update.game
          break
        case 'new-round':
          // console.log(update.lists)
          break
        case 'player-joined':
          this.game = update.game
          break
        case 'player-waved':
          this.waving = true
        default:
          break
      }
    })

    // Notify other players that we have joined
    source.addEventListener('open', () => {
      update({
        event: 'join-game',
        playerId: this.playerId,
        gameId: game.id,
      })
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
</style>
