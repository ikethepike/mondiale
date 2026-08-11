import type { GroupChallengeAccessorId } from './group-challenge.type'
import type { RosettaRelationId } from '../../lib/rosetta'
import type { TrendMetricId } from '../../lib/trends'
import type { ISOCountryCode } from '../geography.types'

/**
 * Individual challenges gate the board: answer correctly to leap ahead, fail
 * and you're knocked back. They all validate through the shared
 * `isCorrectIndividualAnswer` (lib/challenges.ts): the submitted ISO code must
 * equal `country`, except currency questions accept any country spending the
 * same (possibly shared) currency. Every variant encodes its winning answer
 * in `country`:
 * - 'find' (default / legacy data): locate `country` on the map
 * - 'flag-pick': `country`'s flag among lookalike decoys in `options`
 * - 'odd-one-out': `country` is the impostor among `oddOneOut.countries`
 * - 'higher-lower': three stat duels; the client submits `country` only when
 *   every duel was answered correctly (same client-trust model as the map)
 * - 'trend-duel': which of two countries' stat is rising/falling — a streak of
 *   pairs with one guaranteed riser + one faller (higher-lower's trust model)
 * - 'trajectory-match': a mystery sparkline — whose chart is this? Timed like
 *   border-detective, one buyable strike-out hint
 * - 'leader-pick': whose leader is named — `options` are the candidate
 *   countries, their leaders shown as the answers
 * - 'outline-reveal' (hard mode): `country`'s border draws itself in; name
 *   it by typing before the clock runs out — one wrong guess fails the gate
 * - 'leader-portrait': a leader's photo (from the Wikidata-generated leader
 *   data) — pick which of the `options` countries they govern
 * - 'errata': a labelled cluster of countries with exactly one misprint — tap
 *   the country wearing the wrong name (either of the two, on a swap)
 * - 'rosetta': A : B :: C : ? — the exemplar pair fixes which relation is
 *   meant, and the answer to the second pair is `country`
 * - 'atlas': chain countries where each name starts where the last one ended
 *   (Nepal → Laos); the chain is client-validated through lib/atlas-chain and
 *   `country` holds the seed as the winning token (higher-lower's trust model)
 * - 'scriptorium': a written sample in a mystery script — name any country
 *   where the language is official (the answer set is recomputed both sides
 *   via lib/scriptorium, the shared-currency posture)
 * - 'chronicle': one country's events, dragged into order; graded client-side
 *   through lib/chronicle and submitted as `country` on a clean order
 *   (higher-lower's trust model)
 * - 'far-flung': a detached piece of a country, framed alone — name the
 *   country it belongs to (strict ISO equality)
 */
export interface IndividualChallenge {
  _type: 'individual-challenge'
  id: IndividualChallengeAccessorId
  country: ISOCountryCode
  variant?: IndividualChallengeVariant
  /** flag-pick: the flags on offer (includes `country`), display order. */
  options?: ISOCountryCode[]
  /** odd-one-out: the lineup (includes `country`) and what the others share. */
  oddOneOut?: {
    countries: ISOCountryCode[]
    propertyLabel: string
    /** The discriminator behind the label, kept so the reveal's lesson agrees
     *  with the dealer by construction (optional: pre-existing games lack it). */
    kind?: 'region' | 'language' | 'organization' | 'party-family'
    /** The shared value — region label, language name, organization name, or
     *  the political family the other three are governed by. */
    value?: string
  }
  /** higher-lower: stat duels, answered in order. */
  higherLower?: {
    accessorId: GroupChallengeAccessorId
    pairs: { a: ISOCountryCode; b: ISOCountryCode }[]
  }
  /** trend-duel: which country's stat trends `seek`-ward — one riser + one
   *  faller per pair, answered in order; the client submits `country` only on
   *  a clean streak (same client-trust model as higher-lower, truth derived
   *  from TRENDS via readTrend). */
  trendDuels?: {
    metric: TrendMetricId
    seek: 'rising' | 'falling'
    a: ISOCountryCode
    b: ISOCountryCode
  }[]
  /** trajectory-match: whose chart is this? Timed gate like border-detective —
   *  the clock fraction scales the leap and the one buyable hint (strike out
   *  half the decoys) bites steps via gateLeapSteps. */
  trajectory?: {
    metric: TrendMetricId
    /** Includes `country`, display order. */
    options: ISOCountryCode[]
    /** Non-hard: y-axis values revealed free in the final third. */
    valuesHint: boolean
  }
  /** leader-portrait: the face on the card (name shown only in the result). */
  portrait?: {
    image: string
    name: string
  }
  /** border-detective: the mystery country's neighbours, shown as a flag ring
   *  (the answer `country` is NOT among them — it sits in the empty centre).
   *  Timed: the clock fraction left scales the leap, and an outline hint
   *  (unlocked a third of the way in) costs steps (see `gateLeapSteps`). */
  neighbours?: ISOCountryCode[]
  /** capital-match / photo gates: a photo (capital skyline, landmark) whose
   *  country the player names from `options`. */
  image?: string
  /** landmark-quiz: which curated landmark (LANDMARKS key). The reveal shows
   *  its dossier (name, description) and marks its true spot on the map. */
  landmarkSlug?: string
  /**
   * errata: the labelled cluster and what's wrong with it.
   *
   * The rendered `labels` ride the challenge because they ARE the question,
   * not a rendering detail — the OddOneOutChallenge posture. That means the
   * payload carries the answer, which is accepted here for the same reason
   * silhouette accepts it: the client cannot ask the question without
   * rendering the corruption, and the SCORE stays the server's.
   */
  errata?: {
    /** The labelled countries, all mutually reachable over land borders. */
    lineup: ISOCountryCode[]
    kind: ErrataKind
    /**
     * The mislabelled countries — every one of them is an accepted answer
     * (see `isCorrectIndividualAnswer`). Two for a swap, one for an impostor.
     * `country` is `culprits[0]` so the reveal zoom needs no special case.
     */
    culprits: ISOCountryCode[]
    /** What each lineup member is labelled as, exactly as shown. */
    labels: Partial<Record<ISOCountryCode, string>>
  }
  /** atlas: the name chain. `country` doubles as the seed; links are graded
   *  client-side through lib/atlas-chain (the rule, the credit and the hint
   *  all read that one module, on both formats). */
  atlas?: {
    /** The dealt opening country — the chain's zeroth chip. */
    seed: ISOCountryCode
    /** Links to bank. With `overlaps`, each junction pays its overlap length. */
    target: number
    /** Hard's rule: any shared ending chains (Nepal → Palestine), not just the
     *  tail letter. Rides the deal so the view and the reveal grade the same
     *  rule by construction. */
    overlaps: boolean
  }
  /** scriptorium: the mystery language. The written sample resolves at view
   *  time through lib/tongue-samples; the answer SET is never shipped — both
   *  sides recompute it via `scriptoriumAnswers` (lib/scriptorium). `country`
   *  is a canonical speaker for the reveal zoom. */
  scriptorium?: {
    language: string
  }
  /** chronicle: EVENT slugs in display (shuffled) order. Years stay out of the
   *  payload — data/events.gen is already client-bundled, and the view grades
   *  the final order through lib/chronicle. */
  chronicle?: {
    events: string[]
  }
  /** far-flung: the FAR_FLUNG fragment on stage (data/far-flung.gen key).
   *  The reveal reads the same entry the dealer picked. */
  farFlung?: {
    slug: string
  }
  /** rosetta: A : B :: C : ? — the answer to the second pair is `country`. */
  rosetta?: {
    relation: RosettaRelationId
    /** The demonstrating pair, resolved to display strings at deal time. */
    exemplar: { term: string; isoCode: ISOCountryCode }
    /** The question's left-hand term, whose country is the answer. */
    term: string
    /** The relation in words ("its highest mountain") — the buyable hint's
     *  content, and free on easy. Resolved through ROSETTA_RELATIONS at the
     *  deal so the question and the reveal's lesson can't drift. */
    relationLabel: string
  }
}

/** How an errata lineup was corrupted. `swap` exchanges two adjacent members'
 *  names (both guilty); `impostor` gives one member the name of a country
 *  that isn't on the stage at all. */
export type ErrataKind = 'swap' | 'impostor'

export const individualChallengeVariants = [
  'find',
  'flag-pick',
  'flag-twins',
  'border-detective',
  'money-match',
  'zoom-out',
  'capital-match',
  'landmark-quiz',
  'odd-one-out',
  'higher-lower',
  'trend-duel',
  'trajectory-match',
  'leader-pick',
  'outline-reveal',
  'leader-portrait',
  'errata',
  'rosetta',
  'atlas',
  'scriptorium',
  'chronicle',
  'far-flung',
] as const
export type IndividualChallengeVariant = (typeof individualChallengeVariants)[number]

/**
 * The board's gate themes. Each one is a tile type (`Tile['type']`), a marker
 * on the 3D board and a gate-top wash, so this list is what the board is made
 * of — not just what a gate can ask.
 *
 * A theme is a CATEGORY, never a mode. A marker can only ever reflect the
 * theme (tiles are dealt at game creation, long before any challenge is), so a
 * tile named for one mode would either strand its siblings on the wrong marker
 * or need a new tile per mode. The six data themes above name what the gate is
 * about; the two below name a kind of thinking, and each has room for more
 * tenants:
 *
 * - `errata` — things that are wrong. Tenants: Errata. Counterfeit belongs
 *   here when it lands (its marker will have to widen past signposts to cover
 *   a forged flag).
 * - `lexicon` — a term and the country it belongs to. Tenants: Rosetta, Atlas
 *   (the name chain) and Scriptorium (name a country from its writing alone).
 *   The Naming and Switchboard belong here too.
 * - `history` — a country's story through time. Tenant: Chronicle (drag one
 *   country's events into order). High-Water Mark and a rosetta history
 *   register belong here when they land.
 *
 * Promotion costs the other themes nothing: the capital, currency, leader and
 * landmark tiles still deal Rosetta in each of their own registers
 * (ROSETTA_RELATIONS_BY_ACCESSOR), while the lexicon tile draws from all.
 */
export const individualChallengeAccessors = [
  'flag',
  'isoCode',
  'capital.name',
  'government.leader',
  // The parties themselves, as distinct from the person leading one. Tenants:
  // Rulers (spot the party that is NOT in government) and Logo Politics (place
  // a party by its logo). It shares the leader gate's lectern on purpose —
  // both are the same political register, the way `errata` shares the ISO
  // gate's signpost — and the clay top is what tells them apart.
  'government.parties',
  'currency',
  'landmarks',
  'errata',
  'lexicon',
  'history',
] as const
export type IndividualChallengeAccessorId = (typeof individualChallengeAccessors)[number]
export const isValidIndividualChallengeAccessorId = (
  accessorId: unknown
): accessorId is IndividualChallengeAccessorId => {
  return (
    typeof accessorId === 'string' &&
    individualChallengeAccessors.includes(accessorId as IndividualChallengeAccessorId)
  )
}

/** One higher/lower duel a player faced, kept for the educational reveal. */
export interface DuelOutcome {
  picked: ISOCountryCode
  higher: ISOCountryCode
  lower: ISOCountryCode
  correct: boolean
}

/** One trend duel a player faced, kept for the educational reveal. */
export interface TrendDuelOutcome {
  metric: TrendMetricId
  seek: 'rising' | 'falling'
  picked: ISOCountryCode
  /** The side whose series actually trends `seek`-ward. */
  answer: ISOCountryCode
  other: ISOCountryCode
  correct: boolean
}
