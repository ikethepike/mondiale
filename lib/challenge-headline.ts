import { EMPIRES } from '~~/data/empires.gen'
import { empireDisplayName } from '~~/lib/empires'
import { LANDMARKS } from '~~/data/landmarks.gen'
import { RECOGNITION_TERRITORIES } from '~~/data/recognition.gen'
import { getChallengeDetails } from '~~/lib/challenges'
import { SWEEP_SETS, sweepUnclaimed } from '~~/lib/clean-sweep'
import { countryName } from '~~/lib/country'
import { isChallengeOfType } from '~~/lib/rounds'
import { starChartStars } from '~~/lib/star-chart'
import { formatEventYear, timelineEvent } from '~~/lib/timeline'
import { sentenceCase } from '~~/lib/strings'
import {
  isTraversalChallenge,
  roundChallengeKind,
  type RoundChallenge,
} from '~~/types/challenges/traversal-challenge.type'

/**
 * One-line reveal headline for a group round — shared by the score view and
 * the board's round-history drawer.
 */
export const roundChallengeHeadline = (challenge: RoundChallenge | undefined): string => {
  if (!challenge) return ''
  switch (roundChallengeKind(challenge)) {
    case 'traversal': {
      if (!isTraversalChallenge(challenge)) return ''
      return challenge.corridor
        ? `Link ${countryName(challenge.start)} to ${countryName(challenge.target)} — ${challenge.corridor.name} only`
        : `Link ${countryName(challenge.start)} to ${countryName(challenge.target)}`
    }
    case 'neighbour-blitz':
      return '_type' in challenge && challenge._type === 'neighbour-blitz-challenge'
        ? `Name ${countryName(challenge.country)}'s neighbours`
        : ''
    case 'silhouette':
      return '_type' in challenge && challenge._type === 'silhouette-challenge'
        ? `Whose outline is this? It was ${countryName(challenge.country)}`
        : ''
    case 'anthem-buzz':
      return '_type' in challenge && challenge._type === 'anthem-buzz-challenge'
        ? `Whose anthem was that? It was ${countryName(challenge.country)}`
        : ''
    case 'tongue-buzz':
      return '_type' in challenge && challenge._type === 'tongue-buzz-challenge'
        ? `That was ${challenge.language} — official in ${challenge.countries.length} countries`
        : ''
    case 'hot-cold':
      return '_type' in challenge && challenge._type === 'hot-cold-challenge'
        ? `The mystery country was ${countryName(challenge.country)}`
        : ''
    case 'sketch':
      return '_type' in challenge && challenge._type === 'sketch-challenge'
        ? `Draw ${countryName(challenge.country)}`
        : ''
    case 'stat-detective':
      return '_type' in challenge && challenge._type === 'stat-detective-challenge'
        ? `The numbers belonged to ${countryName(challenge.country)}`
        : ''
    case 'two-truths':
      return '_type' in challenge && challenge._type === 'two-truths-challenge'
        ? `The lie about ${countryName(challenge.country)} came from ${countryName(challenge.lieSource)}`
        : ''
    case 'river-run':
    case 'shared-shores':
    case 'highlands':
      return '_type' in challenge && challenge._type === 'water-blitz-challenge'
        ? `The ${challenge.featureName} touches ${challenge.countries.length} countries`
        : ''
    case 'name-that-water':
      return '_type' in challenge && challenge._type === 'name-water-challenge'
        ? `It was the ${challenge.featureName}`
        : ''
    case 'capital-guess':
      return '_type' in challenge && challenge._type === 'capital-guess-challenge'
        ? `That skyline was ${countryName(challenge.country)}'s capital`
        : ''
    case 'flashpoint':
      return '_type' in challenge && challenge._type === 'flashpoint-challenge'
        ? `Those flashpoints were ${countryName(challenge.country)}'s`
        : ''
    case 'flag-palette':
      return '_type' in challenge && challenge._type === 'flag-palette-challenge'
        ? `Those colours fly for ${countryName(challenge.country)}`
        : ''
    case 'parliament': {
      if (!isChallengeOfType(challenge, 'parliament-challenge')) return ''
      return `The ${countryName(challenge.country)} parliament`
    }
    case 'star-chart': {
      if (!isChallengeOfType(challenge, 'star-chart-challenge')) return ''
      const names = starChartStars(challenge).map(star => star.name)
      return names.length ? `The stars were ${names.join(', ')}` : 'The star chart round'
    }
    case 'mother-tongue':
      return '_type' in challenge && challenge._type === 'mother-tongue-challenge'
        ? `${challenge.language} — official in ${challenge.countries.length} countries`
        : ''
    case 'ghost-state':
      return '_type' in challenge && challenge._type === 'ghost-state-challenge'
        ? `${RECOGNITION_TERRITORIES[challenge.territoryId]?.name ?? 'A ghost state'} — claimed by ${countryName(challenge.parent)}`
        : ''
    case 'no-mans-land': {
      if (!('_type' in challenge) || challenge._type !== 'no-mans-land-challenge') return ''
      const territory = RECOGNITION_TERRITORIES[challenge.territoryId]?.name ?? 'A no man’s land'
      const count = challenge.claimants.length
      return count === 0
        ? `${territory} — claimed by no one at all`
        : `${territory} — claimed by ${count} ${count === 1 ? 'country' : 'countries'}`
    }
    case 'pin-landmark':
      return '_type' in challenge && challenge._type === 'pin-landmark-challenge'
        ? `The landmark was ${LANDMARKS[challenge.slug]?.name ?? 'a mystery'}`
        : ''
    case 'empire': {
      if (!('_type' in challenge) || challenge._type !== 'empire-challenge') return ''
      const name = EMPIRES[challenge.empireId]?.name
      const display = name ? empireDisplayName(name) : 'an empire'
      return `${sentenceCase(display)} — greatest extent, ${formatEventYear(challenge.peakYear)}`
    }
    case 'timeline': {
      if (!('_type' in challenge) || challenge._type !== 'timeline-challenge') return ''
      const placed = challenge.state.placed
      const first = timelineEvent(placed[0])
      const last = timelineEvent(placed[placed.length - 1])
      return first && last && placed.length > 1
        ? `The timeline ran from ${formatEventYear(first.year)} to ${formatEventYear(last.year)}`
        : 'The timeline round'
    }
    case 'clean-sweep': {
      if (!('_type' in challenge) || challenge._type !== 'clean-sweep-challenge') return ''
      const label = SWEEP_SETS[challenge.setId]?.label ?? 'the board'
      const taken = challenge.members.length - sweepUnclaimed(challenge).length
      return `${sentenceCase(label)} — the table took ${taken} of ${challenge.members.length}`
    }
    case 'unique-or-bust':
      return '_type' in challenge && challenge._type === 'unique-or-bust-challenge'
        ? `Letter ${challenge.letter} — only unshared answers paid`
        : ''
    case 'manhunt': {
      if (!('_type' in challenge) || challenge._type !== 'manhunt-challenge') return ''
      const outcome = challenge.state.outcome
      if (outcome?.kind === 'captured') {
        return `The despot was cornered in ${countryName(outcome.country)} on turn ${outcome.hop}`
      }
      if (outcome?.kind === 'escaped') {
        return `The despot escaped after ${challenge.turnCount} turns on the run`
      }
      return 'The hunt for the despot'
    }
    default:
      return 'id' in challenge ? (getChallengeDetails(challenge.id)?.phrasing ?? '') : ''
  }
}
