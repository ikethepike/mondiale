import { CHALLENGE_GROUP_ACCESSORS } from '~~/types/challenges/challenge-groups.type'
import type {
  RoundChallenge,
  RoundChallengeKind,
} from '~~/types/challenges/traversal-challenge.type'
import type { WaterFacts } from '~~/data/water-facts.gen'
import type { TongueFacts } from '~~/data/tongue-facts.gen'
import { formatCompact, formatKm, formatNumber } from '~~/lib/number'
import { isChallengeOfType } from '~~/lib/rounds'
import { terrainFamily, type TerrainFamily } from '~~/lib/terrain'
import { boardLabel } from '~~/lib/variant'

/**
 * The scorecard's per-kind prose, beside `roundChallengeHeadline` — the other
 * per-kind reveal copy the score view and the round-history drawer share.
 *
 * Lives here rather than in the view for the reason the headline does: the copy
 * is a property of the ROUND KIND, not of one screen, and only a `lib/` module
 * is reachable by the unit tests that keep every kind covered.
 */
export interface ScorecardCopyContext {
  kind: RoundChallengeKind
  challenge?: RoundChallenge
  /** Border crossings on the shown shortest route — traversal only. */
  shortestHops?: number
  /** Border crossings on the route the guesses actually built, if they bridged. */
  walkedHops?: number
  /** Whether the guesses bridged the two endpoints at all. */
  bridged?: boolean
  /** Ranking rounds only: the stat had countries sharing a value. */
  hasTies?: boolean
  hardMode?: boolean
  /** Capital-guess and flashpoint: a dealt guess cap changes what pays. */
  maximumGuesses?: number
}

const crossings = (hops: number) => `${hops} ${hops === 1 ? 'border' : 'borders'}`

/** The traversal explainer, voiced about the round rather than the reader —
 *  the card flips between seats. */
const traversalExplainer = (context: ScorecardCopyContext): string => {
  const shortest = context.shortestHops ?? 0
  if (!context.bridged) {
    return `The guesses never bridged the two — the shortest link crosses ${crossings(shortest)}.`
  }
  const walked = context.walkedHops ?? 0
  return walked === shortest
    ? `That link crosses ${crossings(shortest)}, as short as it gets — only stray guesses cost points.`
    : `That link crosses ${crossings(walked)}; the shortest crosses ${shortest} — every extra crossing and stray guess costs points.`
}

/** The ranking fallback: the scoring band, plus the two facts the numbers alone
 *  would hide (shared places, and what an "armed conflict" actually counts). */
const rankingExplainer = (context: ScorecardCopyContext): string => {
  const challenge = context.challenge
  let base = '3 points for a spot-on answer, 2 for one place off, 1 for two places off.'
  // Countries sharing a value have no order between them, so the round can't
  // charge for one — say so before the repeated rank numbers read as a bug.
  if (context.hasTies)
    base += ' Countries on the same value share a place — any order among them is spot on.'

  const isConflictStat =
    challenge &&
    'id' in challenge &&
    (CHALLENGE_GROUP_ACCESSORS.conflicts as readonly string[]).includes(challenge.id)
  return isConflictStat
    ? `${base} Most armed conflicts since 1946 are internal — a state against a group inside its own borders, not two states at war.`
    : base
}

/** How the round paid, in one line under the score. */
export const scorecardExplainer = (context: ScorecardCopyContext): string => {
  switch (context.kind) {
    case 'traversal':
      return traversalExplainer(context)
    case 'neighbour-blitz':
      return 'Points scale with neighbours found — wrong names each cost one.'
    case 'silhouette':
      return 'The earlier the buzz, the bigger the score.'
    case 'anthem-buzz':
      return 'The earlier the buzz, the bigger the score.'
    case 'tongue-buzz':
      return 'Any country with that official language counted — the earlier the buzz, the bigger the score.'
    case 'hot-cold':
      return 'Finding it is everything — every extra probe costs points.'
    case 'sketch':
      return 'Scored by how closely the drawing matches the real outline.'
    case 'stat-detective':
      return 'The fewer clues you needed, the bigger the score.'
    case 'two-truths':
      return context.hardMode
        ? 'Right stamps pay, wrong ones cost, blanks are free — the first perfect sheet takes a bonus.'
        : 'Right stamps pay, wrong ones cost, blanks are free — a revealed card costs a slice of the pot.'
    case 'composition':
      return 'The biggest group pays most; every other group placed adds a share. Run out of strikes and the crowd closes.'
    case 'capital-guess':
      return context.maximumGuesses
        ? 'Name it first try for full marks — the second guess is worth less.'
        : "The sooner you name it, the more it's worth."
    case 'ground-plan':
      return context.maximumGuesses
        ? 'Name it first try for full marks — the second guess is worth less.'
        : 'The fewer layers you needed, the bigger the score.'
    case 'flashpoint':
      return context.maximumGuesses
        ? 'Name it first try for full marks — the second guess is worth less.'
        : "The earlier you name it, the more it's worth."
    case 'flag-palette':
      return "The sooner you name it, the more it's worth."
    case 'star-chart':
      return 'Points scale with stars named — wrong capitals each cost one. Where a city sits is the whole question.'
    case 'lay-of-the-land':
      return 'Points scale with countries found — wrong names each cost one, arguable ones nothing.'
    case 'terra-incognita':
      return 'Points scale with countries put back — naming one that was never gone costs you. Noticing the gap is the whole question.'
    case 'name-that-water':
      return 'Fewer guesses, bigger score.'
    case 'clean-sweep':
      return 'Every name goes to whoever said it first. Beating your share of the board pays more; clearing it pays the whole table, and the last name pays its closer.'
    case 'timeline':
      return 'A correct slot banks points — the fuller the line when you placed, the more it paid.'
    case 'vintage':
      return 'Any year that shows exactly this map pays in full — the further outside them, the less.'
    case 'empire':
      return 'Naming the ghost pays the smaller share — the earlier the buzz, the more of it. The rest is for tracing its lands: points scale with how closely your taps match its core.'
    default:
      return rankingExplainer(context)
  }
}

export interface ScorecardLabels {
  submitted: string
  correct: string
  stray: string
}

/** The stray tail reads the same everywhere: whatever the round asked for,
 *  these are names the player gave that weren't in the set. */
const STRAY_LABEL = 'Wrong Names'

const TERRAIN_LEDGER: Record<TerrainFamily, string> = {
  river: 'Every Country It Crosses',
  shore: 'All the Shores',
  land: 'Everywhere It Reaches',
}

/** What to call each of the scorecard's two answer rows. */
export const scorecardLabels = (context: ScorecardCopyContext): ScorecardLabels => {
  const pair = ((): Omit<ScorecardLabels, 'stray'> => {
    switch (context.kind) {
      case 'traversal':
        return {
          submitted: context.bridged ? 'Your Route' : 'Your Guesses',
          correct: 'A Shortest Route',
        }
      case 'neighbour-blitz':
        return { submitted: 'Your Answers', correct: 'All the Neighbours' }
      case 'silhouette':
        return { submitted: 'Your Answer', correct: 'The Country' }
      case 'hot-cold':
        return { submitted: 'Your Probe Trail', correct: 'The Country' }
      case 'stat-detective':
        return { submitted: 'Your Answer', correct: 'The Country' }
      case 'two-truths':
        return { submitted: 'Your Perfect Sheet', correct: 'The Country' }
      case 'capital-guess':
        return { submitted: 'Your Answer', correct: 'The Country' }
      case 'composition':
        return { submitted: 'Groups You Placed', correct: 'The Crowd' }
      case 'ground-plan':
        return { submitted: 'Your Answer', correct: 'The City' }
      // The star chart renders StarChartReveal instead of the shared ledger, so
      // these only ever reach the tally line beneath the score.
      case 'star-chart':
        return { submitted: 'Capitals You Named', correct: 'The Stars' }
      case 'flashpoint':
        return { submitted: 'Your Answer', correct: 'The Country' }
      case 'flag-palette':
        return { submitted: 'Your Answer', correct: 'The Country' }
      case 'lay-of-the-land': {
        const family =
          context.challenge && isChallengeOfType(context.challenge, 'water-blitz-challenge')
            ? terrainFamily(context.challenge.kind)
            : 'land'
        return { submitted: 'Your Answers', correct: TERRAIN_LEDGER[family] }
      }
      case 'name-that-water':
        return { submitted: 'Your Answer', correct: 'Its Shores' }
      case 'mother-tongue': {
        // On a regional board "everywhere" was only ever that board.
        const scope =
          context.challenge && isChallengeOfType(context.challenge, 'mother-tongue-challenge')
            ? context.challenge.scope
            : undefined
        return {
          submitted: 'Your Answers',
          correct: scope ? `Where It's Spoken in ${boardLabel(scope)}` : "Everywhere It's Spoken",
        }
      }
      case 'clean-sweep':
        return { submitted: 'Your Claims', correct: 'The Whole Board' }
      case 'empire':
        return { submitted: 'Lands You Traced', correct: 'Its Core Lands' }
      default:
        return { submitted: 'Submitted Ranking', correct: 'Correct Ranking' }
    }
  })()

  return { stray: STRAY_LABEL, ...pair }
}

/** The water feature's official figure in words — undefined for bodies the
 *  Factbook doesn't list (most seas, ranges), which hides the section. */
export const waterFactLine = (
  feature: { featureName: string; kind: string },
  facts: WaterFacts | undefined
): string | undefined => {
  if (!facts) return undefined
  if (feature.kind === 'river' && facts.lengthKm)
    return `${feature.featureName} runs ${formatKm(facts.lengthKm)} from source to mouth.`
  if (facts.areaSqKm)
    return `${feature.featureName} spans ${formatNumber(facts.areaSqKm)} km² of surface.`
  return undefined
}

/** The language's Wikidata facts in words — undefined for languages it
 *  couldn't resolve, or that resolved with nothing worth printing. */
export const tongueFactLine = (
  language: string,
  facts: TongueFacts | undefined
): string | undefined => {
  if (!facts) return undefined
  const parts = [
    facts.speakers ? `spoken by ${formatCompact(facts.speakers)} people worldwide` : undefined,
    facts.scripts?.length ? `written in ${facts.scripts.join(', ')}` : undefined,
  ].filter(Boolean)
  return parts.length ? `${language} — ${parts.join(' · ')}.` : undefined
}
