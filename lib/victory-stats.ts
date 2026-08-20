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
  'anthem-buzz': ['Perfect Pitch', 'The Golden Ear', 'First Bar Buzzer', 'Anthem Whisperer'],
  'tongue-buzz': ['Polyglot', 'The Good Ear', 'Native Speaker', 'Accent Hunter'],
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
  'star-chart': ['Star Reader', 'Celestial Navigator', 'The Night Pilot', 'Dead-Reckoning Ace'],
  government: ['Whip', 'Speaker of the House', 'Coalition Builder', 'Teller of the Benches'],
  'terra-incognita': [
    'Keeper of the Atlas',
    'The Restorer',
    'Nothing Gets Past You',
    'Cartographer of Holes',
  ],
  flashpoint: ['Crisis Cartographer', 'Field Historian', 'The Dot Reader', 'Peace Scholar'],
  composition: ['Melting Pot', 'Origin Story', 'The Census Taker', 'Diaspora Demographer'],
  'ghost-state': ['Ghost Hunter', 'Border Skeptic', 'The Unrecognized', 'Recognition Wonk'],
  'no-mans-land': ['Rock Collector', 'Terra Nullius', 'The Claim Jumper', 'Sandbank Solicitor'],
  'pin-landmark': ['Pin Dropper', 'Dead Reckoner', 'The Long Shot', 'Coordinate Cowboy'],
  'border-chain': ['Chain Gang Boss', 'The Last Link', 'Unbroken', 'Sudden-Death Survivor'],
  atlas: ['Walking Atlas', 'Last Letter Standing', 'The Gazetteer', 'Alphabet Ace'],
  'heritage-hunt': ['Heritage Hunter', 'Wonder Wanderer', 'The Site Seer', 'Unesco Nomad'],
  'trend-race': ['Trend Spotter', 'Curve Caller', 'The Momentum Reader', 'Delta Detective'],
  timeline: ['The Chronicler', 'Keeper of Years', 'Century Threader', 'History Buff'],
  empire: ['The Archivist', 'Reader of Ruins', 'Keeper of Old Maps', 'Dust of Empires'],
  manhunt: ['Dragnet Chief', 'The Bloodhound', 'Ghost of the Map', 'Interpol Ace'],
  'unique-or-bust': ['One of One', 'The Contrarian', 'Road Less Travelled', 'The Original'],
  'clean-sweep': ['Land Grabber', 'Quickest Draw', 'The Closer', 'First to Say It'],
  'pyramid-scheme': ['Demographer', 'The Cohort Reader', 'Shape of Things', 'Census Whisperer'],
}

/**
 * Two registers for one mode name, so the pair can never drift apart.
 * `prose` reads mid-sentence and lowercase ("62% on border-run rounds");
 * `title` is the sign over the round — what the interstitial's kicker says.
 * They are not derivable from each other: fifteen titles diverge from their
 * prose in more than casing (anthem -> Opening Ceremony, the small words in
 * Drop a Pin), so title-casing the prose would quietly rename half the roster.
 */
export const KIND_LABELS: {
  [kind in RoundChallengeKind]: { prose: string; title: string }
} = {
  ranking: { prose: 'ranking', title: 'Ranking' },
  traversal: { prose: 'border-run', title: 'Border Run' },
  'neighbour-blitz': { prose: 'neighbour blitz', title: 'Neighbour Blitz' },
  silhouette: { prose: 'silhouette', title: 'Silhouette' },
  'anthem-buzz': { prose: 'anthem', title: 'Opening Ceremony' },
  'tongue-buzz': { prose: 'language', title: 'Tongues' },
  'hot-cold': { prose: 'hot & cold', title: 'Hot & Cold' },
  sketch: { prose: 'sketch', title: 'Sketch' },
  'stat-detective': { prose: 'stat detective', title: 'Stat Detective' },
  'two-truths': { prose: 'two truths', title: 'Two Truths and a Lie' },
  'river-run': { prose: 'river run', title: 'River Run' },
  'shared-shores': { prose: 'shared shores', title: 'Shared Shores' },
  highlands: { prose: 'highlands', title: 'Highlands & Basins' },
  'name-that-water': { prose: 'name that water', title: 'Name That Water' },
  'mother-tongue': { prose: 'mother tongue', title: 'Mother Tongue' },
  'flag-palette': { prose: 'flag palette', title: 'Flag Palette' },
  'capital-guess': { prose: 'capital guess', title: 'Capital Guess' },
  'star-chart': { prose: 'star chart', title: 'The Star Chart' },
  government: { prose: 'parliament', title: 'Parliament' },
  'terra-incognita': { prose: 'terra incognita', title: 'Terra Incognita' },
  flashpoint: { prose: 'flashpoint', title: 'Flashpoint' },
  composition: { prose: 'composition', title: 'Composition' },
  'ghost-state': { prose: 'ghost states', title: 'Ghost State' },
  'no-mans-land': { prose: "no man's land", title: "No Man's Land" },
  'pin-landmark': { prose: 'drop a pin', title: 'Drop a Pin' },
  'border-chain': { prose: 'border chain', title: 'Border Chain' },
  atlas: { prose: 'atlas', title: 'Atlas' },
  'heritage-hunt': { prose: 'heritage hunt', title: 'Heritage Hunt' },
  'trend-race': { prose: 'trend race', title: 'Trend Race' },
  timeline: { prose: 'timeline', title: 'Timeline' },
  empire: { prose: 'ghosts of empires', title: 'Ghosts of Empires' },
  manhunt: { prose: 'the despot', title: 'The Despot' },
  'unique-or-bust': { prose: 'unique or bust', title: 'Unique or Bust' },
  'clean-sweep': { prose: 'clean sweep', title: 'Clean Sweep' },
  'pyramid-scheme': { prose: 'age pyramids', title: 'Pyramid Scheme' },
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
    // Clean Sweep's board — the whole set the table raced through, claimed or
    // not. `members` is shared with the empire arm below, so this tests the
    // discriminant rather than the field.
    if ('_type' in challenge && challenge._type === 'clean-sweep-challenge') {
      for (const isoCode of challenge.members) visited.add(isoCode)
    }
    // Ghosts of empires: the core members feed the post-game atlas; partial
    // holdings stay confessed-only.
    if ('empireId' in challenge) {
      for (const isoCode of challenge.members) visited.add(isoCode)
    }
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
        detail: `${Math.round(bestRatio * 100)}% on ${KIND_LABELS[bestKind].prose} rounds`,
      }
    }
  }

  return stats
}
