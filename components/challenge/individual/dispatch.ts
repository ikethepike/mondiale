import type { Component } from 'vue'
import CapitalReveal from '~/components/challenge/CapitalReveal.vue'
import TrajectoryReveal from '~/components/challenge/TrajectoryReveal.vue'
import AtlasReveal from '~/components/feedback/AtlasReveal.vue'
import ChronicleReveal from '~/components/feedback/ChronicleReveal.vue'
import DuelReveal from '~/components/feedback/DuelReveal.vue'
import ErrataReveal from '~/components/feedback/ErrataReveal.vue'
import FarFlungReveal from '~/components/feedback/FarFlungReveal.vue'
import FlagMeaningGateReveal from '~/components/feedback/FlagMeaningGateReveal.vue'
import PlaceReveal from '~/components/feedback/PlaceReveal.vue'
import LeaderReveal from '~/components/feedback/LeaderReveal.vue'
import RosettaReveal from '~/components/feedback/RosettaReveal.vue'
import ScriptoriumReveal from '~/components/feedback/ScriptoriumReveal.vue'
import TrendDuelReveal from '~/components/feedback/TrendDuelReveal.vue'
import GateAtlas from './GateAtlas.vue'
import GateBorderDetective from './GateBorderDetective.vue'
import GateChronicle from './GateChronicle.vue'
import GateErrata from './GateErrata.vue'
import GateFarFlung from './GateFarFlung.vue'
import GateFind from './GateFind.vue'
import GateFlagPick from './GateFlagPick.vue'
import GateHigherLower from './GateHigherLower.vue'
import GateLeaderPick from './GateLeaderPick.vue'
import GateLogoPolitics from './GateLogoPolitics.vue'
import GateMoneyMatch from './GateMoneyMatch.vue'
import GateRulers from '~/components/challenge/individual/GateRulers.vue'
import GateOddOneOut from './GateOddOneOut.vue'
import GateOutlineReveal from './GateOutlineReveal.vue'
import GatePhotoPick from './GatePhotoPick.vue'
import GateRosetta from './GateRosetta.vue'
import GateScriptorium from './GateScriptorium.vue'
import GateTrajectoryMatch from './GateTrajectoryMatch.vue'
import GateTrendDuel from './GateTrendDuel.vue'
import GateZoomOut from './GateZoomOut.vue'
import { PAIR_COLORS } from './pair-colors'
import { PLACES } from '~~/data/places.gen'
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
  atlasChain: ISOCountryCode[]
  /** The chronicle gate's locked-in order (event slugs). */
  chronicleOrder: string[]
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
  /** Lifts ChallengeResult's prose cap so a ledger reveal can lay its cards
   *  out horizontally. The reveal still declares its own width. */
  wideReveal?: boolean
  /** Teleports a typed console into the shell footer. Declared here because
   *  the SHELL owns the footer: `.suggest-berth` reserves room for a downward
   *  suggestion list, and a variant that never types must not pay for it. */
  typedConsole?: boolean
  /** false = the console types with NO dropdown (pure recall), so the footer
   *  skips `.suggest-berth` too — there is no downward list to reserve for. */
  suggestions?: boolean
  /** With `suggestions: false`: easy mode alone gets the dropdown back (from
   *  the third typed character), so the footer re-earns its berth there. */
  easySuggestions?: boolean
  /** Teleports a wide-screen subject into the shell's side stage. */
  sideStage?: boolean
  /** Steps the prompt down a notch so the gate's own stage gets the room
   *  (ChallengePrompt's `compact`). Declared here because the SHELL renders
   *  the header — a gate whose board is the round wants it; a gate whose
   *  question IS the round does not. */
  compactPrompt?: boolean
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
    reveal: PlaceReveal,
    revealProps: ({ challenge }) => {
      const place = challenge.landmarkSlug ? PLACES[challenge.landmarkSlug] : undefined
      return place ? { place } : {}
    },
  },
  // The option table fills the column on a phone — the prompt names the
  // shared trait and asks for the odd one, and the cards are the round.
  'odd-one-out': { component: GateOddOneOut, compactPrompt: true },
  rulers: { component: GateRulers },
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
    wideReveal: true,
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
  // No bespoke reveal: the answer is a country, which the shared flag verdict
  // already names, and `gateLesson` supplies the party behind the logo.
  'logo-politics': { component: GateLogoPolitics },
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
  atlas: {
    component: GateAtlas,
    typedConsole: true,
    suggestions: false,
    easySuggestions: true,
    reveal: AtlasReveal,
    wideReveal: true,
    revealProps: ({ challenge, atlasChain }) =>
      challenge.atlas ? { challenge, chain: atlasChain } : {},
  },
  scriptorium: {
    component: GateScriptorium,
    typedConsole: true,
    reveal: ScriptoriumReveal,
    wideReveal: true,
    revealProps: ({ challenge, submittedISOCode }) =>
      challenge.scriptorium ? { challenge, submitted: submittedISOCode } : {},
  },
  chronicle: {
    component: GateChronicle,
    // The board being assembled is the round; "Drag the chapters into place"
    // is a caption on it.
    compactPrompt: true,
    reveal: ChronicleReveal,
    wideReveal: true,
    revealProps: ({ challenge, chronicleOrder }) =>
      challenge.chronicle ? { challenge, order: chronicleOrder } : {},
  },
  'far-flung': {
    component: GateFarFlung,
    // Typed on hard; a dealt option table means a card console instead, and
    // the shell skips the footer for it (see the options rule there).
    typedConsole: true,
    reveal: FarFlungReveal,
    revealProps: ({ challenge, submittedISOCode }) =>
      challenge.farFlung ? { challenge, submitted: submittedISOCode } : {},
  },
}

/** A reveal renders only when its props resolved — a landmark gate whose slug
 *  went missing must fall through to the lesson line, not mount a card with a
 *  hole in it. */
export const gateRevealFor = (
  variant: IndividualChallengeVariant,
  context: GateRevealContext
): { component: Component; props: Record<string, unknown>; wide: boolean } | undefined => {
  const view = GATE_VIEWS[variant]
  if (!view.reveal) return undefined
  const props = view.revealProps?.(context) ?? {}
  if (view.revealProps && !Object.keys(props).length) return undefined
  return { component: view.reveal, props, wide: !!view.wideReveal }
}
