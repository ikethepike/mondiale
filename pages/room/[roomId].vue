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
import ModalMoving from '~/components/modal/ModalMoving.vue'
import ViewBorderChain from '~/components/view/ViewBorderChain.vue'
import ViewFinalChallenge from '~/components/view/ViewFinalChallenge.vue'
import ViewHeritageHunt from '~/components/view/ViewHeritageHunt.vue'
import ViewGameAlreadyStarted from '~/components/view/ViewGameAlreadyStarted.vue'
import ViewGhostState from '~/components/view/ViewGhostState.vue'
import ViewGroupChallenge from '~/components/view/ViewGroupChallenge.vue'
import ViewGroupScores from '~/components/view/ViewGroupScores.vue'
import ViewNoMansLand from '~/components/view/ViewNoMansLand.vue'
import ViewPinLandmark from '~/components/view/ViewPinLandmark.vue'
import ViewIndividualChallenge from '~/components/view/ViewIndividualChallenge.vue'
import ViewHotCold from '~/components/view/ViewHotCold.vue'
import ViewNeighbourBlitz from '~/components/view/ViewNeighbourBlitz.vue'
import ViewPlayerConfiguration from '~/components/view/ViewPlayerConfiguration.vue'
import ViewSilhouette from '~/components/view/ViewSilhouette.vue'
import ViewSketch from '~/components/view/ViewSketch.vue'
import ViewNameThatWater from '~/components/view/ViewNameThatWater.vue'
import ViewStatDetective from '~/components/view/ViewStatDetective.vue'
import ViewTraversalChallenge from '~/components/view/ViewTraversalChallenge.vue'
import ViewTrendRace from '~/components/view/ViewTrendRace.vue'
import ViewTwoTruths from '~/components/view/ViewTwoTruths.vue'
import ViewWaterBlitz from '~/components/view/ViewWaterBlitz.vue'
import ViewMotherTongue from '~/components/view/ViewMotherTongue.vue'
import ViewFlagPalette from '~/components/view/ViewFlagPalette.vue'
import ViewCapitalGuess from '~/components/view/ViewCapitalGuess.vue'
import ViewFlashpoint from '~/components/view/ViewFlashpoint.vue'
import ViewTutorial from '~/components/view/ViewTutorial.vue'
import ViewVictory from '~/components/view/ViewVictory.vue'
import { useClientEvents } from '~~/lib/events/client-side'
import { useGameAnnouncements } from '~~/lib/use-game-announcements'
import { usePhaseTransition, type ViewKind } from '~~/lib/phase-transitions'
import { roundChallengeKind } from '~~/types/challenges/traversal-challenge.type'
import type { RoundChallengeKind } from '~~/types/challenges/traversal-challenge.type'
import { gameVariants, isValidGameVariant } from '~~/types/game.types'

const { update, game, player, currentRound, gameStore } = useClientEvents()

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

  if (!game.value || !player.value) return undefined

  if (!game.value.started) {
    return { component: ViewPlayerConfiguration, kind: 'lobby', key: 'lobby' }
  }

  if (player.value.phase === 'tutorial') {
    return { component: ViewTutorial, kind: 'card', key: 'tutorial' }
  }

  if (!currentRound.value?.round) return undefined

  switch (player.value.phase) {
    case 'group-challenge': {
      // The shared round comes in several formats — one view per kind. Typed
      // exhaustively over RoundChallengeKind so a new kind that forgets its
      // dispatch entry is a COMPILE error, not a silent runtime fallback.
      const groupViews: Record<RoundChallengeKind, Component> = {
        ranking: ViewGroupChallenge,
        traversal: ViewTraversalChallenge,
        'border-chain': ViewBorderChain,
        'heritage-hunt': ViewHeritageHunt,
        'neighbour-blitz': ViewNeighbourBlitz,
        silhouette: ViewSilhouette,
        'hot-cold': ViewHotCold,
        sketch: ViewSketch,
        'stat-detective': ViewStatDetective,
        'two-truths': ViewTwoTruths,
        'river-run': ViewWaterBlitz,
        'shared-shores': ViewWaterBlitz,
        highlands: ViewWaterBlitz,
        'name-that-water': ViewNameThatWater,
        'mother-tongue': ViewMotherTongue,
        'flag-palette': ViewFlagPalette,
        'capital-guess': ViewCapitalGuess,
        flashpoint: ViewFlashpoint,
        'ghost-state': ViewGhostState,
        'no-mans-land': ViewNoMansLand,
        'pin-landmark': ViewPinLandmark,
        'trend-race': ViewTrendRace,
      }
      const roundKind = roundChallengeKind(currentRound.value.round.groupChallenge)
      return {
        component: groupViews[roundKind] ?? ViewGroupChallenge,
        kind: 'challenge',
        key: `group-${roundKind}`,
      }
    }
    case 'group-scores':
      return { component: ViewGroupScores, kind: 'score', key: 'group-scores' }
    case 'moving':
    case 'movement-summary':
      return { component: ModalMoving, kind: 'board', key: 'board' }
    case 'individual-challenge':
      return { component: ViewIndividualChallenge, kind: 'challenge', key: 'individual-challenge' }
    case 'final-challenge':
      return { component: ViewFinalChallenge, kind: 'challenge', key: 'final-challenge' }
    case 'victory':
      return { component: ViewVictory, kind: 'victory', key: 'victory' }
    default:
      return undefined
  }
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

const route = useRoute()

const joinRoom = () => {
  const { variant } = route.query
  update({
    event: 'join',
    variant: isValidGameVariant(variant) ? variant : gameVariants[0],
  })
}

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
  onUnmounted(() => socket?.io.off('reconnect', joinRoom))
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
