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
      <main v-else key="loading" class="map-wrapper">
        <span>Loading...</span>
      </main>
    </Transition>
  </div>
</template>
<script lang="ts" setup>
import type { Component } from 'vue'
import ModalMoving from '~/components/modal/ModalMoving.vue'
import ViewFinalChallenge from '~/components/view/ViewFinalChallenge.vue'
import ViewGroupChallenge from '~/components/view/ViewGroupChallenge.vue'
import ViewGroupScores from '~/components/view/ViewGroupScores.vue'
import ViewIndividualChallenge from '~/components/view/ViewIndividualChallenge.vue'
import ViewPlayerConfiguration from '~/components/view/ViewPlayerConfiguration.vue'
import ViewTraversalChallenge from '~/components/view/ViewTraversalChallenge.vue'
import ViewTutorial from '~/components/view/ViewTutorial.vue'
import ViewVictory from '~/components/view/ViewVictory.vue'
import { useClientEvents } from '~~/lib/events/client-side'
import { usePhaseTransition, type ViewKind } from '~~/lib/phase-transitions'
import { isTraversalChallenge } from '~~/types/challenges/traversal-challenge.type'
import { gameVariants, isValidGameVariant } from '~~/types/game.types'

const { update, game, player, currentRound } = useClientEvents()

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
  if (!game.value || !player.value) return undefined

  if (!game.value.started) {
    return { component: ViewPlayerConfiguration, kind: 'lobby', key: 'lobby' }
  }

  if (player.value.phase === 'tutorial') {
    return { component: ViewTutorial, kind: 'card', key: 'tutorial' }
  }

  if (!currentRound.value?.round) return undefined

  switch (player.value.phase) {
    case 'group-challenge':
      // The shared round is either a ranking or a Travle-style traversal
      return isTraversalChallenge(currentRound.value.round.groupChallenge)
        ? { component: ViewTraversalChallenge, kind: 'challenge', key: 'traversal-challenge' }
        : { component: ViewGroupChallenge, kind: 'challenge', key: 'group-challenge' }
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

onMounted(() => {
  const { variant } = route.query

  update({
    event: 'join',
    variant: isValidGameVariant(variant) ? variant : gameVariants[0],
  })
})
</script>
<style scoped>
.main-board {
  height: 100vh;
  max-width: 100%;
  overflow: hidden;
  position: relative;
  pointer-events: none;
}
</style>
