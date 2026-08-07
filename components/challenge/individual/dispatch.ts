import type { Component } from 'vue'
import CapitalReveal from '~/components/challenge/CapitalReveal.vue'
import TrajectoryReveal from '~/components/challenge/TrajectoryReveal.vue'
import DuelReveal from '~/components/feedback/DuelReveal.vue'
import ErrataReveal from '~/components/feedback/ErrataReveal.vue'
import FlagMeaningGateReveal from '~/components/feedback/FlagMeaningGateReveal.vue'
import LandmarkReveal from '~/components/feedback/LandmarkReveal.vue'
import LeaderReveal from '~/components/feedback/LeaderReveal.vue'
import RosettaReveal from '~/components/feedback/RosettaReveal.vue'
import TrendDuelReveal from '~/components/feedback/TrendDuelReveal.vue'
import GateBorderDetective from './GateBorderDetective.vue'
import GateErrata from './GateErrata.vue'
import GateFind from './GateFind.vue'
import GateFlagPick from './GateFlagPick.vue'
import GateHigherLower from './GateHigherLower.vue'
import GateLeaderPick from './GateLeaderPick.vue'
import GateMoneyMatch from './GateMoneyMatch.vue'
import GateOddOneOut from './GateOddOneOut.vue'
import GateOutlineReveal from './GateOutlineReveal.vue'
import GatePhotoPick from './GatePhotoPick.vue'
import GateRosetta from './GateRosetta.vue'
import GateTrajectoryMatch from './GateTrajectoryMatch.vue'
import GateTrendDuel from './GateTrendDuel.vue'
import GateZoomOut from './GateZoomOut.vue'
import { PAIR_COLORS } from './pair-colors'
import { LANDMARKS } from '~~/data/landmarks.gen'
import { accessorTopicLabel } from '~~/lib/challenges'
import type {
  DuelOutcome,
  IndividualChallenge,
  IndividualChallengeVariant,
  TrendDuelOutcome,
} from '~~/types/challenges/individual-challenge.type'
import type { ISOCountryCode } from '~~/types/geography.types'

/** Everything a reveal can be built from, once the gate has resolved. */
export interface GateRevealContext {
  challenge: IndividualChallenge
  submittedISOCode?: ISOCountryCode
  duelOutcomes: DuelOutcome[]
  trendDuelOutcomes: TrendDuelOutcome[]
}

export interface GateView {
  /** The question. Mounted under `gateSeq` so a fresh gate remounts it and
   *  every clock, hint and counter inside resets by construction. */
  component: Component
  /** Rendered inside ChallengeResult. A variant with no bespoke card falls
   *  back to the shell's `gateLesson` line. */
  reveal?: Component
  /** The reveal's props. Lives here rather than in the shell so a variant's
   *  question and its lesson are declared in one place. */
  revealProps?: (context: GateRevealContext) => Record<string, unknown>
  /** Teleports a typed console into the shell footer. Declared here because
   *  the SHELL owns the footer: `.suggest-berth` reserves room for a downward
   *  suggestion list, and a variant that never types must not pay for it. */
  typedConsole?: boolean
  /** Teleports a wide-screen subject into the shell's side stage. */
  sideStage?: boolean
}

/**
 * One view per gate variant, the group side's `components/view/dispatch.ts`
 * posture: typed exhaustively over `IndividualChallengeVariant`, so a variant
 * added without a view is a COMPILE error rather than a blank stage.
 *
 * REAL imports on purpose — `resolveComponent` only resolves literal names,
 * and a dynamic name renders inert elements (see REGION_MAP_COMPONENTS).
 *
 * Variants that share a view share a question: flag-pick and flag-twins differ
 * only in how confusable the decoys are, and the three photo gates are one
 * layout with three subjects (the `river-run`/`shared-shores` precedent).
 */
export const GATE_VIEWS: Record<IndividualChallengeVariant, GateView> = {
  find: { component: GateFind, sideStage: true },
  'flag-pick': {
    component: GateFlagPick,
    reveal: FlagMeaningGateReveal,
    revealProps: ({ challenge }) => ({ challenge }),
  },
  'flag-twins': { component: GateFlagPick },
  'border-detective': { component: GateBorderDetective, typedConsole: true },
  'money-match': { component: GateMoneyMatch },
  'zoom-out': { component: GateZoomOut, typedConsole: true },
  'capital-match': {
    component: GatePhotoPick,
    reveal: CapitalReveal,
    revealProps: ({ challenge, submittedISOCode }) => ({
      country: challenge.country,
      pickedCountry: submittedISOCode,
    }),
  },
  'landmark-quiz': {
    component: GatePhotoPick,
    reveal: LandmarkReveal,
    revealProps: ({ challenge }) => {
      const landmark = challenge.landmarkSlug ? LANDMARKS[challenge.landmarkSlug] : undefined
      return landmark ? { landmark } : {}
    },
  },
  'odd-one-out': { component: GateOddOneOut },
  'higher-lower': {
    component: GateHigherLower,
    reveal: DuelReveal,
    revealProps: ({ challenge, duelOutcomes }) => {
      const accessorId = challenge.higherLower?.accessorId
      if (!accessorId || !duelOutcomes.length) return {}
      return {
        outcomes: duelOutcomes,
        accessorId,
        topic: accessorTopicLabel(accessorId),
        colors: PAIR_COLORS,
      }
    },
  },
  'trend-duel': {
    component: GateTrendDuel,
    reveal: TrendDuelReveal,
    revealProps: ({ trendDuelOutcomes }) =>
      trendDuelOutcomes.length ? { outcomes: trendDuelOutcomes } : {},
  },
  'trajectory-match': {
    component: GateTrajectoryMatch,
    reveal: TrajectoryReveal,
    revealProps: ({ challenge, submittedISOCode }) =>
      challenge.trajectory
        ? {
            metric: challenge.trajectory.metric,
            options: challenge.trajectory.options,
            answer: challenge.country,
            picked: submittedISOCode,
          }
        : {},
  },
  'leader-pick': {
    component: GateLeaderPick,
    reveal: LeaderReveal,
    revealProps: ({ challenge }) => ({ country: challenge.country }),
  },
  'outline-reveal': { component: GateOutlineReveal, typedConsole: true },
  'leader-portrait': {
    component: GatePhotoPick,
    reveal: LeaderReveal,
    revealProps: ({ challenge }) => ({ country: challenge.country }),
  },
  errata: {
    component: GateErrata,
    reveal: ErrataReveal,
    // Empty when the payload is missing, so the shell falls through to its
    // lesson line — the landmark gate's contract, and the reason a card with
    // a hole in it never mounts.
    revealProps: ({ challenge }) => (challenge.errata ? { challenge } : {}),
  },
  rosetta: {
    component: GateRosetta,
    typedConsole: true,
    reveal: RosettaReveal,
    revealProps: ({ challenge }) => (challenge.rosetta ? { challenge } : {}),
  },
}

/** A reveal renders only when its props resolved — a landmark gate whose slug
 *  went missing must fall through to the lesson line, not mount a card with a
 *  hole in it. */
export const gateRevealFor = (
  variant: IndividualChallengeVariant,
  context: GateRevealContext
): { component: Component; props: Record<string, unknown> } | undefined => {
  const view = GATE_VIEWS[variant]
  if (!view.reveal) return undefined
  const props = view.revealProps?.(context) ?? {}
  if (view.revealProps && !Object.keys(props).length) return undefined
  return { component: view.reveal, props }
}
