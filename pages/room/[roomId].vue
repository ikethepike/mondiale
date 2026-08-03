<template>
  <div class="main-board">
    <Transition
      mode="out-in"
      :css="false"
      appear
      @before-enter="onBeforeEnter"
      @enter="onEnter"
      @leave="onLeave"
      @enter-cancelled="onEnterCancelled"
    >
      <component :is="presentedView.component" v-if="presentedView" :key="presentedView.key" />
      <LoadingRoom v-else key="loading" />
    </Transition>

    <!-- Outside the view swap: a player reaching or clearing the gauntlet is
         announced to the room whatever anyone happens to be looking at. -->
    <Interstitial
      v-if="announcement"
      :kicker="announcement.kicker"
      :title="announcement.title"
      :stakes="announcement.stakes"
      :tone="announcement.tone"
      @done="dismiss"
    />
  </div>
</template>
<script lang="ts" setup>
import type { Component } from 'vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import LoadingRoom from '~/components/feedback/LoadingRoom.vue'
import { resolveChallengeView } from '~/components/view/dispatch'
import ViewGameAlreadyStarted from '~/components/view/ViewGameAlreadyStarted.vue'
import ViewPlayerConfiguration from '~/components/view/ViewPlayerConfiguration.vue'
import ViewSpectate from '~/components/view/ViewSpectate.vue'
import ViewTutorial from '~/components/view/ViewTutorial.vue'
import ViewWaitingRoom from '~/components/view/ViewWaitingRoom.vue'
import { useClientEvents } from '~~/lib/events/client-side'
import { useGameAnnouncements } from '~~/lib/use-game-announcements'
import { useJoinRoom } from '~~/lib/use-join-room'
import { usePhaseTransition, type ViewKind } from '~~/lib/phase-transitions'

// ROUTING READS `self`, NEVER `player`: `player` resolves to the booth's
// followed seat, so a latecomer watcher HAS a `player` while following — a
// routing branch on it would drop them into the raw phase switch instead of
// the booth. `self` is the raw own record.
const { game, self, currentRound, gameStore } = useClientEvents()

// Mounted here, above the view switch: inside a view it would remount on every
// phase change, lose the previous-phase map, and announce the same moment again.
const { announcement, dismiss } = useGameAnnouncements()

interface ActiveView {
  component: Component
  kind: ViewKind
  /**
   * Transition identity: views sharing a key never re-transition between
   * each other — 'moving' and 'movement-summary' both map to the board.
   */
  key: string
}

const activeView = computed<ActiveView | undefined>(() => {
  // Terminal: the server refused the join and closed the socket. Checked first
  // — no later state can arrive to move us off this screen.
  if (gameStore.rejected) {
    return { component: ViewGameAlreadyStarted, kind: 'card', key: 'game-already-started' }
  }

  if (!game.value) return undefined

  // No player record in a started game: a watcher. Either admitted through
  // the spectator door, or ejected mid-watch (door closed) — the same dead
  // end a closed-door latecomer gets.
  if (game.value.started && !self.value) {
    return gameStore.isSpectator
      ? { component: ViewSpectate, kind: 'score', key: 'spectate' }
      : { component: ViewGameAlreadyStarted, kind: 'card', key: 'game-already-started' }
  }

  // Pre-start watcher: admitted through the door before the race — the
  // balcony. The else arm is the mid-wait ejection (host sealed the room):
  // record gone, same card a closed-door latecomer gets. A normal joining
  // player never lands here — their first snapshot carries their own record.
  if (!game.value.started && !self.value) {
    return gameStore.isWaitingSpectator
      ? { component: ViewWaitingRoom, kind: 'card', key: 'waiting-room' }
      : { component: ViewGameAlreadyStarted, kind: 'card', key: 'game-already-started' }
  }

  if (!self.value) return undefined

  if (!game.value.started) {
    return { component: ViewPlayerConfiguration, kind: 'lobby', key: 'lobby' }
  }

  if (self.value.phase === 'tutorial') {
    return { component: ViewTutorial, kind: 'card', key: 'tutorial' }
  }

  // A finisher can flip to watching the ongoing race and back — the flag is
  // purely client-side, they already receive every broadcast. Checked BEFORE
  // the round guard: the booth must survive the between-rounds window where
  // `currentRound` is briefly empty (it used to blank the finisher's screen).
  if (self.value.phase === 'victory' && gameStore.spectating) {
    return { component: ViewSpectate, kind: 'score', key: 'spectate' }
  }

  if (!currentRound.value?.round) return undefined

  return resolveChallengeView(self.value.phase, currentRound.value.round)
})

/**
 * What's actually rendered. Usually tracks activeView instantly, but a
 * board → challenge flip is held briefly so the final hop, the knock and the
 * alert ripple finish on the board before the challenge takes over.
 */
const presentedView = shallowRef<ActiveView | undefined>(activeView.value)
const BOARD_TO_CHALLENGE_HOLD_MS = 1600
let holdTimer: ReturnType<typeof setTimeout> | undefined

watch(activeView, (next, previous) => {
  if (holdTimer) {
    clearTimeout(holdTimer)
    holdTimer = undefined
  }

  const fromBoard = previous?.key === 'board' && presentedView.value?.key === 'board'
  const toChallenge = next?.key === 'individual-challenge' || next?.key === 'final-challenge'

  if (fromBoard && toChallenge) {
    holdTimer = setTimeout(() => {
      presentedView.value = activeView.value
    }, BOARD_TO_CHALLENGE_HOLD_MS)
    return
  }

  presentedView.value = next
})

onUnmounted(() => {
  if (holdTimer) clearTimeout(holdTimer)
})

const { onBeforeEnter, onEnter, onLeave, onEnterCancelled } = usePhaseTransition(
  () => presentedView.value?.kind ?? 'card'
)

const joinRoom = useJoinRoom()

onMounted(() => {
  joinRoom()

  // Socket.IO drops a socket's room membership when it reconnects (a server
  // restart, network blip, laptop sleep). Without re-joining, the socket is
  // silently out of the game room and misses every broadcast — the classic
  // "one client stuck while the other advances" desync. `join` is idempotent
  // server-side, so re-firing it on every (re)connect is safe and re-adds us
  // to the room. `.io.on('reconnect')` fires only on RE-connects, not the
  // first — the initial join is handled by onMounted above.
  const socket = gameStore.socket
  socket?.io.on('reconnect', joinRoom)
  onUnmounted(() => {
    socket?.io.off('reconnect', joinRoom)
    // Watch intent must not leak into the next room this client opens
    gameStore.joinAsSpectator = false
  })
})
</script>
<style scoped>
.main-board {
  height: var(--viewport-height);
  max-width: 100%;
  overflow: hidden;
  position: relative;
  pointer-events: none;
}
</style>
