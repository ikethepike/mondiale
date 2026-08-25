import type { Component } from 'vue'
import DiasporaReveal from '~/components/challenge/DiasporaReveal.vue'
import EndonymReveal from '~/components/challenge/EndonymReveal.vue'
import LanguageReveal from '~/components/challenge/LanguageReveal.vue'
import MadeReveal from '~/components/challenge/MadeReveal.vue'
import MinMaxReveal from '~/components/challenge/MinMaxReveal.vue'
import NocturneReveal from '~/components/challenge/NocturneReveal.vue'
import OddOneOutReveal from '~/components/challenge/OddOneOutReveal.vue'
import SunsetReveal from '~/components/challenge/SunsetReveal.vue'
import TrueSizeReveal from '~/components/challenge/TrueSizeReveal.vue'
import LeaderReveal from '~/components/feedback/LeaderReveal.vue'
import {
  attributionFor,
  datasetAttribution,
  dedupeAttributions,
  type Attribution,
} from '~~/lib/attribution'
import type { FinalChallengeItem } from '~~/types/challenges/final-challenge.type'
import type { Game } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'

/** Everything a gauntlet reveal can be built from, once the gate has resolved. */
export interface FinalRevealContext {
  challenge: FinalChallengeItem
  /** The country the player last picked, for the cards that mark it. */
  picked?: ISOCountryCode
  variant?: Game['variant']
  /** The ranking pool the stat questions are scored against. */
  pool: ISOCountryCode[]
  /** Per-round tallies the multi-pick rounds accumulate in the view. */
  sunset?: { named: ISOCountryCode[]; inPlay: ISOCountryCode[]; quota: number }
  nocturneCities?: string[]
  /** What True Size's player locked in, as a multiple of the drawn size. */
  trueSizeScale?: number
  endonymPicks: ISOCountryCode[]
  diasporaPicks: ISOCountryCode[]
  /** The made round waits on its lazily-loaded exporter table. */
  madeReady?: boolean
}

export interface FinalReveal {
  component: Component
  /** Undefined = nothing to show yet; the card falls through to the shell's
   *  lesson line rather than mounting with a hole in it (gateRevealFor's rule). */
  props: (context: FinalRevealContext) => Record<string, unknown> | undefined
}

/**
 * One reveal per gauntlet item type, mirroring GATE_VIEWS on the individual
 * side and SCORECARD_REVEALS on the group side.
 *
 * A FULL Record, not Partial: several types deliberately have no card (the
 * scales beam, the boundary easel and the yearbook page are their own reveal),
 * and writing that `undefined` out loud is what keeps "no card by design"
 * distinguishable from "nobody wired one up yet". A new item type is a compile
 * error here either way.
 */
export const FINAL_REVEALS: Record<FinalChallengeItem['_type'], FinalReveal | undefined> = {
  'sunset-blitz-challenge': {
    component: SunsetReveal,
    props: ({ challenge, sunset }) =>
      sunset
        ? { challenge, named: sunset.named, inPlay: sunset.inPlay, quota: sunset.quota }
        : undefined,
  },
  'city-nocturne-challenge': {
    component: NocturneReveal,
    props: ({ challenge, nocturneCities }) =>
      nocturneCities ? { challenge, namedCities: nocturneCities } : undefined,
  },
  'made-challenge': {
    component: MadeReveal,
    props: ({ challenge, picked, madeReady }) => (madeReady ? { challenge, picked } : undefined),
  },
  // The stat questions' scorecard: where the answer sits among the rest of the
  // board, and where the player's pick landed.
  'min-challenge': {
    component: MinMaxReveal,
    props: ({ challenge, pool, variant, picked }) => ({ challenge, pool, variant, picked }),
  },
  'max-challenge': {
    component: MinMaxReveal,
    props: ({ challenge, pool, variant, picked }) => ({ challenge, pool, variant, picked }),
  },
  'language-challenge': {
    component: LanguageReveal,
    props: ({ challenge, picked }) => ({ challenge, picked }),
  },
  // One card for both: a club and a treaty are the same question — who does
  // not belong — and the reveal reads the holdout the same way.
  'membership-challenge': {
    component: OddOneOutReveal,
    props: ({ challenge, picked }) => ({ challenge, picked }),
  },
  'treaty-challenge': {
    component: OddOneOutReveal,
    props: ({ challenge, picked }) => ({ challenge, picked }),
  },
  'leadership-challenge': {
    component: LeaderReveal,
    props: ({ challenge }) =>
      challenge._type === 'leadership-challenge' ? { country: challenge.country } : undefined,
  },
  'endonym-challenge': {
    component: EndonymReveal,
    props: ({ challenge, endonymPicks }) => ({ challenge, picks: endonymPicks }),
  },
  'diaspora-challenge': {
    component: DiasporaReveal,
    props: ({ challenge, diasporaPicks }) => ({ challenge, picks: diasporaPicks }),
  },

  // No bespoke card — these reveal through their own stage, and the shell's
  // lesson line carries what is left to say.
  'region-challenge': undefined,
  // The beam already shows the numbers.
  'scales-challenge': undefined,
  'born-challenge': undefined,
  // The easel overlay draws the real line over the player's.
  'boundary-challenge': undefined,
  // The stamped page IS the reveal.
  'yearbook-challenge': undefined,
  // The stage settles the ghost; the card teaches why it had to move at all.
  // Its sources are handed down from FINAL_PROMPT_SOURCES below rather than
  // composed again inside it — this file is where a gauntlet item's card and
  // its provenance are declared together, and a card that reached back up here
  // for them would close an import cycle.
  'true-size-challenge': {
    component: TrueSizeReveal,
    props: ({ challenge, trueSizeScale }) => ({
      challenge,
      committed: trueSizeScale,
      sources: FINAL_PROMPT_SOURCES['true-size-challenge'](challenge),
    }),
  },
  'change-challenge': undefined,
}

/** The reveal for this item, or undefined when its subject has not resolved. */
export const finalRevealFor = (
  context: FinalRevealContext
): { component: Component; props: Record<string, unknown> } | undefined => {
  const entry = FINAL_REVEALS[context.challenge._type]
  if (!entry) return undefined
  const props = entry.props(context)
  return props ? { component: entry.component, props } : undefined
}

/**
 * Where the current gate's question comes from, by item type. Lives beside the
 * reveal so a gauntlet item's card and its sources are declared together — the
 * GATE_VIEWS principle that a variant's question and its lesson share a home.
 *
 * The reveal cards that carry their own credit rows (sunset, nocturne, made)
 * still appear here: this is the PROMPT's provenance, which the shell shows
 * beside the question itself.
 */
export const FINAL_PROMPT_SOURCES: Record<
  FinalChallengeItem['_type'],
  (challenge: FinalChallengeItem) => Attribution[] | undefined
> = {
  // Stat-backed: the accessor names its own dataset.
  'scales-challenge': challenge =>
    'accessorId' in challenge ? [attributionFor(challenge.accessorId)] : undefined,
  'max-challenge': challenge =>
    'accessorId' in challenge ? [attributionFor(challenge.accessorId)] : undefined,
  'min-challenge': challenge =>
    'accessorId' in challenge ? [attributionFor(challenge.accessorId)] : undefined,

  'membership-challenge': () => datasetAttribution('countries'),
  'language-challenge': () => datasetAttribution('countries'),
  'region-challenge': () => datasetAttribution('countries'),
  'born-challenge': () => datasetAttribution('countries'),
  'endonym-challenge': () => datasetAttribution('countries'),
  'made-challenge': () => datasetAttribution('commodity-exporters'),
  'treaty-challenge': () => datasetAttribution('treaties'),
  'leadership-challenge': () => datasetAttribution('leaders'),
  'diaspora-challenge': () => datasetAttribution('migration'),
  'sunset-blitz-challenge': () => datasetAttribution('cities'),
  'city-nocturne-challenge': () => datasetAttribution('cities'),
  'boundary-challenge': () => datasetAttribution('map'),
  'yearbook-challenge': () => datasetAttribution('events'),
  'change-challenge': () => datasetAttribution('changes'),
  // Two sources, one question: the outlines it re-projects and the areas it
  // judges them against. TrueSizeReveal reads this same entry back through
  // `finalPromptSources` rather than composing a second copy of it.
  'true-size-challenge': () =>
    dedupeAttributions([attributionFor('geography.area.total'), ...datasetAttribution('map')]),
}

export const finalPromptSources = (
  challenge: FinalChallengeItem | undefined
): Attribution[] | undefined =>
  challenge ? FINAL_PROMPT_SOURCES[challenge._type](challenge) : undefined
