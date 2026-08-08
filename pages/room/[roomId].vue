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
import Interstitial from '~/components/feedback/Interstitial.vue'
import LoadingRoom from '~/components/feedback/LoadingRoom.vue'
import { resolveChallengeView, type ResolvedView } from '~/components/view/dispatch'
import ViewGameAlreadyStarted from '~/components/view/ViewGameAlreadyStarted.vue'
import ViewPlayerConfiguration from '~/components/view/ViewPlayerConfiguration.vue'
import ViewSpectate from '~/components/view/ViewSpectate.vue'
import ViewTutorial from '~/components/view/ViewTutorial.vue'
import ViewWaitingRoom from '~/components/view/ViewWaitingRoom.vue'
import { useClientEvents } from '~~/lib/events/client-side'
import { loadFlags } from '~~/lib/country'
import { useGameAnnouncements } from '~~/lib/use-game-announcements'
import { useJoinRoom } from '~~/lib/use-join-room'
import { usePhaseTransition } from '~~/lib/phase-transitions'
import { BOARD_TO_CHALLENGE_HOLD_MS } from '~~/lib/round-beats'

// ROUTING READS `self`, NEVER `player`: `player` resolves to the booth's
// followed seat, so a latecomer watcher HAS a `player` while following — a
// routing branch on it would drop them into the raw phase switch instead of
// the booth. `self` is the raw own record.
const { game, self, currentRound, gameStore } = useClientEvents()

// Warm the flag artifact the moment anyone lands in a room: chips, gates and
// the flag-palette sketch all read it, and starting the 1.3MB fetch here gives
// it the whole pre-round runway instead of a round's opening seconds.
if (import.meta.client) void loadFlags()

// Mounted here, above the view switch: inside a view it would remount on every
// phase change, lose the previous-phase map, and announce the same moment again.
const { announcement, dismiss } = useGameAnnouncements()

// The dispatch's ResolvedView IS the page's view shape — one home, no drift
type ActiveView = ResolvedView

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

  // Victory outlives the round that produced it: a winner who clears the
  // gauntlet on the LAST round has no `currentRound` to hang off, and the
  // guard below would blank their screen instead of showing the summary.
  // Same reason the booth is checked above — neither ending depends on a
  // live round. The mapping stays in the dispatch table; this only exempts
  // victory from the round guard.
  if (self.value.phase === 'victory') {
    return resolveChallengeView(self.value.phase)
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
let holdTimer: ReturnType<typeof setTimeout> | undefined

watch(activeView, next => {
  // What's ON SCREEN is the stable truth; `previous` flips to the challenge
  // on the first snapshot of a burst even though the board is still shown.
  const fromBoard = presentedView.value?.key === 'board'
  const toChallenge = next?.key === 'individual-challenge' || next?.key === 'final-challenge'

  if (holdTimer) {
    // A hold in flight owns the swap — the timer reads the LIVE activeView
    // when it fires, so mid-hold snapshots that still point at a challenge
    // change nothing. Only a different destination re-decides; clearing on
    // every snapshot let routine broadcast bursts starve the hold and cut
    // the arrival beat short.
    if (fromBoard && toChallenge) return
    clearTimeout(holdTimer)
    holdTimer = undefined
  }

  if (fromBoard && toChallenge) {
    holdTimer = setTimeout(() => {
      holdTimer = undefined
      presentedView.value = activeView.value
    }, BOARD_TO_CHALLENGE_HOLD_MS)
    return
  }

  presentedView.value = next
})

onUnmounted(() => {
  if (holdTimer) clearTimeout(holdTimer)
})

// The persistent stage lives in the layout; the presented view only aims it.
// Keyed on the KEY (snapshots rebuild the view object every evaluation), so
// the booth — whose own key never changes while it drives the stage — is
// never stomped by broadcast bursts. The board→challenge hold above is what
// keeps the stage up through the arrival beat: the key flips only after it.
watch(
  () => presentedView.value?.key,
  key => {
    // The booth writes the stage itself (ViewSpectate); every other key
    // means the board is on exactly when the presented view is the board.
    if (key === 'spectate') return
    gameStore.board.stageActive = key === 'board'
  },
  { immediate: true }
)

// Test instrumentation, armed by `?viewlog=1`: record every presented view
// swap so the e2e transition-grammar assertions can catch a wrong view that
// flashes too briefly for selector polling to ever see.
if (import.meta.client && 'viewlog' in useRoute().query) {
  watch(
    presentedView,
    view => {
      const scope = window as unknown as { __viewLog?: { key: string; at: number }[] }
      const log = (scope.__viewLog ??= [])
      const key = view?.key ?? 'none'
      // Snapshots rebuild the resolved-view object every evaluation; only a
      // KEY change is a real swap (the Transition is keyed the same way).
      if (log[log.length - 1]?.key === key) return
      log.push({ key, at: Date.now() })
    },
    { immediate: true }
  )
}

const { onBeforeEnter, onEnter, onLeave, onEnterCancelled } = usePhaseTransition(
  () => presentedView.value?.kind ?? 'card'
)

const joinRoom = useJoinRoom()

onMounted(() => {
  joinRoom()

  // Socket.IO drops a socket's room membership when it reconnects (a server
  // restart, network blip, laptop sleep). Without re-joining, the socket is
  // silently out of the game room and misses every broadcast — the classic
  // "one client stuck while the other advances" desync — and, since the join
  // is also what re-arms a live round's lost timers (rearmLiveRound), a
  // reconnect that skips it leaves the room wedged on whatever the dead
  // machine's timer owed. Listen at the SOCKET level: the manager's
  // 'reconnect' fires only for socket.io's automatic recovery, and a deploy
  // drain disconnects with 'io server disconnect', which the plugin recovers
  // from with a MANUAL socket.connect() that never emits it — that gap held
  // a room mid-result-beat for two minutes on the PR preview. 'connect'
  // fires on every successful connection; `join` is idempotent server-side
  // and the rearm sweep is debounced, so re-firing is always safe. The
  // initial join is the onMounted call above (the socket usually connected
  // before this page mounted).
  const socket = gameStore.socket
  socket?.on('connect', joinRoom)
  onUnmounted(() => {
    socket?.off('connect', joinRoom)
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
