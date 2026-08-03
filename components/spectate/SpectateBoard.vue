<template>
  <div class="spectate-board">
    <BoardFallback v-if="boardFailed && game" :game="game" />
    <!-- The followed racer plays the "own pawn" role: the scene's entry
         framing, follow-cam and path preview all key off playerId. -->
    <LazyBoard3D v-else :player-id="followedId" />
  </div>
</template>
<script lang="ts" setup>
import BoardFallback from '~/components/board3d/BoardFallback.vue'
import { useClientEvents } from '~~/lib/events/client-side'

const props = defineProps<{ followedId: string }>()

const { game, gameStore } = useClientEvents()

// Switching who's followed flies the camera — TopoScene watches this id.
// `immediate` matters: without it the FIRST board stage never set the
// target, so the scene had nobody to follow until the next director cut.
watch(
  () => props.followedId,
  id => {
    gameStore.board.spectateTargetId = id
  },
  { immediate: true }
)

// Same guard as ModalMoving: a deploy invalidates the lazy chunk's URL and
// the loader then fails for good — swap in the 2D board.
const boardFailed = ref(false)
onErrorCaptured((error, _instance, info) => {
  if (!info.includes('async component loader')) return
  console.error('Board chunk failed to load, using fallback', error)
  boardFailed.value = true
  return false
})
</script>
<style lang="scss" scoped>
.spectate-board {
  position: absolute;
  inset: 0;
  pointer-events: auto;
}
</style>
