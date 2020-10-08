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
    <ModalSetName v-if="!player.name" :player="player" :game="game" />
    <ModalWaiting
      v-if="player.name && rounds.length === 0"
      :game="game"
      :player="player"
      :waving="waving"
    />
    <!-- <CardView v-if="countryCodes.length" :country-codes="countryCodes" /> -->
    <GameMap />
  </div>
</template>
<script lang="ts">
import { defineComponent } from '@nuxtjs/composition-api'
import { parseCookie } from '../../lib/cookie'
import { update } from '../../lib/CSE'
import { generateHash } from '../../lib/hashing'
import { Game, Player, Round, Update } from '~/types/game'
import { CountryCode } from '~/types/geography'

interface GameData {
  game?: Game
  rounds: Round[]
  playerId: string
  roomName: string
  playerName: string
  waving: { [playerId: string]: boolean }
}

export default defineComponent({
  data: (): GameData => ({
    rounds: [],
    playerId: '',
    roomName: '',
    waving: {},
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

    if (res) {
      res.setHeader(
        'set-cookie',
        `player=${playerId}; httpOnly; Max-Age=${60 * 60 * 24 * 7}`
      )
    }

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
    countryCodes(): CountryCode[] {
      const latest = [...this.rounds].pop()
      if (!latest) return []
      return latest.lists[this.playerId]
    },
  },
  // watch: {
  //   game() {
  //     if (!this.game) return

  //     Object.keys(this.game.players).forEach((playerId) => {
  //       this.waving[playerId] = false
  //     })
  //   },
  // },
  mounted() {
    if (!this.game) {
      throw new Error('Game not instantiated')
    }

    const url = `${location.protocol}//${location.host}/room/${this.game.id}`

    history.replaceState(null, this.game.id, url)

    const { game, playerId } = this

    const source = new EventSource(`/api/feed/${game.id}/${playerId}`)
    source.addEventListener('message', (message) => {
      const update: Update = JSON.parse(message.data)

      switch (update.event) {
        case 'name-set':
        case 'player-joined':
        case 'game-updated':
          this.game = update.game
          break
        case 'player-waved':
          this.waving[update.playerId] = true
          break
        case 'new-round':
          this.rounds.push({
            number: this.rounds.length,
            points: {},
            lists: update.lists,
          })
          break
        case 'player-kicked':
          this.$router.push('/?kicked=1')
          break
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
