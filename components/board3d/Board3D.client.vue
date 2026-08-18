<template>
  <div class="board3d">
    <TresCanvas
      v-if="resolvedGame && resolvedPlayerId"
      clear-color="#fffaf5"
      :dpr="[1, 2]"
      power-preference="high-performance"
      antialias
    >
      <RenderLoopGate :active="active" @ready="onFirstFrame" />
      <TopoScene :game="resolvedGame" :player-id="resolvedPlayerId" :active="active" />
    </TresCanvas>
  </div>
</template>
<script lang="ts" setup>
import { TresCanvas } from '@tresjs/core'
import { installTimerVisibilityGuard } from '~~/lib/board3d/timer-guard'
import { useClientEvents } from '~~/lib/events/client-side'
import type { Game } from '~~/types/game.types'
import RenderLoopGate from './RenderLoopGate.vue'
import TopoScene from './TopoScene.vue'

// Client-only (.client suffix): three + tres load only when the board mounts.
// Purely the canvas — BoardStage owns the lifecycle (probe, failure,
// remount), BoardOverlay owns everything drawn over the board.
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
  // Render-loop gate: false parks the GPU while the stage is hidden.
  active: {
    type: Boolean,
    default: true,
  },
})

// Installed before TresCanvas mounts, because the leak happens the moment its
// renderer connects three's Timer. Idempotent and torn down with the board.
const uninstallTimerGuard = installTimerVisibilityGuard()
onUnmounted(uninstallTimerGuard)

const { game: storeGame, gameStore } = useClientEvents()

const resolvedGame = computed(() => props.game ?? storeGame.value)
const resolvedPlayerId = computed(() => props.playerId ?? gameStore.seatId)

// DPR capped at 2 everywhere: a 3x canvas is 2.25× the pixels for sharpness
// the eye can't find in this ink-line look, while 1.5 (the old phone cap)
// visibly blurred the outlines. Measured 2026-08: the full landscape holds
// the frame cap with wide margin even at phone size under 6× CPU throttle.

// The stage's real readiness signal: the first frame actually drawn (mount
// completion used to stand in for this and lied by the whole asset build).
const onFirstFrame = () => {
  gameStore.board.stageReady = true
}
</script>
<style scoped>
.board3d {
  width: 100%;
  height: 100%;
  min-height: var(--viewport-height);
  pointer-events: auto;
  touch-action: none;

  // The CANVAS is what fingers actually land on, and `touch-action` does not
  // inherit — so the orbit/pinch gestures need it declared here too, or the
  // reset's `manipulation` claims them and the rig stops turning under a drag.
  canvas {
    touch-action: none;
  }
}
</style>
