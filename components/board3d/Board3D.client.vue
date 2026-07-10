<template>
  <div class="board3d">
    <TresCanvas
      v-if="webglAvailable && resolvedGame && resolvedPlayerId"
      clear-color="#fffaf5"
      :dpr="[1, 2]"
      power-preference="high-performance"
      antialias
    >
      <TopoScene :game="resolvedGame" :player-id="resolvedPlayerId" @ready="onSceneReady" />
    </TresCanvas>
    <BoardFallback v-else-if="resolvedGame" :game="resolvedGame" />

    <SpectateHud v-if="resolvedGame" :game="resolvedGame" />

    <Interstitial
      v-if="showMoveInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1}`"
      title="On the move!"
      :stakes="interstitialStakes"
      :hold-for="2.4"
      @done="onInterstitialDone"
    />
  </div>
</template>
<script lang="ts" setup>
import { TresCanvas } from '@tresjs/core'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { useClientEvents } from '~~/lib/events/client-side'
import { useMovementRequest } from '~~/lib/use-movement-request'
import type { Game } from '~~/types/game.types'
import BoardFallback from './BoardFallback.vue'
import SpectateHud from './SpectateHud.vue'
import TopoScene from './TopoScene.vue'

// Client-only (.client suffix): three + tres load only when the board mounts.
const props = defineProps({
  // Optional overrides so the /test harness can drive a mock game;
  // in the live app both resolve from the store.
  game: {
    type: Object as PropType<Game>,
    default: undefined,
  },
  playerId: {
    type: String,
    default: undefined,
  },
})

const { game: storeGame, playerId: storePlayerId, gameStore, currentRound } = useClientEvents()

const resolvedGame = computed(() => props.game ?? storeGame.value)
const resolvedPlayerId = computed(() => props.playerId ?? storePlayerId.value)

const webglAvailable = ref(true)
onBeforeMount(() => {
  try {
    const canvas = document.createElement('canvas')
    webglAvailable.value = !!(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    webglAvailable.value = false
  }
})

// Closing the group scores defers 'enter-movement-phase' to us: an "On the
// move!" interstitial plays over the board, and the server's 500ms step
// ticks only start once the scene is on screen AND the interstitial is done —
// every step lands as a visible hop. (The post-challenge movement phase is
// re-entered by the server itself and never sets the flag.)
const sceneReady = ref(false)
const showMoveInterstitial = ref(gameStore.pendingMovementRequest)

// Name the player's actual conversion — "7 points → 7 tiles" lands better than
// the abstract rule. Falls back to the rule when the score isn't known yet.
const interstitialStakes = computed(() => {
  const scored = currentRound.value?.round.playerTurns[resolvedPlayerId.value]?.points.scored
  if (scored === undefined) {
    return 'Pawns advance one tile per point earned — challenges block the path.'
  }
  if (scored === 0) return 'No points this round — your pawn stays put.'
  const tiles = scored === 1 ? '1 tile' : `${scored} tiles`
  return `You scored ${scored} — your pawn walks ${tiles}. Challenges block the path.`
})

// Delivery (ack, retry, flag clearing) lives in the shared composable —
// ModalMoving holds the safety net, so the request survives this chunk
// failing to load entirely. This component only handles pacing.
const { requestMovementIfPending } = useMovementRequest()

const maybeRequestMovement = () => {
  if (webglAvailable.value && !sceneReady.value) return
  if (showMoveInterstitial.value) return
  requestMovementIfPending()
}

// A request flagged while the board is already mounted (a view flip raced a
// server snapshot) must still be consumed — mount-time reads alone miss it.
watch(
  () => gameStore.pendingMovementRequest,
  pending => {
    if (pending) maybeRequestMovement()
  }
)

const onSceneReady = () => {
  sceneReady.value = true
  maybeRequestMovement()
}

const onInterstitialDone = () => {
  showMoveInterstitial.value = false
  maybeRequestMovement()
}

onMounted(() => {
  if (!webglAvailable.value) maybeRequestMovement()
})
</script>
<style scoped>
.board3d {
  width: 100%;
  height: 100%;
  min-height: var(--viewport-height);
  pointer-events: auto;
  touch-action: none;
}
</style>
