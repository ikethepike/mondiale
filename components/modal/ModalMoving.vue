<template>
  <ModalWrapper class="board-wrapper">
    <BoardFallback v-if="boardFailed && game" :game="game" />
    <LazyBoard3D v-else />
  </ModalWrapper>
</template>
<script lang="ts" setup>
import BoardFallback from '~/components/board3d/BoardFallback.vue'
import { useClientEvents } from '~~/lib/events/client-side'

const { game } = useClientEvents()

// The 3D board is a lazy chunk: a deploy invalidates its hashed URL and the
// async loader then fails for good (this froze a live room in group-scores).
// Swap in the 2D board; the server paces the walk regardless.
const boardFailed = ref(false)
onErrorCaptured((error, _instance, info) => {
  if (!info.includes('async component loader')) return
  console.error('Board chunk failed to load, using fallback', error)
  boardFailed.value = true
  return false
})
</script>
<style lang="scss" scoped>
.board-wrapper {
  overflow: hidden;
}
</style>
