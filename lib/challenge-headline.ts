import { LANDMARKS } from '~~/data/landmarks.gen'
import { RECOGNITION_TERRITORIES } from '~~/data/recognition.gen'
import { getChallengeDetails } from '~~/lib/challenges'
import { countryName } from '~~/lib/country'
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
    default:
      return 'id' in challenge ? (getChallengeDetails(challenge.id)?.phrasing ?? '') : ''
  }
}
