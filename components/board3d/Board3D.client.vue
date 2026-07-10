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

    <Interstitial
      v-if="showMoveInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1}`"
      title="On the move!"
      stakes="Pawns advance one tile per point earned — challenges block the path."
      :hold-for="2.4"
      @done="onInterstitialDone"
    />
  </div>
</template>
<script lang="ts" setup>
import { TresCanvas } from '@tresjs/core'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { useClientEvents } from '~~/lib/events/client-side'
import type { Game } from '~~/types/game.types'
import BoardFallback from './BoardFallback.vue'
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

const {
  game: storeGame,
  playerId: storePlayerId,
  gameStore,
  update,
  currentRound,
} = useClientEvents()

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

const timers: ReturnType<typeof setTimeout>[] = []
const requestMovementIfPending = () => {
  if (!gameStore.pendingMovementRequest) return
  gameStore.pendingMovementRequest = false
  update({ event: 'enter-movement-phase' })
}

const maybeRequestMovement = () => {
  if (webglAvailable.value && !sceneReady.value) return
  if (showMoveInterstitial.value) return
  requestMovementIfPending()
}

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
  // Safety net: never leave the game stalled if the scene fails to report ready
  timers.push(setTimeout(requestMovementIfPending, 9000))
})

onUnmounted(() => timers.forEach(timer => clearTimeout(timer)))
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
