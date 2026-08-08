<template>
  <div class="board3d">
    <TresCanvas
      v-if="resolvedGame && resolvedPlayerId"
      clear-color="#fffaf5"
      :dpr="isPhone ? [1, 1.5] : [1, 2]"
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
import { useClientEvents } from '~~/lib/events/client-side'
import { useIsPhone } from '~~/lib/use-viewport'
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

const { game: storeGame, gameStore } = useClientEvents()

const resolvedGame = computed(() => props.game ?? storeGame.value)
const resolvedPlayerId = computed(() => props.playerId ?? gameStore.seatId)

// Phones cap device-pixel-ratio at 1.5 — a full-retina 3x canvas costs more
// GPU than the small screen can show.
const isPhone = useIsPhone()

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
}
</style>
