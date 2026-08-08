<template>
  <div ref="stageEl" class="board-stage">
    <LazyBoard3D
      v-if="mountBoard && !gameStore.board.stageFailed"
      :key="epoch"
      :active="gameStore.board.stageActive"
      :player-id="stagePlayerId"
    />
  </div>
</template>
<script lang="ts" setup>
import { useClientEvents } from '~~/lib/events/client-side'

// The ONE long-lived home of the 3D board: mounted by the layout when the
// game starts and alive until the room is left, so entering a board phase is
// a cross-fade (the `stage-active` layout class), never a WebGL cold start.
// Owns the stage lifecycle — WebGL probe, deferred chunk mount, chunk-failure
// capture, context-loss remount — while BoardOverlay (the dispatched view)
// owns everything drawn OVER the board.
const { gameStore } = useClientEvents()

// The booth hands the "own pawn" role to the followed seat; racers are their
// own subject. TopoScene's camera cuts ride spectateTargetId directly.
const stagePlayerId = computed(() => gameStore.board.spectateTargetId ?? gameStore.seatId)

onBeforeMount(() => {
  try {
    const canvas = document.createElement('canvas')
    if (!canvas.getContext('webgl2') && !canvas.getContext('webgl')) {
      gameStore.board.stageFailed = true
    }
  } catch {
    gameStore.board.stageFailed = true
  }
})

// The heavy three/tres chunk loads under the first round instead of blocking
// it: mount on idle, or the moment the stage is actually needed.
const mountBoard = ref(false)
onMounted(() => {
  const mount = () => {
    mountBoard.value = true
  }
  if ('requestIdleCallback' in window) window.requestIdleCallback(mount)
  else setTimeout(mount, 1)
})
watch(
  () => gameStore.board.stageActive,
  active => {
    if (active) mountBoard.value = true
  },
  { immediate: true }
)

// A deploy invalidates the lazy chunk's hashed URL and the async loader then
// fails for good (this once froze a live room) — flip to the 2D fallback.
onErrorCaptured((error, _instance, info) => {
  if (!info.includes('async component loader')) return
  console.error('Board chunk failed to load, using fallback', error)
  gameStore.board.stageFailed = true
  return false
})

// A lost WebGL context (GPU reset, phone memory pressure) never comes back on
// its own: remount the whole canvas under a fresh epoch. 'webglcontextlost'
// doesn't bubble, but capture-phase listeners on an ancestor still see it.
const stageEl = ref<HTMLElement>()
const epoch = ref(0)
const onContextLost = () => {
  console.warn('WebGL context lost — remounting the board stage')
  gameStore.board.stageReady = false
  epoch.value++
}
onMounted(() => stageEl.value?.addEventListener('webglcontextlost', onContextLost, true))
onBeforeUnmount(() => {
  stageEl.value?.removeEventListener('webglcontextlost', onContextLost, true)
  // Leaving the room retires the stage — the next game starts cold.
  gameStore.board.stageReady = false
  gameStore.board.stageFailed = false
  gameStore.board.stageActive = false
})
</script>
<style scoped>
.board-stage {
  position: absolute;
  inset: 0;
}
</style>
