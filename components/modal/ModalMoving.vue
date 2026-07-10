<template>
  <ModalWrapper class="board-wrapper">
    <BoardFallback v-if="boardFailed && game" :game="game" />
    <LazyBoard3D v-else />
  </ModalWrapper>
</template>
<script lang="ts" setup>
import BoardFallback from '~/components/board3d/BoardFallback.vue'
import { useClientEvents } from '~~/lib/events/client-side'
import { useMovementRequest } from '~~/lib/use-movement-request'

const { game } = useClientEvents()
const { requestMovementIfPending } = useMovementRequest()

// The 3D board is a lazy chunk: a deploy invalidates its hashed URL and the
// async loader then fails for good (this froze a live room in group-scores).
// The movement request must not die with it — swap in the 2D board and send
// the request immediately; the server paces the walk either way.
const boardFailed = ref(false)
onErrorCaptured((error, _instance, info) => {
  if (!info.includes('async component loader')) return
  console.error('Board chunk failed to load, using fallback', error)
  boardFailed.value = true
  requestMovementIfPending()
  return false
})

// Safety net: whatever happens inside the board (scene never reports ready,
// interstitial wedged), the walk must start. Lives here — not in the board —
// so it exists even when the board doesn't.
let safetyTimer: ReturnType<typeof setTimeout> | undefined
onMounted(() => {
  safetyTimer = setTimeout(requestMovementIfPending, 9000)
})
onUnmounted(() => clearTimeout(safetyTimer))
</script>
<style lang="scss" scoped>
.board-wrapper {
  overflow: hidden;
}
</style>
