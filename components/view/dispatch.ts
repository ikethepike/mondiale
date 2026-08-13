import type { Component } from 'vue'
import BoardOverlay from '~/components/board3d/BoardOverlay.vue'
import ViewAnthemBuzz from '~/components/view/ViewAnthemBuzz.vue'
import ViewAtlas from '~/components/view/ViewAtlas.vue'
import ViewBorderChain from '~/components/view/ViewBorderChain.vue'
import ViewCapitalGuess from '~/components/view/ViewCapitalGuess.vue'
import ViewCleanSweep from '~/components/view/ViewCleanSweep.vue'
import ViewComposition from '~/components/view/ViewComposition.vue'
import ViewEmpire from '~/components/view/ViewEmpire.vue'
import ViewFinalChallenge from '~/components/view/ViewFinalChallenge.vue'
import ViewFlagPalette from '~/components/view/ViewFlagPalette.vue'
import ViewFlashpoint from '~/components/view/ViewFlashpoint.vue'
import ViewGhostState from '~/components/view/ViewGhostState.vue'
import ViewGroupChallenge from '~/components/view/ViewGroupChallenge.vue'
import ViewGroupScores from '~/components/view/ViewGroupScores.vue'
import ViewHeritageHunt from '~/components/view/ViewHeritageHunt.vue'
import ViewHotCold from '~/components/view/ViewHotCold.vue'
import ViewIndividualChallenge from '~/components/view/ViewIndividualChallenge.vue'
import ViewManhunt from '~/components/view/ViewManhunt.vue'
import ViewMotherTongue from '~/components/view/ViewMotherTongue.vue'
import ViewNameThatWater from '~/components/view/ViewNameThatWater.vue'
import ViewNeighbourBlitz from '~/components/view/ViewNeighbourBlitz.vue'
import ViewNoMansLand from '~/components/view/ViewNoMansLand.vue'
import ViewPinLandmark from '~/components/view/ViewPinLandmark.vue'
import ViewSilhouette from '~/components/view/ViewSilhouette.vue'
import ViewSketch from '~/components/view/ViewSketch.vue'
import ViewStarChart from '~/components/view/ViewStarChart.vue'
import ViewGovernment from '~/components/view/ViewGovernment.vue'
import ViewTerraIncognita from '~/components/view/ViewTerraIncognita.vue'
import ViewStatDetective from '~/components/view/ViewStatDetective.vue'
import ViewTimeline from '~/components/view/ViewTimeline.vue'
import ViewTongueBuzz from '~/components/view/ViewTongueBuzz.vue'
import ViewTraversalChallenge from '~/components/view/ViewTraversalChallenge.vue'
import ViewTrendRace from '~/components/view/ViewTrendRace.vue'
import ViewTwoTruths from '~/components/view/ViewTwoTruths.vue'
import ViewUniqueOrBust from '~/components/view/ViewUniqueOrBust.vue'
import ViewVictory from '~/components/view/ViewVictory.vue'
import ViewWaterBlitz from '~/components/view/ViewWaterBlitz.vue'
import type { ViewKind } from '~~/lib/phase-transitions'
import { roundChallengeKind } from '~~/types/challenges/traversal-challenge.type'
import type { RoundChallengeKind } from '~~/types/challenges/traversal-challenge.type'
import type { Round } from '~~/types/game.types'
import type { PlayerPhase } from '~~/types/player.type'

export interface ResolvedView {
  component: Component
  kind: ViewKind
  /** Transition identity: views sharing a key never re-transition between
   *  each other — 'moving' and 'movement-summary' both map to the board. */
  key: string
}

/**
 * The shared round comes in several formats — one view per kind. Typed
 * exhaustively over RoundChallengeKind so a new kind that forgets its
 * dispatch entry is a COMPILE error, not a silent runtime fallback. REAL
 * imports on purpose: resolveComponent only resolves literal names, and a
 * dynamic name renders inert elements (see REGION_MAP_COMPONENTS).
 */
const GROUP_VIEWS: Record<RoundChallengeKind, Component> = {
  ranking: ViewGroupChallenge,
  traversal: ViewTraversalChallenge,
  atlas: ViewAtlas,
  'border-chain': ViewBorderChain,
  'heritage-hunt': ViewHeritageHunt,
  'neighbour-blitz': ViewNeighbourBlitz,
  silhouette: ViewSilhouette,
  'anthem-buzz': ViewAnthemBuzz,
  'tongue-buzz': ViewTongueBuzz,
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
  'star-chart': ViewStarChart,
  government: ViewGovernment,
  'terra-incognita': ViewTerraIncognita,
  composition: ViewComposition,
  flashpoint: ViewFlashpoint,
  'ghost-state': ViewGhostState,
  'no-mans-land': ViewNoMansLand,
  'pin-landmark': ViewPinLandmark,
  'trend-race': ViewTrendRace,
  timeline: ViewTimeline,
  empire: ViewEmpire,
  manhunt: ViewManhunt,
  'unique-or-bust': ViewUniqueOrBust,
  'clean-sweep': ViewCleanSweep,
}

/**
 * Phase → view for a seat inside a running game with a live round. The one
 * resolution the room page renders and the booth will mount read-only — a
 * new round kind lands in both surfaces by construction. Pre-game, refusal,
 * spectating and tutorial routing stay with the page: they hang off store
 * state a pure resolver shouldn't reach into.
 */
export const resolveChallengeView = (
  phase: PlayerPhase,
  round?: Round
): ResolvedView | undefined => {
  switch (phase) {
    case 'group-challenge': {
      if (!round) return undefined
      const roundKind = roundChallengeKind(round.groupChallenge)
      return {
        component: GROUP_VIEWS[roundKind] ?? ViewGroupChallenge,
        kind: 'challenge',
        key: `group-${roundKind}`,
      }
    }
    case 'group-scores':
      return { component: ViewGroupScores, kind: 'score', key: 'group-scores' }
    case 'moving':
    case 'movement-summary':
      return { component: BoardOverlay, kind: 'board', key: 'board' }
    case 'individual-challenge':
      return { component: ViewIndividualChallenge, kind: 'challenge', key: 'individual-challenge' }
    case 'final-challenge':
      return { component: ViewFinalChallenge, kind: 'challenge', key: 'final-challenge' }
    case 'victory':
      return { component: ViewVictory, kind: 'victory', key: 'victory' }
    default:
      return undefined
  }
}
