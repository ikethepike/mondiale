<template>
  <div class="main-board theme-background">
    <div v-if="game" class="player-progress">
      <GameTiles :tiles="game.tiles" />
      <!-- <PlayerProgress
        v-for="player in game.players"
        :key="player.id"
        :progress="player.progress"
        :color="player.color"
      /> -->
    </div>
    <ModalPlayerConfiguration v-if="phase.naming" :player="player" :game="game" />
    <ModalWaiting v-if="phase.waiting" :game="game" :player="player" :waving="waving" />
    <div :class="{ playing: phase.playing }" class="map-wrapper">
      <GameMap />
    </div>

    <PlayerDrawer
      v-if="currentChallenge && !hasAnswered"
      :codes="currentChallenge.countries"
      :game-id="game.id"
      :player-id="playerId"
      :answers="currentChallenge.answers"
      :statistic="currentChallenge.statistic"
    />
  </div>
</template>
<script lang="ts">
import Vue from 'vue'
import { defineComponent } from '@vue/composition-api'
import { parseCookie } from '../../lib/cookie'
import { update } from '../../lib/CSE'
import { generateHash } from '../../lib/hashing'
import { Challenge, Game, GameLength, Player, Round, Update, Variant } from '~/types/game'

interface GameData {
  game?: Game
  playerId: string
  roomName: string
  playerName: string
  waving: { [playerId: string]: boolean }
}

export default defineComponent({
  data: (): GameData => ({
    playerId: '',
    roomName: '',
    waving: {},
    playerName: '',
    game: undefined,
  }),
  async asyncData({ params, res, req, query }) {
    const cookies = parseCookie(String(req?.headers?.cookie))
    const playerId = cookies.player || generateHash()

    const response: {
      game: Game
      player: Player
    } = await update({
      gameId: params.id,
      event: 'connect',
      playerId,
      variant: query.variant as Variant,
      options: query.variant
        ? {
            treaties: query.treaties === 'on',
            gender: query.gender === 'on',
            leaders: query.leaders === 'on',
            easyMode: query.easy === 'on',
            length: (query.length as GameLength) || 'medium',
          }
        : undefined,
    })

    const { game, player } = response

    if (res) {
      res.setHeader('set-cookie', `player=${playerId}; httpOnly; Max-Age=${60 * 60 * 24 * 7}`)
    }

    return {
      game,
      playerId: player.id,
    }
  },
  computed: {
    phase(): {
      naming: boolean
      waiting: boolean
      playing: boolean
    } {
      if (!this.player || !this.game) {
        return {
          naming: false,
          waiting: false,
          playing: false,
        }
      }

      return {
        naming: !this.player.name,
        playing: Boolean(this.game.rounds.length),
        waiting: Boolean(this.player.name) && this.game.rounds.length === 0,
      }
    },
    player(): Player | undefined {
      if (!this.game) return undefined
      return this.game.players[this.playerId]
    },
    hasAnswered(): boolean {
      if (!this.currentChallenge) return false
      return Boolean(this.currentChallenge.answers?.length)
    },
    currentRound(): Round | undefined {
      if (!this.game) return undefined
      const latest = [...this.game?.rounds].pop()

      if (!latest) return undefined
      return latest
    },
    currentChallenge(): Challenge | undefined {
      if (!this.currentRound) return undefined
      return this.currentRound.challenges[this.playerId]
    },
  },
  mounted() {
    if (!this.game) {
      throw new Error('Game not instantiated')
    }

    const { game, playerId } = this
    const url = `${location.protocol}//${location.host}/room/${game.id}`
    history.replaceState(null, game.id, url)

    const source = new EventSource(`/api/feed/${game.id}/${playerId}`)
    source.addEventListener('message', message => {
      const update: Update = JSON.parse(message.data)

      switch (update.event) {
        case 'name-set':
        case 'color-set':
        case 'new-round':
        case 'game-updated':
        case 'player-joined':
          Vue.set(this, 'game', update.game)
          break
        case 'player-waved':
          this.waving[update.playerId] = true
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
.map-wrapper {
  transition: 0.5s;
  filter: grayscale(1);
  transform: scale(0.9);
}
.map-wrapper.playing {
  transform: scale(1);
  filter: grayscale(0);
}
</style>
