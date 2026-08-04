<template>
  <div class="board3d">
    <TresCanvas
      v-if="webglAvailable && resolvedGame && resolvedPlayerId"
      clear-color="#fffaf5"
      :dpr="isPhone ? [1, 1.5] : [1, 2]"
      power-preference="high-performance"
      antialias
    >
      <TopoScene :game="resolvedGame" :player-id="resolvedPlayerId" @ready="onSceneReady" />
    </TresCanvas>
    <BoardFallback v-else-if="resolvedGame" :game="resolvedGame" />

    <SpectateHud v-if="resolvedGame" :game="resolvedGame" />

    <div v-if="blockedTurn && !gameStore.board.spectateTargetId" class="pane blocked-banner">
      <strong>Blocked!</strong>
      <span>
        The gate held —
        {{ blockedTurn.forfeitedSteps === 1 ? '1 step' : `${blockedTurn.forfeitedSteps} steps` }}
        forfeited.
      </span>
    </div>

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
import { useIsPhone } from '~~/lib/use-viewport'
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

const { game: storeGame, gameStore, currentRound } = useClientEvents()

const resolvedGame = computed(() => props.game ?? storeGame.value)
// Falls back to the SEAT: today every booth path passes player-id explicitly
// (SpectateBoard), but if a board phase ever reaches the mount unpropped, the
// scene must key off the followed seat, not the watcher's pawnless id
const resolvedPlayerId = computed(() => props.playerId ?? gameStore.seatId)

// A failed gate settles the walk with no hop to see — the banner says what the
// knock animation alone can't: the gate held, and the banked steps are gone.
// Server truth from the round record; vanishes when the next round flips the
// phase off movement-summary.
const blockedTurn = computed(() => {
  const game = resolvedGame.value
  const playerId = resolvedPlayerId.value
  if (!game || !playerId || game.players[playerId]?.phase !== 'movement-summary') return undefined
  return currentRound.value?.round.playerTurns[playerId]?.blocked
})

// Phones cap device-pixel-ratio at 1.5 — a full-retina 3x canvas costs more
// GPU than the small screen can show.
const isPhone = useIsPhone()

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

/* Same berth as the spectate HUD (they never show together — the banner is
   the own pawn's, the HUD a watched one's). */
.blocked-banner {
  position: absolute;
  left: 50%;
  bottom: calc(1rem + var(--safe-bottom));
  transform: translateX(-50%);
  z-index: 3;
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  padding: 0.8rem 1.2rem;
  max-width: min(36rem, calc(100vw - 2rem));
  white-space: nowrap;
  animation: chip-in 0.3s ease-out;
}

.blocked-banner strong {
  color: var(--hior-ange);
}
</style>
