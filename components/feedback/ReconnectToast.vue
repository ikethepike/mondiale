<template>
  <Transition name="reconnect">
    <div v-if="visible" class="reconnect-toast" role="status" aria-live="polite">
      <span class="dot" />
      Connection lost — reconnecting…
    </div>
  </Transition>
</template>
<script lang="ts" setup>
import { useGameStore } from '~~/store/game.store'

// Deploys and network blips drop the socket; socket.io retries on its own and
// the room heals on reconnect (re-join + re-arm). This pill only tells the
// player the freeze is known and being worked on. The grace delay swallows
// sub-second gaps — a blue-green flip or a deliberate re-route (useJoinRoom's
// query change) reconnects faster than the pill can appear.
const SHOW_DELAY_MS = 1200

const gameStore = useGameStore()
const visible = ref(false)
let showTimer: ReturnType<typeof setTimeout> | undefined

// `rejected` is a deliberately closed socket (kick, closed door) — the
// dead-end card explains itself; pulsing "reconnecting…" over it would lie.
watch(
  () => gameStore.disconnected && !!gameStore.game && !gameStore.rejected,
  down => {
    if (showTimer) clearTimeout(showTimer)
    if (down) {
      showTimer = setTimeout(() => {
        visible.value = true
      }, SHOW_DELAY_MS)
    } else {
      showTimer = undefined
      visible.value = false
    }
  },
  { immediate: true }
)

onUnmounted(() => {
  if (showTimer) clearTimeout(showTimer)
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/status-pill' as *;

// The shared status-pill recipe (rules/_status-pill.scss) — one shell with
// the notice toast, so a safe-top or contrast fix reaches both.
.reconnect-toast {
  @include status-pill-anchor;
  @include status-pill;
  z-index: 3000;
}

.dot {
  width: 0.8rem;
  height: 0.8rem;
  border-radius: 50%;
  background: #{ember()};
  animation: reconnect-pulse 1.2s ease-in-out infinite;
}

@keyframes reconnect-pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.4;
    transform: scale(0.7);
  }
}

.reconnect-enter-active,
.reconnect-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}
.reconnect-enter-from,
.reconnect-leave-to {
  opacity: 0;
  transform: translate(-50%, -0.8rem);
}

@media (prefers-reduced-motion: reduce) {
  .dot {
    animation: none;
  }
  .reconnect-enter-from,
  .reconnect-leave-to {
    transform: translateX(-50%);
  }
}
</style>
