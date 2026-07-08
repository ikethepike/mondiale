import { BORDERS } from '~~/data/borders.gen'
import { COUNTRIES } from '~~/data/countries.gen'
import { ISOCountryCodes } from '~~/data/iso-codes.gen'
import { LEADERS } from '~~/data/leaders.gen'
import { hexToRgb, sameSimplifiedPalette } from '~~/lib/palette'
import type { ChallengeConfiguration } from '~~/types/challenge.type'
import {
  type GroupChallengeAccessorId,
  GROUP_CHALLENGES,
} from '~~/types/challenges/group-challenge.type'
import type {
  HotColdChallenge,
  NameWaterChallenge,
  NeighbourBlitzChallenge,
  SilhouetteChallenge,
  SketchChallenge,
  StatDetectiveChallenge,
  TwoTruthsChallenge,
  WaterBlitzChallenge,
  WaterFeatureKind,
} from '~~/types/challenges/group-modes.type'
import { individualChallengeVariants } from '~~/types/challenges/individual-challenge.type'
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
import { isRouteComplete, pickTraversal } from './traversal'
import { getValueByAccessorID } from './values'
import { variantCountries } from './variant'

const MAXIMUM_SCORE_PER_COUNTRY = 3

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
  ['ranking', 0.2],
  ['traversal', 0.13],
  ['neighbour-blitz', 0.1],
  ['silhouette', 0.09],
  ['hot-cold', 0.09],
  ['sketch', 0.07],
  ['stat-detective', 0.1],
  ['two-truths', 0.07],
  ['river-run', 0.06],
  ['shared-shores', 0.05],
  ['name-that-water', 0.04],
  ['highlands', 0.08],
]

/** Round kinds reserved for hard games. */
const HARD_ONLY_ROUND_KINDS = new Set<RoundChallengeKind>(['highlands', 'name-that-water'])

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

const pickRoundKind = (game: gameTypes.Game): RoundChallengeKind => {
  const weights = ROUND_WEIGHTS.filter(
    ([kind]) => game.difficulty === 'hard' || !HARD_ONLY_ROUND_KINDS.has(kind)
  )
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0)
  let roll = Math.random() * total
  for (const [kind, weight] of weights) {
    roll -= weight
    if (roll <= 0) return kind
  }
  return 'ranking'
}

/** Countries whose outlines are dominated by scattered islands — no fun to
 * draw or to watch materialize; excluded from shape-centric modes. */
const SHAPE_UNFRIENDLY: ISOCountryCode[] = [
  'ID',
  'PH',
  'JP',
  'NZ',
  'FJ',
  'SB',
  'VU',
  'TO',
  'TV',
  'KI',
  'FM',
  'PW',
  'NR',
  'MV',
  'SC',
  'KM',
  'CV',
  'ST',
  'BS',
  'AG',
  'BB',
  'DM',
  'GD',
  'KN',
  'LC',
  'TT',
  'MU',
  'MT',
  'SG',
  'BH',
  'HK',
  'VA',
  'MC',
  'SM',
  'AD',
  'LI',
  'LU',
]

const pickShapeFriendlyCountry = (candidates: ISOCountryCode[]): ISOCountryCode => {
  const excluded = new Set(SHAPE_UNFRIENDLY)
  const filter = (isoCodes: ISOCountryCode[]) =>
    isoCodes.filter(isoCode => {
      if (excluded.has(isoCode)) return false
      const area = COUNTRIES[isoCode].geography.area.land
      return !!area && area.amount > 20
    })

  // A variant pool that filters down to nothing falls back to the world
  const pool = filter(candidates)
  const viable = pool.length ? pool : filter([...ISOCountryCodes])
  return viable[Math.floor(Math.random() * viable.length)]
}

/** Mirror of getRandomISOCountryCode('large'), scoped to a country pool. */
const pickLargeCountry = (pool: ISOCountryCode[]): ISOCountryCode => {
  const shuffled = shuffleArray([...pool])
  return (
    shuffled.find(isoCode => {
      const area = COUNTRIES[isoCode].geography.area.total
      return !!area && area.amount > 400
    }) ?? shuffled[0]
  )
}

const getNeighbourBlitzChallenge = ({
  game,
}: {
  game: gameTypes.Game
}): NeighbourBlitzChallenge | undefined => {
  const pool = shuffleArray(
    variantCountries(game.variant).filter(isoCode => (BORDERS[isoCode]?.length ?? 0) >= 4)
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
  country: pickShapeFriendlyCountry(variantCountries(game.variant)),
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
  const candidates = variantCountries(game.variant).filter(
    isoCode => !HOT_COLD_EXCLUDED.has(isoCode)
  )
  const pool = candidates.length
    ? candidates
    : ISOCountryCodes.filter(isoCode => !HOT_COLD_EXCLUDED.has(isoCode))
  return {
    _type: 'hot-cold-challenge',
    country: pool[Math.floor(Math.random() * pool.length)],
    maximumGuesses: 8,
    maximumPoints: maximumRoundPoints(game),
  }
}

const getSketchChallenge = ({ game }: { game: gameTypes.Game }): SketchChallenge => ({
  _type: 'sketch-challenge',
  country: pickShapeFriendlyCountry(variantCountries(game.variant)),
  maximumPoints: maximumRoundPoints(game),
})

/** How alike two values may be before a claim stops being decidable. */
const LIE_MINIMUM_GAP = 0.4
const LIE_MINIMUM_YEAR_GAP = 8

/**
 * Stat detective: a mystery country's stats reveal one by one. Only the
 * accessor ids travel — clients read the values from the shared dataset.
 */
const getStatDetectiveChallenge = ({
  game,
}: {
  game: gameTypes.Game
}): StatDetectiveChallenge | undefined => {
  const CLUE_COUNT = 6
  const pool = shuffleArray(variantCountries(game.variant))

  for (const country of pool.slice(0, 40)) {
    const viable = shuffleArray(
      Object.values(GROUP_CHALLENGES)
        .map(challenge => challenge.id)
        .filter(accessorId => !!getValueByAccessorID(country, accessorId))
    )
    if (viable.length < CLUE_COUNT) continue

    return {
      _type: 'stat-detective-challenge',
      country,
      clues: viable.slice(0, CLUE_COUNT),
      secondsPerClue: 8,
      maximumPoints: maximumRoundPoints(game),
    }
  }

  return undefined
}

/**
 * Two truths and a lie: three stat claims about one country, one of them
 * carrying another country's value. The lie is honest — a real value from a
 * real country, just the wrong one — and must differ enough to be decidable.
 */
const getTwoTruthsChallenge = ({
  game,
}: {
  game: gameTypes.Game
}): TwoTruthsChallenge | undefined => {
  const pool = variantCountries(game.variant)

  for (const country of shuffleArray([...pool]).slice(0, 40)) {
    const accessors = shuffleArray(
      Object.values(GROUP_CHALLENGES)
        .map(challenge => challenge.id)
        .filter(accessorId => !!getValueByAccessorID(country, accessorId))
    )
    if (accessors.length < 3) continue

    const chosen = accessors.slice(0, 3)
    const lieIndex = Math.floor(Math.random() * chosen.length)
    const lieAccessor = chosen[lieIndex]
    const truth = getValueByAccessorID(country, lieAccessor)
    if (!truth) continue

    // Decoys prefer the variant pool but a lie may come from anywhere
    const lieSource = shuffleArray([...pool, ...ISOCountryCodes]).find(isoCode => {
      if (isoCode === country) return false
      const candidate = getValueByAccessorID(isoCode, lieAccessor)
      if (!candidate) return false
      if (candidate.unit === 'year') {
        return Math.abs(candidate.amount - truth.amount) >= LIE_MINIMUM_YEAR_GAP
      }
      const scale = Math.max(Math.abs(candidate.amount), Math.abs(truth.amount))
      return scale > 0 && Math.abs(candidate.amount - truth.amount) / scale >= LIE_MINIMUM_GAP
    })
    if (!lieSource) continue

    const statements = chosen.map((accessorId, index) => {
      const source = getValueByAccessorID(index === lieIndex ? lieSource : country, accessorId)
      return {
        accessorId,
        amount: source?.amount ?? 0,
        unit: source?.unit ?? '',
      }
    })

    return {
      _type: 'two-truths-challenge',
      country,
      statements,
      lieIndex,
      lieSource,
      maximumPoints: maximumRoundPoints(game),
    }
  }

  return undefined
}

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
    const variantPool = new Set(variantCountries(game.variant))
    const members: ISOCountryCode[] = []
    for (const country of Object.values(COUNTRIES)) {
      const membership = country.membership?.find(entry => entry.id === organizationId)
      if (!membership) continue
      // On a continental board the corridor is the alliance's local wing
      if (!variantPool.has(country.isoCode)) continue
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
 * Water modes deal from the generated physical-geography dataset. It's a
 * dynamic import on purpose: only nitro ever runs the dealers, and the
 * dataset (~½ MB gzipped) must not ride along into client bundles through
 * this module's other exports. Clients that need geometry lazy-load it too.
 */
const waterFeaturePool = async (game: gameTypes.Game, kinds: WaterFeatureKind[]) => {
  const { WATER_FEATURES } = await import('~~/data/water.gen')
  const pool = new Set(variantCountries(game.variant))

  return Object.values(WATER_FEATURES).filter(feature => {
    if (!kinds.includes(feature.kind)) return false
    // The feature must belong to the board being played: at least two
    // playable countries on the variant, and not mostly off-map
    const onBoard = feature.countries.filter(isoCode => pool.has(isoCode))
    return onBoard.length >= 2 && onBoard.length >= feature.countries.length / 3
  })
}

/** More touching countries = a longer clock. */
const waterBlitzDuration = (countries: number) => Math.min(75, 20 + countries * 6)

const getWaterBlitzChallenge = async (
  game: gameTypes.Game,
  kinds: WaterFeatureKind[]
): Promise<WaterBlitzChallenge | undefined> => {
  const candidates = (await waterFeaturePool(game, kinds)).filter(
    feature => feature.countries.length >= (kinds.includes('river') ? 3 : 3)
  )
  const feature = candidates[Math.floor(Math.random() * candidates.length)]
  if (!feature) return undefined

  return {
    _type: 'water-blitz-challenge',
    featureId: feature.id,
    featureName: feature.name,
    kind: feature.kind,
    countries: feature.countries,
    durationSeconds: waterBlitzDuration(feature.countries.length),
    maximumPoints: maximumRoundPoints(game),
  }
}

const getNameWaterChallenge = async (
  game: gameTypes.Game
): Promise<NameWaterChallenge | undefined> => {
  const candidates = await waterFeaturePool(game, ['sea', 'lake'])
  const feature = candidates[Math.floor(Math.random() * candidates.length)]
  if (!feature) return undefined

  return {
    _type: 'name-water-challenge',
    featureId: feature.id,
    featureName: feature.name,
    kind: feature.kind,
    countries: feature.countries,
    maximumPoints: maximumRoundPoints(game),
  }
}

/** Blitz-family scoring: found ratio scales the pot, wrong guesses bite it. */
export const scoreWaterBlitz = ({
  challenge,
  submittedGuesses,
}: {
  challenge: WaterBlitzChallenge
  submittedGuesses: ISOCountryCode[]
}): { scored: number; maximum: number } => {
  const answers = new Set(challenge.countries)
  const unique = [...new Set(submittedGuesses)]
  const correct = unique.filter(isoCode => answers.has(isoCode)).length
  const wrong = unique.length - correct

  const scored = Math.max(
    0,
    Math.round((challenge.maximumPoints * correct) / challenge.countries.length) - wrong
  )
  return { scored, maximum: challenge.maximumPoints }
}

/**
 * Deal the shared challenge for a round: always a ranking challenge for the
 * opening round (it doubles as the tutorial round), then a weighted mix of
 * every group mode. Modes that can't produce a viable prompt fall back to
 * a ranking round.
 */
export const getRoundChallenge = async ({
  game,
}: {
  game: gameTypes.Game
}): Promise<RoundChallenge> => {
  const forced = forcedRoundKind()
  const isFirstRound = game.rounds.length === 0
  const kind = forced ?? (isFirstRound ? 'ranking' : pickRoundKind(game))

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
    case 'stat-detective': {
      const challenge = getStatDetectiveChallenge({ game })
      if (challenge) return challenge
      break
    }
    case 'two-truths': {
      const challenge = getTwoTruthsChallenge({ game })
      if (challenge) return challenge
      break
    }
    case 'river-run': {
      const challenge = await getWaterBlitzChallenge(game, ['river'])
      if (challenge) return challenge
      break
    }
    case 'shared-shores': {
      const challenge = await getWaterBlitzChallenge(game, ['sea', 'lake'])
      if (challenge) return challenge
      break
    }
    case 'highlands': {
      const challenge = await getWaterBlitzChallenge(game, ['range', 'desert', 'plateau'])
      if (challenge) return challenge
      break
    }
    case 'name-that-water': {
      const challenge = await getNameWaterChallenge(game)
      if (challenge) return challenge
      break
    }
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
  const playerIds = Object.keys(game.players)
  const pool = variantCountries(game.variant)

  // Continental pools are small — a full lobby on hard could ask for more
  // countries than the continent has data for. Shrink the hand per player
  // rather than refusing to deal (never below a rankable three).
  const configured = DIFFICULTY_CONFIGURATION[game.difficulty].rankingChallengeCountries
  const perPlayer = Math.max(3, Math.min(configured, Math.floor(pool.length / playerIds.length)))
  const required = perPlayer * playerIds.length

  // Source data drifts between regenerations and some accessors end up with
  // little or no data — only ever deal a challenge that can fill the round,
  // otherwise players get a question with zero countries to rank.
  const viable = Object.values(GROUP_CHALLENGES).filter(challenge => {
    let available = 0
    for (const isoCode of pool) {
      if (getValueByAccessorID(isoCode, challenge.id)) available++
      if (available >= required) return true
    }
    return false
  })

  if (!viable.length) {
    throw new EvalError('No group challenge has enough country data to fill a round')
  }

  const base = viable[Math.floor(Math.random() * viable.length)]

  const isoCodes = shuffleArray<ISOCountryCode>([...pool]).filter(
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

/**
 * Pick `count` distractor countries for a pick-the-country challenge. One
 * helper for every gate that needs plausible decoys, so the "prefer same
 * region, then filler, widen when the board is too small" logic lives once.
 *
 *  - `eligible`   — a country may be a decoy (e.g. has a leader / a portrait /
 *                   shares a flag palette). Applied to `pool` AND the widen set.
 *  - `similarity` — lower = more confusable; when given, the shortlist is the
 *                   most-similar candidates (flag-pick's colour distance), then
 *                   randomised. Takes precedence over `preferRegion`.
 *  - `preferRegion` — put same-region candidates first, then the rest.
 *
 * Returns `undefined` when even the world pool can't supply `count` — callers
 * fall back (skip the variant) rather than deal an unanswerable board.
 */
const pickDecoys = (
  country: ISOCountryCode,
  pool: ISOCountryCode[],
  count: number,
  opts: {
    preferRegion?: boolean
    similarity?: (candidate: ISOCountryCode) => number
    eligible?: (isoCode: ISOCountryCode) => boolean
    /** How many nearest-by-similarity to shuffle among (flag-pick used 8). */
    similarityShortlist?: number
  } = {}
): ISOCountryCode[] | undefined => {
  const eligible = (list: ISOCountryCode[]) =>
    list.filter(isoCode => isoCode !== country && (opts.eligible?.(isoCode) ?? true))

  // Widen to the whole world when the board pool can't fill the table.
  let candidates = eligible(pool)
  if (candidates.length < count) candidates = eligible([...ISOCountryCodes])
  if (candidates.length < count) return undefined

  if (opts.similarity) {
    const shortlist = [...candidates]
      .sort((a, b) => opts.similarity!(a) - opts.similarity!(b))
      .slice(0, Math.max(count, opts.similarityShortlist ?? 8))
    return shuffleArray(shortlist).slice(0, count)
  }

  if (opts.preferRegion) {
    const region = COUNTRIES[country].region
    const regional = shuffleArray(candidates.filter(isoCode => COUNTRIES[isoCode].region === region))
    const filler = shuffleArray(candidates.filter(isoCode => !regional.includes(isoCode)))
    return [...regional, ...filler].slice(0, count)
  }

  return shuffleArray(candidates).slice(0, count)
}

/** Flag-pick: the real flag among the three most colour-confusable decoys. */
const dealFlagPick = (
  country: ISOCountryCode,
  pool: ISOCountryCode[]
): Partial<IndividualChallenge> | undefined => {
  const palette = COUNTRIES[country].identity?.colors ?? []
  const decoys = pickDecoys(country, pool, 3, {
    similarity: isoCode => flagPaletteDistance(palette, COUNTRIES[isoCode].identity?.colors ?? []),
  })
  if (!decoys) return undefined

  return { variant: 'flag-pick', options: shuffleArray([country, ...decoys]) }
}

/**
 * Flag-twins: the real flag among decoys that share its EXACT simplified
 * palette — Poland vs Indonesia/Monaco/Singapore (all red+white), or the
 * Gran-Colombia tricolours. Harder than flag-pick (which uses fuzzy RGB
 * distance) because the confusables are genuine palette-identical siblings.
 * Only deals from flags with a usable palette; needs ≥3 same-palette twins
 * (pickDecoys widens to the world pool if the board hasn't enough).
 */
const dealFlagTwins = (
  country: ISOCountryCode,
  pool: ISOCountryCode[]
): { country: ISOCountryCode; options: ISOCountryCode[]; variant: 'flag-twins' } | undefined => {
  // The subject needs a usable palette AND ≥3 palette-twins. If the passed
  // country is an emblem flag (empty palette), pick one that qualifies rather
  // than bailing — keeps the variant dealable and FORCE testing reliable.
  const hasPaletteTwins = (isoCode: ISOCountryCode): boolean => {
    const palette = COUNTRIES[isoCode].identity.simplifiedColors
    if (!palette.length) return false
    let twins = 0
    for (const other of ISOCountryCodes) {
      if (other === isoCode) continue
      if (sameSimplifiedPalette(palette, COUNTRIES[other].identity.simplifiedColors)) twins++
      if (twins >= 3) return true
    }
    return false
  }

  const subject = hasPaletteTwins(country)
    ? country
    : shuffleArray(pool).find(hasPaletteTwins) ??
      shuffleArray([...ISOCountryCodes]).find(hasPaletteTwins)
  if (!subject) return undefined

  const palette = COUNTRIES[subject].identity.simplifiedColors
  const decoys = pickDecoys(subject, pool, 3, {
    eligible: isoCode =>
      sameSimplifiedPalette(palette, COUNTRIES[isoCode].identity.simplifiedColors),
  })
  if (!decoys) return undefined

  return { variant: 'flag-twins', country: subject, options: shuffleArray([subject, ...decoys]) }
}

/**
 * Border-detective: name the mystery country from its neighbours' flags, shown
 * as a ring around an empty centre. Picks a country with 3–6 neighbours (a
 * solvable ring — too few is ambiguous, too many is a wall of flags), all of
 * which must be on the board so their flags render. `country` is the hidden
 * answer; `neighbours` is the ring.
 */
const BORDER_DETECTIVE_MIN = 3
const BORDER_DETECTIVE_MAX = 6
const dealBorderDetective = (
  pool: ISOCountryCode[]
): { country: ISOCountryCode; neighbours: ISOCountryCode[] } | undefined => {
  const onBoard = new Set(pool)
  const eligible = (candidatePool: ISOCountryCode[]) =>
    shuffleArray(candidatePool).find(isoCode => {
      const neighbours = (BORDERS[isoCode] ?? []).filter(
        (border): border is ISOCountryCode => onBoard.has(border as ISOCountryCode)
      )
      return neighbours.length >= BORDER_DETECTIVE_MIN && neighbours.length <= BORDER_DETECTIVE_MAX
    })

  // Prefer an on-board subject; widen to the world if the continent is too sparse.
  const country = eligible(pool) ?? eligible([...ISOCountryCodes])
  if (!country) return undefined

  const neighbours = (BORDERS[country] ?? []).filter(
    (border): border is ISOCountryCode => onBoard.has(border as ISOCountryCode)
  )
  return { country, neighbours: shuffleArray(neighbours) }
}

/** Odd-one-out: three countries share a property, `country` is the impostor. */
const dealOddOneOut = (
  difficulty: gameTypes.GameDifficulty,
  countryPool: ISOCountryCode[]
): { country: ISOCountryCode; oddOneOut: IndividualChallenge['oddOneOut'] } | undefined => {
  // A single-continent board makes "three share a region" unanswerable —
  // everything shares the region. Those games ask about language (and, on
  // hard, alliances) instead.
  const isWorld = countryPool.length === ISOCountryCodes.length
  const kinds: ('region' | 'language' | 'organization')[] = isWorld
    ? ['region', 'language']
    : ['language']
  if (difficulty === 'hard') kinds.push('organization')
  const kind = kinds[Math.floor(Math.random() * kinds.length)]

  const attempt = (): ReturnType<typeof dealOddOneOut> => {
    switch (kind) {
      case 'region': {
        const pool = shuffleArray([...countryPool])
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
        for (const isoCode of countryPool) {
          for (const language of COUNTRIES[isoCode].languages ?? []) {
            byLanguage.set(language, [...(byLanguage.get(language) ?? []), isoCode])
          }
        }
        const candidates = shuffleArray([...byLanguage.entries()].filter(([, c]) => c.length >= 3))
        const entry = candidates[0]
        if (!entry) return undefined
        const [language, speakers] = entry
        const same = shuffleArray([...speakers]).slice(0, 3)
        const odd = shuffleArray([...countryPool]).find(
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
        for (const isoCode of countryPool) {
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
        const odd = shuffleArray([...countryPool]).find(isoCode => !memberSet.has(isoCode))
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

/** Gauntlet length: harder games demand a longer streak to pass the gate. */
const HIGHER_LOWER_DUELS: { [difficulty in gameTypes.GameDifficulty]: number } = {
  easy: 2,
  normal: 3,
  hard: 4,
}

/** Higher-lower: a streak of stat duels with comfortably distinct values. */
const dealHigherLower = (
  difficulty: gameTypes.GameDifficulty,
  countryPool: ISOCountryCode[]
): Pick<IndividualChallenge, 'higherLower'> | undefined => {
  const duels = HIGHER_LOWER_DUELS[difficulty]
  const viableAccessors = shuffleArray(
    Object.values(GROUP_CHALLENGES).map(challenge => challenge.id)
  )

  // Small continental pools may not carry enough clean data for a full
  // streak on any stat — widen to the world before giving up on the variant
  for (const candidates of [countryPool, [...ISOCountryCodes]]) {
    for (const accessorId of viableAccessors) {
      const pool = shuffleArray(
        candidates.filter(isoCode => !!getValueByAccessorID(isoCode, accessorId))
      )
      const pairs: { a: ISOCountryCode; b: ISOCountryCode }[] = []

      for (let index = 0; index + 1 < pool.length && pairs.length < duels; index += 2) {
        const a = pool[index]
        const b = pool[index + 1]
        const valueA = getValueByAccessorID(a, accessorId)?.amount ?? 0
        const valueB = getValueByAccessorID(b, accessorId)?.amount ?? 0
        // Skip near-ties: stale data shouldn't decide a coin-flip question
        if (Math.min(valueA, valueB) === 0) continue
        if (Math.abs(valueA - valueB) / Math.max(valueA, valueB) < 0.15) continue
        pairs.push({ a, b })
      }

      if (pairs.length === duels) return { higherLower: { accessorId, pairs } }
    }
  }

  return undefined
}

/** Leader-pick: who runs this country, millionaire-style (decoys same region). */
const dealLeaderPick = (
  countryPool: ISOCountryCode[]
): { country: ISOCountryCode; options: ISOCountryCode[] } | undefined => {
  const poolLeaders = countryPool.filter(isoCode => !!COUNTRIES[isoCode].government?.leader)
  const withLeaders =
    poolLeaders.length >= 4
      ? poolLeaders
      : ISOCountryCodes.filter(isoCode => !!COUNTRIES[isoCode].government?.leader)
  if (withLeaders.length < 4) return undefined

  const country = withLeaders[Math.floor(Math.random() * withLeaders.length)]
  const decoys = pickDecoys(country, withLeaders, 3, {
    preferRegion: true,
    eligible: isoCode => !!COUNTRIES[isoCode].government?.leader,
  })
  if (!decoys) return undefined

  return { country, options: shuffleArray([country, ...decoys]) }
}

const LEADER_TITLE_NOISE = new Set([
  'the',
  'king',
  'queen',
  'president',
  'prime',
  'minister',
  'chancellor',
  'taoiseach',
  'interim',
  'caretaker',
  'transition',
  'transitional',
  'general',
  'leader',
])

/** Name tokens robust to titles, diacritics and punctuation. */
const leaderNameTokens = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z]+/)
    .filter(token => token.length >= 3 && !LEADER_TITLE_NOISE.has(token))

/** Small-budget edit distance — enough to catch transliteration drift. */
const editDistance = (a: string, b: string, budget: number): number => {
  if (Math.abs(a.length - b.length) > budget) return budget + 1
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
    previous = current
  }
  return previous[b.length]
}

/** Same name? Tokens match fuzzily: Christodoulidis≈Christodoulides, Tiani≈Tchiani. */
const namesOverlap = (a: string, b: string): boolean => {
  const aTokens = leaderNameTokens(a)
  const bTokens = leaderNameTokens(b)
  return aTokens.some(tokenA =>
    bTokens.some(tokenB => {
      const budget = Math.min(tokenA.length, tokenB.length) >= 6 ? 2 : 1
      return editDistance(tokenA, tokenB, budget) <= budget
    })
  )
}

/**
 * The face to quiz on — always the POLITICAL leader, never a ceremonial
 * figurehead by accident. Selection order:
 *  1. The role whose name matches the factbook's `government.leader`
 *     (fuzzy — transliterations drift between sources).
 *  2. The role the factbook's TITLE names ("Prime Minister…" → government,
 *     "President/King…" → state) — covers elections the factbook snapshot
 *     already reflects but Wikidata phrases differently.
 *  3. Head of government. When the sources disagree entirely (a fresh
 *     election one of them missed), the head of government is the political
 *     office by construction; defaulting to head of state was how Thailand
 *     dealt its king and Tuvalu dealt Charles III.
 */
const portraitFor = (isoCode: ISOCountryCode) => {
  const entry = LEADERS[isoCode]
  const state = entry?.headOfState?.image ? entry.headOfState : undefined
  const government = entry?.headOfGovernment?.image ? entry.headOfGovernment : undefined
  if (!state && !government) return undefined

  const factbookLeader = COUNTRIES[isoCode].government?.leader ?? ''

  const named = [state, government].find(role => role && namesOverlap(role.name, factbookLeader))
  const byTitle = /prime minister|chancellor|taoiseach|premier/i.test(factbookLeader)
    ? government
    : /president|king|queen|emir|sultan|emperor|pope/i.test(factbookLeader)
      ? state
      : undefined

  const leader = named ?? byTitle ?? government ?? state
  return leader?.image ? { image: leader.image, name: leader.name } : undefined
}

/** Leader-portrait: whose face is this? Decoys prefer the same region. */
const dealLeaderPortrait = (
  countryPool: ISOCountryCode[]
): Pick<IndividualChallenge, 'country' | 'options' | 'portrait'> | undefined => {
  const withPortraits = shuffleArray(countryPool.filter(isoCode => !!portraitFor(isoCode)))
  const country = withPortraits[0]
  if (!country) return undefined
  const portrait = portraitFor(country)
  if (!portrait) return undefined

  const decoys = pickDecoys(country, countryPool, 3, { preferRegion: true })
  if (!decoys) return undefined

  return { country, options: shuffleArray([country, ...decoys]), portrait }
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
  // Derive the valid set from the single source of truth so adding a variant
  // to `individualChallengeVariants` also makes FORCE_INDIVIDUAL_VARIANT accept
  // it — no second list to keep in sync.
  return forced && (individualChallengeVariants as readonly string[]).includes(forced)
    ? (forced as IndividualChallenge['variant'])
    : undefined
}

export const getIndividualChallenge = ({
  accessorId,
  difficulty = 'normal',
  variant = 'world',
}: {
  accessorId: IndividualChallengeAccessorId
  difficulty?: gameTypes.GameDifficulty
  variant?: gameTypes.GameVariant
}): IndividualChallenge => {
  const pool = variantCountries(variant)
  const base: IndividualChallenge = {
    _type: 'individual-challenge',
    id: accessorId,
    country: pickLargeCountry(pool),
    variant: 'find',
  }

  const forced = forcedIndividualVariant()
  if (forced) {
    switch (forced) {
      case 'flag-pick': {
        const dealt = dealFlagPick(base.country, pool)
        return dealt ? { ...base, ...dealt } : base
      }
      case 'flag-twins': {
        const dealt = dealFlagTwins(base.country, pool)
        return dealt ? { ...base, ...dealt } : base
      }
      case 'border-detective': {
        const dealt = dealBorderDetective(pool)
        return dealt ? { ...base, variant: 'border-detective', ...dealt } : base
      }
      case 'odd-one-out': {
        const dealt = dealOddOneOut(difficulty, pool)
        if (dealt) return { ...base, variant: 'odd-one-out', ...dealt }
        break
      }
      case 'higher-lower': {
        const dealt = dealHigherLower(difficulty, pool)
        if (dealt) return { ...base, variant: 'higher-lower', ...dealt }
        break
      }
      case 'leader-pick': {
        const dealt = dealLeaderPick(pool)
        if (dealt) return { ...base, variant: 'leader-pick', ...dealt }
        break
      }
      case 'outline-reveal':
        return { ...base, variant: 'outline-reveal', country: pickShapeFriendlyCountry(pool) }
      case 'leader-portrait': {
        const dealt = dealLeaderPortrait(pool)
        if (dealt) return { ...base, variant: 'leader-portrait', ...dealt }
        break
      }
    }
    return base
  }

  const roll = Math.random()
  switch (accessorId) {
    case 'flag': {
      // Flag-twins is the harder sibling (palette-identical decoys) — offer it
      // more on hard boards; both fall back to `find` if they can't deal.
      const twinsChance = difficulty === 'hard' ? 0.5 : 0.3
      if (roll < twinsChance) {
        const dealt = dealFlagTwins(base.country, pool)
        if (dealt) return { ...base, ...dealt }
      }
      if (roll < 0.75) {
        const dealt = dealFlagPick(base.country, pool)
        if (dealt) return { ...base, ...dealt }
      }
      break
    }
    case 'isoCode': {
      // Hard games race the self-drawing border: name it before it completes
      if (difficulty === 'hard' && roll < 0.3) {
        return { ...base, variant: 'outline-reveal', country: pickShapeFriendlyCountry(pool) }
      }
      if (roll < 0.55) {
        const dealt = dealBorderDetective(pool)
        if (dealt) return { ...base, variant: 'border-detective', ...dealt }
      }
      if (roll < 0.75) {
        const dealt = dealOddOneOut(difficulty, pool)
        if (dealt) return { ...base, variant: 'odd-one-out', ...dealt }
      }
      break
    }
    case 'capital.name': {
      if (roll < 0.25) {
        const dealt = dealHigherLower(difficulty, pool)
        if (dealt) return { ...base, variant: 'higher-lower', ...dealt }
      } else if (roll < 0.5) {
        const dealt = dealLeaderPick(pool)
        if (dealt) return { ...base, variant: 'leader-pick', ...dealt }
      } else if (roll < 0.75) {
        const dealt = dealLeaderPortrait(pool)
        if (dealt) return { ...base, variant: 'leader-portrait', ...dealt }
      }
      break
    }
  }

  return base
}

/**
 * A short topic label for an accessor, derived from its ranking phrasing:
 * "Rank the following countries by their GDP per capita" → "GDP per capita".
 * Used wherever a stat needs naming outside a ranking question (clue cards,
 * claim cards, duel topics).
 */
export const accessorTopicLabel = (
  accessorId: GroupChallengeAccessorId | IndividualChallengeAccessorId
): string => {
  const phrasing = getChallengeDetails(accessorId)?.phrasing ?? accessorId
  return phrasing
    .replace(/^rank (the following|these)( countries)? by /i, '')
    .replace(/^which of these countries (have|has) the /i, '')
    .replace(/^(the |their )/i, '')
    .replace(/^(proportion of|level of|amount of)\s*/i, '')
    .replace(/^(largest|smallest|highest|lowest)\s*/i, '')
    .replace(/\?$/, '')
    .trim()
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
      markers: {
        most: 'highest GDP',
        least: 'lowest GDP',
      },
    },
    'economics.militarySpending': {
      topic: 'economics',
      phrasing: 'Rank these countries by military spending as a percentage of their economy',
      markers: {
        most: 'highest percent',
        least: 'lowest percent',
      },
    },
    'economics.populationBelowPovertyLine': {
      topic: 'economics',
      phrasing: 'Rank the following countries by the percentage of people under the poverty line',
      markers: {
        most: 'highest percent',
        least: 'lowest percent',
      },
    },
    'economics.equality': {
      topic: 'economics',
      phrasing: 'Rank these countries by the level of economic inequality',
      markers: {
        most: 'unequal',
        least: 'equal',
      },
      // Gini is theoretically 0–100 but real countries cluster ~24–59; a
      // 20–70 band keeps the plotted marker legible instead of bunched mid-track.
      scale: { min: 20, max: 70 },
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
      phrasing: 'Rank these countries by total area',
      markers: {
        most: 'largest area',
        least: 'smallest area',
      },
    },
    'geography.area.arable': {
      topic: 'geography',
      phrasing: 'Rank these countries by the percentage of their land that is arable',
      markers: {
        most: 'highest percent',
        least: 'lowest percent',
      },
    },
    'geography.area.forested': {
      topic: 'geography',
      phrasing: 'Rank these countries by the percentage of their land that is forested',
      markers: {
        most: 'highest percent',
        least: 'lowest percent',
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
    'infrastructure.rail': {
      topic: 'infrastructure',
      phrasing: 'Rank these countries by length of railway network',
      markers: {
        most: 'most kilometers',
        least: 'fewest kilometers',
      },
    },
    'gender.womenInParliament': {
      topic: 'gender',
      phrasing: 'Rank these countries by the percentage of parliament seats held by women',
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
      phrasing: 'Rank these countries by the percentage of adults who are obese',
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
      phrasing: 'Rank these countries by the percentage of people who are literate',
      markers: {
        most: 'highest percent',
        least: 'lowest percent',
      },
    },
    'education.averageYearsOfStudy': {
      topic: 'education',
      phrasing: 'Rank these countries by the average number of years spent in school',
      markers: {
        most: 'most years',
        least: 'fewest years',
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
      phrasing: 'Rank these countries by the percentage of people with access to contraceptives',
      markers: {
        most: 'highest percent',
        least: 'lowest percent',
      },
    },
    'religion.atheism': {
      topic: 'religion',
      phrasing: 'Rank these countries by the percentage of people who are atheist',
      markers: {
        most: 'highest percent',
        least: 'lowest percent',
      },
    },
    'religion.believers': {
      topic: 'religion',
      phrasing: 'Rank these countries by the percentage of people who follow a religion',
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
      phrasing: 'Rank these countries by the percentage of people with internet access',
      markers: {
        most: 'highest percent',
        least: 'lowest percent',
      },
    },
    'people.population': {
      topic: 'people',
      phrasing: 'Which of these countries have the largest populations?',
      markers: {
        most: 'largest population',
        least: 'smallest population',
      },
    },
    'people.populationGrowthRate': {
      topic: 'people',
      phrasing: 'Rank the following by population growth rate',
      markers: {
        most: 'fastest growing',
        least: 'slowest growing',
      },
    },
    'health.lifeExpectancy': {
      topic: 'health',
      phrasing: 'Rank the following by life expectancy.',
      markers: {
        most: 'oldest',
        least: 'youngest',
      },
    },
    'health.tobaccoUse': {
      topic: 'health',
      phrasing: 'Rank the following by the percentage of adults who use tobacco',
      markers: {
        most: 'highest percent',
        least: 'lowest percent',
      },
    },
    'health.alcoholConsumption': {
      topic: 'health',
      phrasing: 'Rank the following by litres of pure alcohol consumed per adult each year',
      markers: {
        most: 'most litres',
        least: 'fewest litres',
      },
    },
    'humanRights.refugees': {
      topic: 'human rights',
      phrasing: 'Rank these countries by the number of refugees they host',
      markers: {
        most: 'most refugees',
        least: 'fewest refugees',
      },
    },
    'economics.inflation': {
      topic: 'economics',
      phrasing: 'Rank these countries by their annual inflation rate',
      markers: {
        most: 'highest percent',
        least: 'lowest percent',
      },
    },
    'government.amountOfMilitaryConflicts': {
      topic: 'general knowledge',
      phrasing: 'Rank these countries by the number of armed conflicts they are involved in',
      markers: {
        most: 'most conflicts',
        least: 'fewest conflicts',
      },
    },
    'government.democracyIndex': {
      topic: 'general knowledge',
      phrasing: 'Rank these countries by their democracy index (V-Dem electoral democracy)',
      markers: {
        most: 'most democratic',
        least: 'least democratic',
      },
      scale: { min: 0, max: 1 },
    },
    'government.corruptionIndex': {
      topic: 'general knowledge',
      // CPI is scored 0–100 where higher = cleaner; the ranking sorts on the
      // raw score, so the top pole is the least corrupt.
      phrasing: 'Rank these countries by their Corruption Perceptions Index score',
      markers: {
        most: 'least corrupt',
        least: 'most corrupt',
      },
      // The markers already run in score order (left = low score = most
      // corrupt, right = high score = least corrupt), so a plain 0–100 plot
      // of the raw CPI lands correctly — no inversion needed.
      scale: { min: 0, max: 100 },
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
  const amounts: { value: Amount<string>; isoCode: ISOCountryCode }[] = []
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
