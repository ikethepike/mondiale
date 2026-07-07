import { BORDERS } from '~~/data/borders.gen'
import { COUNTRIES } from '~~/data/countries.gen'
import { ISOCountryCodes } from '~~/data/iso-codes.gen'
import type { ChallengeConfiguration, ChallengeMarkers } from '~~/types/challenge.type'
import {
  type GroupChallengeAccessorId,
  GROUP_CHALLENGES,
} from '~~/types/challenges/group-challenge.type'
import type {
  HotColdChallenge,
  NeighbourBlitzChallenge,
  SilhouetteChallenge,
  SketchChallenge,
} from '~~/types/challenges/group-modes.type'
import type {
  IndividualChallenge,
  IndividualChallengeAccessorId,
} from '~~/types/challenges/individual-challenge.type'
import type {
  RoundChallenge,
  RoundChallengeKind,
  TraversalChallenge,
} from '~~/types/challenges/traversal-challenge.type'
import type * as gameTypes from '~~/types/game.types'
import type { Amount, ISOCountryCode } from '~~/types/geography.types'
import { shuffleArray } from './arrays'
import { getRandomISOCountryCode } from './country'
import { isRouteComplete, pickTraversal } from './traversal'
import { getValueByAccessorID } from './values'

const MAXIMUM_SCORE_PER_COUNTRY = 3
const DEFAULT_CHALLENGE_MARKERS: ChallengeMarkers = {
  most: 'Most',
  least: 'Least',
}

export const DIFFICULTY_CONFIGURATION: {
  [difficulty in gameTypes.GameDifficulty]: {
    rankingChallengeCountries: number
  }
} = {
  easy: {
    rankingChallengeCountries: 4,
  },
  normal: {
    rankingChallengeCountries: 5,
  },
  hard: {
    rankingChallengeCountries: 7,
  },
}

/** Standard points ceiling per round, scaled by difficulty. */
const maximumRoundPoints = (game: gameTypes.Game) =>
  MAXIMUM_SCORE_PER_COUNTRY * DIFFICULTY_CONFIGURATION[game.difficulty].rankingChallengeCountries

/** Relative weights for the round mix (after the tutorial-friendly round 1). */
const ROUND_WEIGHTS: [RoundChallengeKind, number][] = [
  ['ranking', 0.3],
  ['traversal', 0.2],
  ['neighbour-blitz', 0.15],
  ['silhouette', 0.12],
  ['hot-cold', 0.13],
  ['sketch', 0.1],
]

/**
 * Test hook: FORCE_ROUND_TYPE=<kind> makes every round that kind
 * (FORCE_TRAVERSAL_ROUNDS=1 kept as an alias for traversal).
 */
const forcedRoundKind = (): RoundChallengeKind | undefined => {
  if (typeof process === 'undefined') return undefined
  if (process.env?.FORCE_TRAVERSAL_ROUNDS === '1') return 'traversal'
  const forced = process.env?.FORCE_ROUND_TYPE
  return ROUND_WEIGHTS.some(([kind]) => kind === forced)
    ? (forced as RoundChallengeKind)
    : undefined
}

const pickRoundKind = (): RoundChallengeKind => {
  const total = ROUND_WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0)
  let roll = Math.random() * total
  for (const [kind, weight] of ROUND_WEIGHTS) {
    roll -= weight
    if (roll <= 0) return kind
  }
  return 'ranking'
}

/** Countries whose outlines are dominated by scattered islands — no fun to
 * draw or to watch materialize; excluded from shape-centric modes. */
const SHAPE_UNFRIENDLY: ISOCountryCode[] = [
  'ID', 'PH', 'JP', 'NZ', 'FJ', 'SB', 'VU', 'TO', 'TV', 'KI', 'FM', 'PW', 'NR',
  'MV', 'SC', 'KM', 'CV', 'ST', 'BS', 'AG', 'BB', 'DM', 'GD', 'KN', 'LC', 'TT',
  'MU', 'MT', 'SG', 'BH', 'HK', 'VA', 'MC', 'SM', 'AD', 'LI', 'LU',
]

const pickShapeFriendlyCountry = (): ISOCountryCode => {
  const excluded = new Set(SHAPE_UNFRIENDLY)
  const pool = ISOCountryCodes.filter(isoCode => {
    if (excluded.has(isoCode)) return false
    const area = COUNTRIES[isoCode].geography.area.land
    return !!area && area.amount > 20
  })
  return pool[Math.floor(Math.random() * pool.length)]
}

const getNeighbourBlitzChallenge = ({
  game,
}: {
  game: gameTypes.Game
}): NeighbourBlitzChallenge | undefined => {
  const pool = shuffleArray(
    ISOCountryCodes.filter(isoCode => (BORDERS[isoCode]?.length ?? 0) >= 4)
  )
  const country = pool[0]
  if (!country) return undefined

  return {
    _type: 'neighbour-blitz-challenge',
    country,
    neighbours: [...BORDERS[country]],
    durationSeconds: 45,
    maximumPoints: maximumRoundPoints(game),
  }
}

const getSilhouetteChallenge = ({ game }: { game: gameTypes.Game }): SilhouetteChallenge => ({
  _type: 'silhouette-challenge',
  country: pickShapeFriendlyCountry(),
  durationSeconds: 30,
  maximumPoints: maximumRoundPoints(game),
})

/**
 * Micro-island states are near-invisible click targets at world zoom, and a
 * mid-Pacific mystery reads as "east of everything" on the flat map — the
 * big archipelagos (ID, PH, JP, NZ) stay in, they're perfectly clickable.
 */
const HOT_COLD_EXCLUDED = new Set<ISOCountryCode>(
  SHAPE_UNFRIENDLY.filter(isoCode => !['ID', 'PH', 'JP', 'NZ'].includes(isoCode))
)

const getHotColdChallenge = ({ game }: { game: gameTypes.Game }): HotColdChallenge => {
  const pool = ISOCountryCodes.filter(isoCode => !HOT_COLD_EXCLUDED.has(isoCode))
  return {
    _type: 'hot-cold-challenge',
    country: pool[Math.floor(Math.random() * pool.length)],
    maximumGuesses: 8,
    maximumPoints: maximumRoundPoints(game),
  }
}

const getSketchChallenge = ({ game }: { game: gameTypes.Game }): SketchChallenge => ({
  _type: 'sketch-challenge',
  country: pickShapeFriendlyCountry(),
  maximumPoints: maximumRoundPoints(game),
})

/** Alliances big enough to host a hard-mode corridor run. */
const CORRIDOR_ORGANIZATIONS = ['nato', 'eu', 'au', 'oecd', 'bri']
const CORRIDOR_CHANCE_ON_HARD = 0.4

const getTraversalChallenge = ({
  game,
}: {
  game: gameTypes.Game
}): TraversalChallenge | undefined => {
  // Hard games sometimes restrict the run to an alliance corridor
  if (game.difficulty === 'hard' && Math.random() < CORRIDOR_CHANCE_ON_HARD) {
    const organizationId =
      CORRIDOR_ORGANIZATIONS[Math.floor(Math.random() * CORRIDOR_ORGANIZATIONS.length)]

    let organizationName = organizationId.toUpperCase()
    const members: ISOCountryCode[] = []
    for (const country of Object.values(COUNTRIES)) {
      const membership = country.membership?.find(entry => entry.id === organizationId)
      if (!membership) continue
      members.push(country.isoCode)
      organizationName = membership.name
    }
    // The source data mislabels NATO — patch until the generator is fixed
    if (organizationId === 'nato') organizationName = 'NATO'

    const within = new Set(members)
    const pick = pickTraversal(game.difficulty, game.variant, within)
    if (pick) {
      return {
        _type: 'traversal-challenge',
        ...pick,
        maximumClicks: pick.optimalHops + 4,
        maximumPoints: maximumRoundPoints(game),
        corridor: { id: organizationId, name: organizationName, members },
      }
    }
  }

  const pick = pickTraversal(game.difficulty, game.variant)
  if (!pick) return undefined

  return {
    _type: 'traversal-challenge',
    ...pick,
    maximumClicks: pick.optimalHops + 4,
    maximumPoints: maximumRoundPoints(game),
  }
}

/**
 * Deal the shared challenge for a round: always a ranking challenge for the
 * opening round (it doubles as the tutorial round), then a weighted mix of
 * every group mode. Modes that can't produce a viable prompt fall back to
 * a ranking round.
 */
export const getRoundChallenge = ({ game }: { game: gameTypes.Game }): RoundChallenge => {
  const forced = forcedRoundKind()
  const isFirstRound = game.rounds.length === 0
  const kind = forced ?? (isFirstRound ? 'ranking' : pickRoundKind())

  switch (kind) {
    case 'traversal': {
      const challenge = getTraversalChallenge({ game })
      if (challenge) return challenge
      break
    }
    case 'neighbour-blitz': {
      const challenge = getNeighbourBlitzChallenge({ game })
      if (challenge) return challenge
      break
    }
    case 'silhouette':
      return getSilhouetteChallenge({ game })
    case 'hot-cold':
      return getHotColdChallenge({ game })
    case 'sketch':
      return getSketchChallenge({ game })
  }

  return getGroupChallenge({ game })
}

/**
 * Score a traversal round from the player's full guess list (Travle rules):
 * the round is complete when the guessed countries bridge start → target,
 * and every guess beyond the minimum needed — mistakes and inefficient
 * choices alike — costs points. An unbridged guess set scores nothing.
 */
export const scoreTraversalSubmission = ({
  challenge,
  submittedGuesses,
}: {
  challenge: TraversalChallenge
  submittedGuesses: ISOCountryCode[]
}): { scored: number; maximum: number } => {
  const maximum = challenge.maximumPoints
  const within = challenge.corridor ? new Set(challenge.corridor.members) : undefined

  if (!isRouteComplete(challenge.start, challenge.target, submittedGuesses, within)) {
    return { scored: 0, maximum }
  }

  const minimumGuesses = Math.max(0, challenge.optimalHops - 1)
  const wastedGuesses = Math.max(0, submittedGuesses.length - minimumGuesses)
  return { scored: Math.max(2, maximum - wastedGuesses * 2), maximum }
}

/** Blitz: points scale with neighbours found; wrong names each cost one. */
export const scoreNeighbourBlitz = ({
  challenge,
  submittedGuesses,
}: {
  challenge: NeighbourBlitzChallenge
  submittedGuesses: ISOCountryCode[]
}): { scored: number; maximum: number } => {
  const maximum = challenge.maximumPoints
  const neighbourSet = new Set(challenge.neighbours)
  const unique = [...new Set(submittedGuesses)]
  const correct = unique.filter(isoCode => neighbourSet.has(isoCode)).length
  const wrong = unique.length - correct

  const raw = Math.round(maximum * (correct / challenge.neighbours.length)) - wrong
  return { scored: Math.max(0, Math.min(raw, maximum)), maximum }
}

/** Hot/cold: finding the country matters; every extra probe costs points. */
export const scoreHotCold = ({
  challenge,
  submittedGuesses,
}: {
  challenge: HotColdChallenge
  submittedGuesses: ISOCountryCode[]
}): { scored: number; maximum: number } => {
  const maximum = challenge.maximumPoints
  const found = submittedGuesses[submittedGuesses.length - 1] === challenge.country
  if (!found) return { scored: 0, maximum }

  const probes = submittedGuesses.length - 1
  return { scored: Math.max(2, maximum - probes * 2), maximum }
}

/**
 * Silhouette and sketch rounds are judged client-side (buzz timing, shape
 * similarity) — the server validates what it can and clamps the rest.
 */
export const clampClientScore = (
  clientScore: number | undefined,
  maximum: number,
  correct: boolean
): { scored: number; maximum: number } => {
  if (!correct) return { scored: 0, maximum }
  const scored = Math.round(clientScore ?? 0)
  return { scored: Math.max(0, Math.min(scored, maximum)), maximum }
}

export const getGroupChallenge = ({ game }: { game: gameTypes.Game }) => {
  const perPlayer = DIFFICULTY_CONFIGURATION[game.difficulty].rankingChallengeCountries
  const playerIds = Object.keys(game.players)
  const required = perPlayer * playerIds.length

  // Source data drifts between regenerations and some accessors end up with
  // little or no data — only ever deal a challenge that can fill the round,
  // otherwise players get a question with zero countries to rank.
  const viable = Object.values(GROUP_CHALLENGES).filter(challenge => {
    let available = 0
    for (const isoCode of ISOCountryCodes) {
      if (getValueByAccessorID(isoCode, challenge.id)) available++
      if (available >= required) return true
    }
    return false
  })

  if (!viable.length) {
    throw new EvalError('No group challenge has enough country data to fill a round')
  }

  const base = viable[Math.floor(Math.random() * viable.length)]

  const isoCodes = shuffleArray<ISOCountryCode>([...ISOCountryCodes]).filter(
    isoCode => !!getValueByAccessorID(isoCode, base.id)
  )

  // Clone — GROUP_CHALLENGES entries are module singletons shared across
  // every game and round on this server; mutating them bleeds state.
  const challenge: (typeof GROUP_CHALLENGES)[keyof typeof GROUP_CHALLENGES] = {
    ...base,
    countriesPerPlayer: {},
  }

  for (const playerId of playerIds) {
    challenge.countriesPerPlayer[playerId] = isoCodes.splice(0, perPlayer)
  }

  return challenge
}

// --- Individual challenge variants -----------------------------------------

const hexToRgb = (hex: string): [number, number, number] => {
  const value = hex.replace('#', '')
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ]
}

/** How alike two flags' identity palettes are (lower = more confusable). */
const flagPaletteDistance = (a: string[], b: string[]): number => {
  if (!a.length || !b.length) return Infinity
  let total = 0
  for (const colorA of a) {
    const [r1, g1, b1] = hexToRgb(colorA)
    let nearest = Infinity
    for (const colorB of b) {
      const [r2, g2, b2] = hexToRgb(colorB)
      nearest = Math.min(nearest, (r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2)
    }
    total += nearest
  }
  return total / a.length
}

/** Flag-pick: the real flag among the three most color-confusable decoys. */
const dealFlagPick = (country: ISOCountryCode): Partial<IndividualChallenge> => {
  const palette = COUNTRIES[country].identity?.colors ?? []
  const decoys = ISOCountryCodes.filter(isoCode => isoCode !== country)
    .map(isoCode => ({
      isoCode,
      distance: flagPaletteDistance(palette, COUNTRIES[isoCode].identity?.colors ?? []),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 8)

  const picked = shuffleArray(decoys)
    .slice(0, 3)
    .map(({ isoCode }) => isoCode)

  return { variant: 'flag-pick', options: shuffleArray([country, ...picked]) }
}

/** Odd-one-out: three countries share a property, `country` is the impostor. */
const dealOddOneOut = (
  difficulty: gameTypes.GameDifficulty
): { country: ISOCountryCode; oddOneOut: IndividualChallenge['oddOneOut'] } | undefined => {
  const kinds: ('region' | 'language' | 'organization')[] =
    difficulty === 'hard' ? ['region', 'language', 'organization'] : ['region', 'language']
  const kind = kinds[Math.floor(Math.random() * kinds.length)]

  const attempt = (): ReturnType<typeof dealOddOneOut> => {
    switch (kind) {
      case 'region': {
        const pool = shuffleArray([...ISOCountryCodes])
        const region = COUNTRIES[pool[0]].region
        const same = pool.filter(isoCode => COUNTRIES[isoCode].region === region).slice(0, 3)
        const odd = pool.find(isoCode => COUNTRIES[isoCode].region !== region)
        if (same.length < 3 || !odd) return undefined
        const label = region.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase())
        return {
          country: odd,
          oddOneOut: {
            countries: shuffleArray([...same, odd]),
            propertyLabel: `Three of these are in ${label}`,
          },
        }
      }
      case 'language': {
        const byLanguage = new Map<string, ISOCountryCode[]>()
        for (const isoCode of ISOCountryCodes) {
          for (const language of COUNTRIES[isoCode].languages ?? []) {
            byLanguage.set(language, [...(byLanguage.get(language) ?? []), isoCode])
          }
        }
        const candidates = shuffleArray([...byLanguage.entries()].filter(([, c]) => c.length >= 3))
        const entry = candidates[0]
        if (!entry) return undefined
        const [language, speakers] = entry
        const same = shuffleArray([...speakers]).slice(0, 3)
        const odd = shuffleArray([...ISOCountryCodes]).find(
          isoCode => !(COUNTRIES[isoCode].languages ?? []).includes(language)
        )
        if (!odd) return undefined
        return {
          country: odd,
          oddOneOut: {
            countries: shuffleArray([...same, odd]),
            propertyLabel: `Three of these share a language: ${language}`,
          },
        }
      }
      case 'organization': {
        const byOrganization = new Map<string, { name: string; members: ISOCountryCode[] }>()
        for (const isoCode of ISOCountryCodes) {
          for (const organization of COUNTRIES[isoCode].membership ?? []) {
            const bucket = byOrganization.get(organization.id) ?? {
              name: organization.id === 'nato' ? 'NATO' : organization.name.trim(),
              members: [],
            }
            bucket.members.push(isoCode)
            byOrganization.set(organization.id, bucket)
          }
        }
        const viableOrganizations = shuffleArray(
          [...byOrganization.entries()].filter(([, { members }]) => members.length >= 3)
        )
        const entry = viableOrganizations[0]
        if (!entry) return undefined
        const [organizationId, { name, members }] = entry
        const memberSet = new Set(members)
        const same = shuffleArray([...members]).slice(0, 3)
        const odd = shuffleArray([...ISOCountryCodes]).find(isoCode => !memberSet.has(isoCode))
        if (!odd) return undefined
        void organizationId
        return {
          country: odd,
          oddOneOut: {
            countries: shuffleArray([...same, odd]),
            propertyLabel: `Three of these are members of ${name}`,
          },
        }
      }
    }
  }

  return attempt()
}

/** Higher-lower: three stat duels with comfortably distinct values. */
const dealHigherLower = (): Pick<IndividualChallenge, 'higherLower'> | undefined => {
  const viableAccessors = shuffleArray(
    Object.values(GROUP_CHALLENGES).map(challenge => challenge.id)
  )

  for (const accessorId of viableAccessors) {
    const pool = shuffleArray(
      ISOCountryCodes.filter(isoCode => !!getValueByAccessorID(isoCode, accessorId))
    )
    const pairs: { a: ISOCountryCode; b: ISOCountryCode }[] = []

    for (let index = 0; index + 1 < pool.length && pairs.length < 3; index += 2) {
      const a = pool[index]
      const b = pool[index + 1]
      const valueA = getValueByAccessorID(a, accessorId)?.amount ?? 0
      const valueB = getValueByAccessorID(b, accessorId)?.amount ?? 0
      // Skip near-ties: stale data shouldn't decide a coin-flip question
      if (Math.min(valueA, valueB) === 0) continue
      if (Math.abs(valueA - valueB) / Math.max(valueA, valueB) < 0.15) continue
      pairs.push({ a, b })
    }

    if (pairs.length === 3) return { higherLower: { accessorId, pairs } }
  }

  return undefined
}

/** Leader-pick: who runs this country, millionaire-style (decoys same region). */
const dealLeaderPick = (): { country: ISOCountryCode; options: ISOCountryCode[] } | undefined => {
  const withLeaders = ISOCountryCodes.filter(isoCode => !!COUNTRIES[isoCode].government?.leader)
  if (withLeaders.length < 4) return undefined

  const country = withLeaders[Math.floor(Math.random() * withLeaders.length)]
  const region = COUNTRIES[country].region
  const regional = shuffleArray(
    withLeaders.filter(isoCode => isoCode !== country && COUNTRIES[isoCode].region === region)
  )
  const filler = shuffleArray(
    withLeaders.filter(isoCode => isoCode !== country && !regional.includes(isoCode))
  )
  const decoys = [...regional, ...filler].slice(0, 3)
  if (decoys.length < 3) return undefined

  return { country, options: shuffleArray([country, ...decoys]) }
}

/**
 * Deal an individual gate challenge. Each tile theme keeps the classic
 * find-on-the-map variant plus themed twists — the server validates every
 * variant identically (submitted ISO === challenge.country).
 */
/** Test hook: FORCE_INDIVIDUAL_VARIANT=<variant> makes every gate that variant. */
const forcedIndividualVariant = (): IndividualChallenge['variant'] | undefined => {
  if (typeof process === 'undefined') return undefined
  const forced = process.env?.FORCE_INDIVIDUAL_VARIANT
  return forced && ['find', 'flag-pick', 'odd-one-out', 'higher-lower', 'leader-pick'].includes(forced)
    ? (forced as IndividualChallenge['variant'])
    : undefined
}

export const getIndividualChallenge = ({
  accessorId,
  difficulty = 'normal',
}: {
  accessorId: IndividualChallengeAccessorId
  difficulty?: gameTypes.GameDifficulty
}): IndividualChallenge => {
  const base: IndividualChallenge = {
    _type: 'individual-challenge',
    id: accessorId,
    country: getRandomISOCountryCode('large'),
    variant: 'find',
  }

  const forced = forcedIndividualVariant()
  if (forced) {
    switch (forced) {
      case 'flag-pick':
        return { ...base, ...dealFlagPick(base.country) }
      case 'odd-one-out': {
        const dealt = dealOddOneOut(difficulty)
        if (dealt) return { ...base, variant: 'odd-one-out', ...dealt }
        break
      }
      case 'higher-lower': {
        const dealt = dealHigherLower()
        if (dealt) return { ...base, variant: 'higher-lower', ...dealt }
        break
      }
      case 'leader-pick': {
        const dealt = dealLeaderPick()
        if (dealt) return { ...base, variant: 'leader-pick', ...dealt }
        break
      }
    }
    return base
  }

  const roll = Math.random()
  switch (accessorId) {
    case 'flag': {
      if (roll < 0.5) return { ...base, ...dealFlagPick(base.country) }
      break
    }
    case 'isoCode': {
      if (roll < 0.5) {
        const dealt = dealOddOneOut(difficulty)
        if (dealt) return { ...base, variant: 'odd-one-out', ...dealt }
      }
      break
    }
    case 'capital.name': {
      if (roll < 0.34) {
        const dealt = dealHigherLower()
        if (dealt) return { ...base, variant: 'higher-lower', ...dealt }
      } else if (roll < 0.67) {
        const dealt = dealLeaderPick()
        if (dealt) return { ...base, variant: 'leader-pick', ...dealt }
      }
      break
    }
  }

  return base
}

/**
 * Returns client side challenge details like question copy and presentational attributes
 */
export const getChallengeDetails = (
  accessorID: IndividualChallengeAccessorId | GroupChallengeAccessorId
): ChallengeConfiguration => {
  const challenges: {
    [key in IndividualChallengeAccessorId | GroupChallengeAccessorId]: ChallengeConfiguration
  } = {
    'economics.gdpPerCapita': {
      topic: 'economics',
      phrasing: 'Rank the following countries by GDP per capita',
      markers: DEFAULT_CHALLENGE_MARKERS,
    },
    'economics.militarySpending': {
      topic: 'economics',
      phrasing: 'Rank these countries by military spending',
      markers: DEFAULT_CHALLENGE_MARKERS,
    },
    'economics.populationBelowPovertyLine': {
      topic: 'economics',
      phrasing: 'Rank the following countries by the proportion of people under the poverty line',
      markers: DEFAULT_CHALLENGE_MARKERS,
    },
    'economics.equality': {
      topic: 'economics',
      phrasing: 'Rank these countries by the level of economic inequality',
      markers: {
        most: 'unequal',
        least: 'equal',
      },
    },
    'geography.area.land': {
      topic: 'geography',
      phrasing: 'Rank these countries by land area',
      markers: {
        most: 'largest area',
        least: 'smallest area',
      },
    },
    'geography.area.water': {
      topic: 'geography',
      phrasing: 'Rank these countries by amount of surface water',
      markers: {
        most: 'largest area',
        least: 'smallest area',
      },
    },
    'geography.area.total': {
      topic: 'geography',
      phrasing: 'Rank these countries by land area',
      markers: {
        most: 'largest area',
        least: 'smallest area',
      },
    },
    'geography.area.arable': {
      topic: 'geography',
      phrasing: 'Rank these countries by area of arable land',
      markers: {
        most: 'largest area',
        least: 'smallest area',
      },
    },
    'geography.area.forested': {
      topic: 'geography',
      phrasing: 'Rank these countries by area of forested land',
      markers: {
        most: 'largest area',
        least: 'smallest area',
      },
    },
    'geography.highestPeak': {
      topic: 'geography',
      phrasing: 'Rank these countries by highest mountain',
      markers: {
        most: 'highest mountain',
        least: 'shortest mountain',
      },
    },
    'unemployment.youth': {
      topic: 'unemployment',
      phrasing: 'Rank these countries by levels of youth unemployment',
      markers: {
        most: 'highest percent',
        least: 'lowest percent',
      },
    },
    'unemployment.total': {
      topic: 'unemployment',
      phrasing: 'Rank these countries by levels of unemployment',
      markers: {
        most: 'highest percent',
        least: 'lowest percent',
      },
    },
    'infrastructure.roads': {
      topic: 'infrastructure',
      phrasing: 'Rank these countries by roadways (paved and unpaved)',
      markers: {
        most: 'most kilometers',
        least: 'fewest kilometers',
      },
    },
    'infrastructure.rail': {
      topic: 'infrastructure',
      phrasing: 'Rank these countries by railways',
      markers: {
        most: 'most kilometers',
        least: 'fewest kilometers',
      },
    },
    'gender.womenInParliament': {
      topic: 'gender',
      phrasing: 'Rank these countries by women in parliament',
      markers: {
        most: 'highest percent',
        least: 'lowest percent',
      },
    },
    'gender.motherMeanAgeAtBirth': {
      topic: 'gender',
      phrasing: 'Rank these countries by the mean age of birth at which women give birth',
      markers: {
        most: 'oldest',
        least: 'youngest',
      },
    },
    'health.obesity': {
      topic: 'health',
      phrasing: 'Rank these countries by obesity',
      markers: {
        most: 'highest percent',
        least: 'lowest percent',
      },
    },
    'people.lifeExpectancy': {
      topic: 'people',
      phrasing: 'Rank these countries by average life expectancy at birth',
      markers: {
        most: 'oldest',
        least: 'youngest',
      },
    },
    'people.medianAge': {
      topic: 'people',
      phrasing: 'Rank these countries by median age',
      markers: {
        most: 'oldest',
        least: 'youngest',
      },
    },
    'people.childrenPerWoman': {
      topic: 'people',
      phrasing: 'Rank these countries by the average number of children per women',
      markers: {
        most: 'most children',
        least: 'fewest children',
      },
    },
    'education.literacy': {
      topic: 'education',
      phrasing: 'Rank these countries by literacy',
      markers: {
        most: 'highest percent',
        least: 'lowest percent',
      },
    },
    'education.averageYearsOfStudy': {
      topic: 'education',
      phrasing: 'Rank these countries by average years of study',
      markers: {
        most: 'highest percent',
        least: 'lowest percent',
      },
    },
    'health.doctors': {
      topic: 'health',
      phrasing: 'Rank these countries by number of doctors per capita',
      markers: {
        most: 'most doctors',
        least: 'fewest doctors',
      },
    },
    'health.hospitalBeds': {
      topic: 'health',
      phrasing: 'Rank these countries by number of hospital beds per capita',
      markers: {
        most: 'most beds',
        least: 'fewest beds',
      },
    },
    'health.accessToContraceptives': {
      topic: 'health',
      phrasing: 'Rank these countries by access to contraceptives',
      markers: {
        most: 'highest percent',
        least: 'lowest percent',
      },
    },
    'religion.atheism': {
      topic: 'religion',
      phrasing: 'Rank these countries by atheism',
      markers: {
        most: 'highest percent',
        least: 'lowest percent',
      },
    },
    'religion.believers': {
      topic: 'religion',
      phrasing: 'Rank these countries by believers (of any religion)',
      markers: {
        most: 'highest percent',
        least: 'lowest percent',
      },
    },
    'environment.CO2Emissions': {
      topic: 'environment',
      phrasing: 'Rank these countries by CO2 emissions',
      markers: {
        most: 'highest CO2 emissions',
        least: 'lowest CO2 emissions',
      },
    },
    'environment.renewables': {
      topic: 'environment',
      phrasing: 'Rank these countries by percent renewable energy in their national energy mix',
      markers: {
        most: 'highest percent',
        least: 'lowest percent',
      },
    },
    'humanRights.gayMarriageLegalized': {
      topic: 'human rights',
      phrasing: 'Rank these countries by year gay marriage was legalized',
      markers: {
        most: 'latest',
        least: 'earliest',
      },
    },
    // Individual challenges
    'capital.name': {
      topic: 'general knowledge',
      phrasing: 'What country has {capital} as its capital?',
    },
    flag: {
      topic: 'general knowledge',
      phrasing: 'Which country does this flag represent?',
    },
    isoCode: {
      topic: 'general knowledge',
      phrasing: 'Where on the map is {countryName}?',
    },
    'infrastructure.internetAccess': {
      topic: 'infrastructure',
      phrasing: 'Rank these countries by internet access',
    },
    'people.population': {
      topic: 'people',
      phrasing: 'Which of these countries have the largest populations?',
    },
    'people.populationGrowthRate': {
      topic: 'people',
      phrasing: 'Rank the following by population growth rate',
    },
    'health.lifeExpectancy': {
      topic: 'health',
      phrasing: 'Rank the following by life expectancy.',
    },
    'health.tobaccoUse': {
      topic: 'health',
      phrasing: 'Rank the following by tobacco use',
    },
    'health.alcoholConsumption': {
      topic: 'health',
      phrasing: 'Rank the following by alcohol consumption',
    },
    'humanRights.refugees': {
      topic: 'human rights',
      phrasing: 'Rank the following countries by their refugee populations',
    },
  }

  return challenges[accessorID]
}

export const getCorrectRanking = ({
  groupChallengeAccessorId,
  isoCodes,
}: {
  groupChallengeAccessorId: GroupChallengeAccessorId
  isoCodes: ISOCountryCode[]
}) => {
  const amounts: { value: Amount<any>; isoCode: ISOCountryCode }[] = []
  for (const isoCode of isoCodes) {
    const amount = getValueByAccessorID(isoCode, groupChallengeAccessorId)
    if (!amount) {
      console.warn('Unfiltered amount found', groupChallengeAccessorId, isoCode)
      continue
    }

    amounts.push({ value: amount, isoCode })
  }

  const sorted = amounts.sort((a, b) => b.value.amount - a.value.amount)

  return sorted.map(value => value.isoCode)
}

export const scoreChallengeSubmission = ({
  groupChallengeAccessorId,
  submittedRanking,
}: {
  groupChallengeAccessorId: GroupChallengeAccessorId
  submittedRanking: ISOCountryCode[]
}): {
  scored: number
  maximum: number
} => {
  let accruedPoints = 0
  const correctRanking = getCorrectRanking({ groupChallengeAccessorId, isoCodes: submittedRanking })
  for (const [index, isoCode] of correctRanking.entries()) {
    for (let offset = 0; offset < MAXIMUM_SCORE_PER_COUNTRY; offset++) {
      const points = MAXIMUM_SCORE_PER_COUNTRY - offset
      const earlier = submittedRanking[index - offset]
      if (earlier === isoCode) {
        accruedPoints += points
        break
      }

      if (index === 0) {
        continue
      }

      const later = submittedRanking[index + offset]
      if (later === isoCode) {
        accruedPoints += points
        break
      }
    }
  }

  return {
    scored: accruedPoints,
    maximum: submittedRanking.length * MAXIMUM_SCORE_PER_COUNTRY,
  }
}
