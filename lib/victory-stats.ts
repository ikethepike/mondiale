import {
  roundChallengeKind,
  type RoundChallengeKind,
} from '~~/types/challenges/traversal-challenge.type'
import type { Game } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * The post-game report, derived entirely from `game.rounds` — every round
 * keeps its challenge, every player's answers and their points, so the
 * victory screen can tell the story of the game without any server help.
 */

export interface RoundResult {
  number: number
  kind: RoundChallengeKind
  scored: number
  maximum: number
}

export interface PlayerGameStats {
  playerId: string
  totalScored: number
  totalPossible: number
  /** Rounds where this player (co-)topped the score. */
  roundWins: number
  timeline: RoundResult[]
  superlative: { title: string; detail: string }
  sharpestRound?: RoundResult
}

/** Epithets per round kind — everyone gets to be best at something. */
const SUPERLATIVE_TITLES: { [kind in RoundChallengeKind]: string[] } = {
  ranking: ['List Maestro', 'Order of Merit', 'The Rank Whisperer', 'Podium Prophet'],
  traversal: ['Pathfinder', 'The Crow Flies', 'Border Hopper', 'Route Oracle'],
  'neighbour-blitz': ['Human Atlas', 'Good Neighbour', 'The Border Lord', 'Fence-Line Fanatic'],
  silhouette: ['Shape Spotter', 'Outline Oracle', 'Silhouette Sniper', 'Shadow Reader'],
  'hot-cold': ['Heat Seeker', 'Warm-Warmer-Hot', 'The Divining Rod', 'Compass Point'],
  sketch: ['Cartographer', 'Steady Hand', 'The Map Maker', 'Freehand Fabulist'],
  'stat-detective': ['Stat Detective', 'Number Sleuth', 'The Data Diviner', 'Percentile Poirot'],
  'two-truths': ['Lie Whisperer', 'Fib Finder', 'The Human Polygraph', 'Bluff Caller'],
  'river-run': ['River Runner', 'Watershed Wizard', 'The Current Affair', 'Delta Force'],
  'shared-shores': ['Coast Guard', 'Shoreline Scholar', 'The Tide Reader', 'Basin Boss'],
  highlands: ['Peak Bagger', 'Highland Chief', 'The Ridge Runner', 'Summit Seeker'],
  'name-that-water': ['Hydronymist', 'Sea Namer', 'The Blue Cartographer', 'Aqua Nomad'],
  'mother-tongue': ['Polyglot', 'Tongue Twister', 'The Babel Fish', 'Lingua Franca'],
  'flag-palette': ['Colour Sommelier', 'Palette Pro', 'The Swatch Sleuth', 'Hue Hunter'],
  'capital-guess': ['Capital Idea', 'Skyline Seer', 'The City Slicker', 'Metropole Maven'],
}

const KIND_LABELS: { [kind in RoundChallengeKind]: string } = {
  ranking: 'ranking',
  traversal: 'border-run',
  'neighbour-blitz': 'neighbour blitz',
  silhouette: 'silhouette',
  'hot-cold': 'hot & cold',
  sketch: 'sketch',
  'stat-detective': 'stat detective',
  'two-truths': 'two truths',
  'river-run': 'river run',
  'shared-shores': 'shared shores',
  highlands: 'highlands',
  'name-that-water': 'name that water',
  'mother-tongue': 'mother tongue',
  'flag-palette': 'flag palette',
  'capital-guess': 'capital guess',
}

const pickEpithet = (kind: RoundChallengeKind, seed: string): string => {
  const options = SUPERLATIVE_TITLES[kind]
  let hash = 0
  for (let index = 0; index < seed.length; index++) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0
  }
  return options[Math.abs(hash) % options.length]
}

/** Every country the game touched — subjects, hands, routes, decoys. */
export const visitedCountries = (game: Game): ISOCountryCode[] => {
  const visited = new Set<ISOCountryCode>()
  for (const round of game.rounds) {
    const challenge = round.groupChallenge
    if (!challenge) continue

    if ('countriesPerPlayer' in challenge) {
      for (const hand of Object.values(challenge.countriesPerPlayer)) {
        for (const isoCode of hand) visited.add(isoCode)
      }
    }
    if ('country' in challenge && typeof challenge.country === 'string') {
      visited.add(challenge.country)
    }
    if ('optimalPath' in challenge) {
      for (const isoCode of challenge.optimalPath) visited.add(isoCode)
    }
    if ('neighbours' in challenge) {
      for (const isoCode of challenge.neighbours) visited.add(isoCode)
    }
    if ('lieSource' in challenge) visited.add(challenge.lieSource)
  }
  return [...visited]
}

export const gameStats = (game: Game): { [playerId: string]: PlayerGameStats } => {
  const playerIds = Object.keys(game.players)
  const stats: { [playerId: string]: PlayerGameStats } = {}
  for (const playerId of playerIds) {
    stats[playerId] = {
      playerId,
      totalScored: 0,
      totalPossible: 0,
      roundWins: 0,
      timeline: [],
      superlative: { title: 'Wildcard', detail: 'kept everyone guessing' },
    }
  }

  game.rounds.forEach((round, index) => {
    const kind = roundChallengeKind(round.groupChallenge)
    let best = 0
    for (const playerId of playerIds) {
      best = Math.max(best, round.playerTurns[playerId]?.points.scored ?? 0)
    }

    for (const playerId of playerIds) {
      const points = round.playerTurns[playerId]?.points
      if (!points) continue
      const result: RoundResult = {
        number: index + 1,
        kind,
        scored: points.scored,
        maximum: points.maximum,
      }
      const playerStats = stats[playerId]
      playerStats.timeline.push(result)
      playerStats.totalScored += points.scored
      playerStats.totalPossible += points.maximum
      if (points.scored > 0 && points.scored === best) playerStats.roundWins++

      const sharpest = playerStats.sharpestRound
      if (!sharpest || result.scored / result.maximum > sharpest.scored / sharpest.maximum) {
        playerStats.sharpestRound = result
      }
    }
  })

  // Superlatives: each player's strongest round kind by average score ratio
  for (const playerStats of Object.values(stats)) {
    const byKind = new Map<RoundChallengeKind, { total: number; possible: number }>()
    for (const result of playerStats.timeline) {
      const bucket = byKind.get(result.kind) ?? { total: 0, possible: 0 }
      bucket.total += result.scored
      bucket.possible += result.maximum
      byKind.set(result.kind, bucket)
    }

    let bestKind: RoundChallengeKind | undefined
    let bestRatio = 0
    for (const [kind, bucket] of byKind) {
      const ratio = bucket.possible ? bucket.total / bucket.possible : 0
      if (ratio > bestRatio) {
        bestRatio = ratio
        bestKind = kind
      }
    }

    if (bestKind && bestRatio > 0) {
      playerStats.superlative = {
        title: pickEpithet(bestKind, playerStats.playerId + bestKind),
        detail: `${Math.round(bestRatio * 100)}% on ${KIND_LABELS[bestKind]} rounds`,
      }
    }
  }

  return stats
}
