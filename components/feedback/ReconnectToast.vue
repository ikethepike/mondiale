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

.reconnect-toast {
  position: fixed;
  top: calc(1rem + var(--safe-top));
  left: 50%;
  transform: translateX(-50%);
  z-index: 3000;
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.7rem 1.4rem;
  font-size: 1.3rem;
  color: #{milk()};
  background: #{ink(0.92)};
  border: 0.1rem solid #{milk(0.25)};
  border-radius: 2rem;
  pointer-events: none;
  white-space: nowrap;
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
