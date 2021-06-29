<template>
  <div class="main-board theme-background">
    <div v-if="game" class="player-progress">
      <GameTiles v-if="phase.playing" :tiles="game.tiles" />
    </div>
    <ModalPlayerConfiguration v-if="phase.naming" :player="player" :game="game" />
    <ModalWaiting v-if="phase.waiting" :game="game" :player="player" :waving="state.waving" />
    <main :class="{ playing: phase.playing }" class="map-wrapper">
      <GameMap />
    </main>

    <!-- <PlayerDrawer
      v-if="currentChallenge && !hasAnswered"
      :codes="currentChallenge.countries"
      :game-id="game.id"
      :player-id="playerId"
      :answers="currentChallenge.answers"
      :statistic="currentChallenge.statistic"
    /> -->
    <ModalActiveRound v-if="round" :round="round" :game="game" :player="player" />
  </div>
</template>
<script lang="ts">
import { computed, defineComponent, onMounted, reactive } from '@vue/composition-api'
import { parseCookie } from '../../lib/cookie'
import { update } from '../../lib/CSE'
import { generateHash } from '../../lib/hashing'
import { GameLength, Update, Variant } from '~/types/game'
import { useGameStore } from '~/store/game'

export default defineComponent({
  async asyncData({ params, res, req, query, pinia, error }) {
    const gameStore = useGameStore(pinia)

    try {
      const cookies = parseCookie(String(req?.headers?.cookie))
      const playerId = cookies.player || generateHash()
      const { gameId } = params

      await gameStore.connect({
        gameId,
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

      if (res) {
        res.setHeader('set-cookie', `player=${playerId}; httpOnly; Max-Age=${60 * 60 * 24 * 7}`)
      }
    } catch (e) {
      error({ message: 'Failed to connect', statusCode: 500 })
    }
  },
  setup(_, ctx) {
    const gameStore = useGameStore()

    const game = computed(() => gameStore.game)
    const player = computed(() => gameStore.getCurrentPlayer)
    const phase = computed(() => gameStore.getCurrentPhase)
    const round = computed(() => gameStore.getCurrentRound)

    const state = reactive<{ waving: { [playerId: string]: boolean } }>({
      waving: {},
    })

    onMounted(() => {
      if (!game.value) {
        throw new ReferenceError('Game not instantiated')
      }

      if (!player.value) {
        throw new ReferenceError('Player not instantiated')
      }

      const url = `${location.protocol}//${location.host}/room/${game.value.id}`
      history.replaceState(null, game.value.id, url)

      const source = new EventSource(`/api/feed/${game.value.id}/${player.value.id}`)
      source.addEventListener('message', message => {
        try {
          const update: Update = JSON.parse(message.data)
          switch (update.event) {
            case 'name-set':
            case 'color-set':
            case 'new-round':
            case 'game-updated':
            case 'player-joined':
              gameStore.game = update.game
              break
            case 'player-waved':
              state.waving[update.playerId] = true
              break
            case 'player-kicked':
              ctx.root.$router.push('/?kicked=1')
              break
            default:
              console.warn('Unhandled event', update)
              break
          }
        } catch (e) {
          console.error(e)
        }
      })

      // Notify other players that we have joined
      source.addEventListener('open', () => {
        update({
          event: 'join-game',
          gameId: game.value.id,
          playerId: player.value?.id || '',
        })
      })
    })

    return {
      game,
      phase,
      round,
      state,
      player,
    }
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
