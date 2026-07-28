import { BORDERS } from '~~/data/borders.gen'
import { CAPITALS } from '~~/data/capitals.gen'
import { COUNTRIES } from '~~/data/countries.gen'
import { CURRENCIES } from '~~/data/currencies.gen'
import { HERITAGE } from '~~/data/heritage.gen'
import { LANDMARKS } from '~~/data/landmarks.gen'
import { ISOCountryCodes } from '~~/data/iso-codes.gen'
// Type-only: erased at compile, so the heavy water dataset stays a dynamic import.
import type { WaterFeature } from '~~/data/water.gen'
import { hexToRgb, sameSimplifiedPalette } from '~~/lib/palette'
import type { ChallengeConfiguration } from '~~/types/challenge.type'
import {
  HEAVY_ACCESSORS,
  isAccessorEnabled,
  isGroupEnabled,
  isKindEnabled,
  MINIMUM_TABLE_BY_KIND,
  type ChallengeOverrides,
} from '~~/types/challenges/challenge-groups.type'
import {
  type GroupChallengeAccessorId,
  GROUP_CHALLENGES,
} from '~~/types/challenges/group-challenge.type'
import type {
  BorderChainChallenge,
  CapitalGuessChallenge,
  EmpireChallenge,
  FlagPaletteChallenge,
  FlashpointChallenge,
  HeritageHuntChallenge,
  GhostStateChallenge,
  HotColdChallenge,
  ManhuntChallenge,
  MotherTongueChallenge,
  NameWaterChallenge,
  NeighbourBlitzChallenge,
  NoMansLandChallenge,
  PinLandmarkChallenge,
  SilhouetteChallenge,
  SketchChallenge,
  StatDetectiveChallenge,
  TimelineChallenge,
  TrendRaceChallenge,
  TwoTruthsChallenge,
  UniqueOrBustChallenge,
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
import { isValidISOCode, type Amount, type ISOCountryCode } from '~~/types/geography.types'
import {
  CONFLICT_TYPE_LABELS,
  INCOMPATIBILITY_LABELS,
  dominantConflict,
} from '~~/types/vendor/ucdp/ucdp.types'
import { sample, sampleMany, shuffleArray, weightedPick } from './arrays'
import { titleCase } from './strings'
import { EMPIRE_TUNING, subsampleKeyframes } from './empires'
import { pickSizedCountry } from './country'
import { countryLedBy, politicalLeader } from './leaders'
import {
  DIFFICULTY_CONFIGURATION,
  isCountryInPlay,
  playableCountries,
  playableWorldCountries,
} from './game-rules'
import { pickChainSeed } from './chain'
import { initialManhuntCandidates, MANHUNT_TUNING, MINIMUM_MANHUNT_POOL } from './manhunt'
import { UNIQUE_BOARD, UNIQUE_TUNING, uniqueRegisters, uniqueViableLetters } from './unique-or-bust'
import { haversineKm, mainlandBox, type LatLng } from './geo'
import {
  attemptDecayScore,
  attemptFraction,
  clampScore,
  jaccardFraction,
  scorePinDistance,
} from './scoring'
import { dealTimelineDeck, TIMELINE_TUNING } from './timeline'
import { isRouteComplete, pickTraversal } from './traversal'
import {
  dramaScore,
  isDecisiveGap,
  readTrend,
  relativeGap,
  TREND_METRIC_IDS,
  TREND_METRICS,
  TRENDS,
} from './trends'
import type { TrendReading } from './trends'
import { getValueByAccessorID } from './values'
import { REGION_LABELS } from './variant'

export const MAXIMUM_SCORE_PER_COUNTRY = 3

// Difficulty numbers live with the rest of the core game rules.
export { DIFFICULTY_CONFIGURATION } from './game-rules'

/** Standard points ceiling per round, scaled by difficulty. */
const maximumRoundPoints = (game: gameTypes.Game) =>
  MAXIMUM_SCORE_PER_COUNTRY * DIFFICULTY_CONFIGURATION[game.difficulty].rankingChallengeCountries

/** Relative weights for the round mix (after the tutorial-friendly round 1). */
const ROUND_WEIGHTS: [RoundChallengeKind, number][] = [
  ['ranking', 0.2],
  ['traversal', 0.13],
  ['border-chain', 0.09],
  ['heritage-hunt', 0.07],
  ['neighbour-blitz', 0.1],
  ['silhouette', 0.09],
  ['hot-cold', 0.06],
  ['sketch', 0.07],
  ['stat-detective', 0.06],
  ['two-truths', 0.07],
  ['river-run', 0.06],
  ['shared-shores', 0.05],
  ['name-that-water', 0.04],
  ['highlands', 0.08],
  ['mother-tongue', 0.09],
  ['flag-palette', 0.08],
  ['capital-guess', 0.08],
  // Rare on purpose. The cast is tiny — eight ghost states, and only six of
  // them obscure — so dealing these at a staple's rate burns through the whole
  // roster in a session or two. They should land like finding something odd on
  // the map, not like a rotation slot. At these weights a hard game sees one
  // roughly one time in five, and two almost never.
  ['ghost-state', 0.018],
  ['no-mans-land', 0.012],
  // Rare for a different reason: it's the game's heaviest subject, and it
  // must never read as a defining mode. A hard game sees one about one time
  // in eight — an occasional, sobering find.
  ['flashpoint', 0.02],
  ['pin-landmark', 0.06],
  ['trend-race', 0.08],
  ['timeline', 0.08],
  // A set-piece, dealt sparingly: two beats make it the longest single-player
  // round in the game, and each empire is one-shot learnable — a roster of a
  // few dozen at a staple's rate would repeat inside a fortnight of games.
  // At 0.05 a full game usually sees one, rarely two.
  ['empire', 0.05],
  // Another set-piece — a full pursuit spans up to eight two-beat turns —
  // and it needs four players to deal at all, so it self-rarifies further
  // at small tables.
  ['manhunt', 0.05],
  // Needs three players before duplicate-cancel scoring has teeth, so it
  // self-rarifies at duos the same way manhunt does.
  ['unique-or-bust', 0.07],
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

// Difficulty gates and the lobby's tri-state group toggles resolve in one
// place (challenge-groups.type) — the dealer only ever asks isKindEnabled.
const pickRoundKind = (game: gameTypes.Game): RoundChallengeKind =>
  weightedPick(ROUND_WEIGHTS.filter(([kind]) => isKindEnabled(game, kind))) ?? 'ranking'

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
  'VA',
  'MC',
  'SM',
  'AD',
  'LI',
  'LU',
]

const pickShapeFriendlyCountry = (
  candidates: ISOCountryCode[],
  world: ISOCountryCode[] = [...ISOCountryCodes]
): ISOCountryCode => {
  const excluded = new Set(SHAPE_UNFRIENDLY)
  const filter = (isoCodes: ISOCountryCode[]) =>
    isoCodes.filter(isoCode => {
      if (excluded.has(isoCode)) return false
      const area = COUNTRIES[isoCode].geography.area.land
      return !!area && area.amount > 20
    })

  // A variant pool that filters down to nothing falls back to the world
  const pool = filter(candidates)
  const viable = pool.length ? pool : filter(world)
  return sample(viable)!
}

/** Everyone still competing when the round is dealt takes a chain seat. */
const chainContenders = (game: gameTypes.Game): string[] =>
  Object.entries(game.players)
    .filter(([, player]) => !['kicked', 'victory'].includes(player.phase))
    .map(([playerId]) => playerId)

const getBorderChainChallenge = ({
  game,
}: {
  game: gameTypes.Game
}): BorderChainChallenge | undefined => {
  const contenders = chainContenders(game)
  // Solo, there is nobody to outlast.
  if (contenders.length < 2) return undefined
  const seed = pickChainSeed(game)
  if (!seed) return undefined

  const strikes = game.difficulty === 'easy' ? 1 : 0
  return {
    _type: 'border-chain-challenge',
    turnSeconds: DIFFICULTY_CONFIGURATION[game.difficulty].chainTurnSeconds,
    maximumPoints: maximumRoundPoints(game),
    strikes,
    state: {
      // The rules card holds the opening shot clock until the table is ready.
      briefing: true,
      ready: [],
      chains: [[seed]],
      order: shuffleArray(contenders),
      activeIndex: 0,
      turn: 0,
      // Stamped when the briefing lifts (chain-turns) — staging pauses first.
      deadline: 0,
      named: {},
      strikesLeft: Object.fromEntries(contenders.map(playerId => [playerId, strikes])),
      eliminated: [],
      outcomes: {},
      missedOuts: {},
    },
  }
}

/**
 * Manhunt dealer: one contender becomes the despot on the run, the rest form
 * the detective dragnet. Below four players the rivalry collapses, so the
 * mode simply never deals at small tables. The seed country is NOT dealt
 * here — the dealer has no redis handle, and the trail must never ride the
 * broadcast challenge; manhunt-beats picks it at the round reveal.
 */
const getManhuntChallenge = ({ game }: { game: gameTypes.Game }): ManhuntChallenge | undefined => {
  const contenders = chainContenders(game)
  if (contenders.length < (MINIMUM_TABLE_BY_KIND.manhunt ?? 0)) return undefined
  // A board too small to hide on never deals (South America fields nine
  // viable seeds) — the real seed is picked at reveal, off the snapshot.
  if (initialManhuntCandidates(game).length < MINIMUM_MANHUNT_POOL) return undefined

  const tuning = MANHUNT_TUNING[game.difficulty]
  const despotId = sample(contenders)!
  const detectives = shuffleArray(contenders.filter(playerId => playerId !== despotId))
  return {
    _type: 'manhunt-challenge',
    turnCount: tuning.turnCount,
    moveSeconds: tuning.moveSeconds,
    huntSeconds: tuning.huntSeconds,
    maximumPoints: maximumRoundPoints(game),
    despotId,
    seaPassages: tuning.seaPassages,
    subpoenas: tuning.subpoenas,
    showCandidates: game.difficulty !== 'hard',
    state: {
      briefing: true,
      ready: [],
      turn: 0,
      hop: 1,
      beat: 'move',
      // Stamped when the round is revealed (manhunt-beats) — staging pauses first.
      deadline: 0,
      detectives,
      clues: [],
      moves: [],
      seaPassagesLeft: tuning.seaPassages,
      subpoenasLeft: Object.fromEntries(detectives.map(playerId => [playerId, tuning.subpoenas])),
      candidates: [],
      dragnets: [],
      committed: [],
    },
  }
}

/** Every category must field this many answers beyond the table's seats, so
 *  reaching past the obvious pick is always possible. */
const UNIQUE_LETTER_SLACK = 2

/**
 * Unique or Bust dealer: one letter, four category blanks, everyone writes at
 * once. Below three players duplicates rarely collide and the cancel scoring
 * loses its teeth, so smaller tables never see it. The letter comes from the
 * pools every category can serve deep enough that the table can't be forced
 * into collisions.
 */
const getUniqueOrBustChallenge = async ({
  game,
}: {
  game: gameTypes.Game
}): Promise<UniqueOrBustChallenge | undefined> => {
  const contenders = chainContenders(game)
  if (contenders.length < (MINIMUM_TABLE_BY_KIND['unique-or-bust'] ?? 0)) return undefined

  const registers = await uniqueRegisters(game)
  const letters = uniqueViableLetters(registers, contenders.length + UNIQUE_LETTER_SLACK)
  const letter = sample(letters)
  if (!letter) return undefined

  return {
    _type: 'unique-or-bust-challenge',
    letter: letter.toUpperCase(),
    categories: [...UNIQUE_BOARD],
    durationSeconds: UNIQUE_TUNING[game.difficulty].durationSeconds,
    maximumPoints: maximumRoundPoints(game),
    state: {
      briefing: true,
      ready: [],
      // Stamped when the table is briefed (unique-beats) — no clock until then.
      deadline: 0,
      order: contenders,
      locked: {},
    },
  }
}

/**
 * Timeline dealer: an opener plus a fixed hand per player, era-spread by the
 * difficulty's minimum year gap. Unlike the chain there is no one to outlast,
 * so a solo table still deals — the line just grows alone.
 */
const getTimelineChallenge = ({
  game,
}: {
  game: gameTypes.Game
}): TimelineChallenge | undefined => {
  const contenders = chainContenders(game)
  if (!contenders.length) return undefined

  const tuning = TIMELINE_TUNING[game.difficulty]
  const cardCount = 1 + tuning.cardsPerPlayer * contenders.length
  const deck = dealTimelineDeck(game, cardCount, tuning.minimumYearGap, tuning.eraWindowYears)
  if (!deck) return undefined

  return {
    _type: 'timeline-challenge',
    turnSeconds: tuning.turnSeconds,
    revealSeconds: tuning.revealSeconds,
    maximumPoints: maximumRoundPoints(game),
    state: {
      deck,
      // The opener anchors the line so the first placement is a real choice.
      placed: [deck[0]],
      card: 1,
      order: shuffleArray(contenders),
      activeIndex: 0,
      turn: 0,
      // Stamped when the round is revealed (timeline-turns) — staging pauses first.
      deadline: 0,
      banked: {},
      placements: [],
    },
  }
}

const HERITAGE_BEAT_SECONDS = 35
const HERITAGE_BEATS = 3

const getHeritageHuntChallenge = ({
  game,
}: {
  game: gameTypes.Game
}): HeritageHuntChallenge | undefined => {
  const contenders = chainContenders(game)
  if (!contenders.length) return undefined

  const playable = new Set(playableCountries(game))
  const pool = shuffleArray(
    Object.entries(HERITAGE).filter(([, site]) => playable.has(site.country))
  )
  // One site per country per round, for variety.
  const slugs: string[] = []
  const dealtCountries = new Set<ISOCountryCode>()
  for (const [slug, site] of pool) {
    if (dealtCountries.has(site.country)) continue
    dealtCountries.add(site.country)
    slugs.push(slug)
    if (slugs.length === HERITAGE_BEATS) break
  }
  if (slugs.length < HERITAGE_BEATS) return undefined

  return {
    _type: 'heritage-hunt-challenge',
    slugs,
    beatSeconds: HERITAGE_BEAT_SECONDS,
    perfectDistanceKm: PIN_PERFECT_KM,
    zeroDistanceKm: PIN_ZERO_KM,
    maximumPoints: maximumRoundPoints(game),
    state: {
      beat: 0,
      // Stamped when the round is revealed (heritage-beats).
      deadline: 0,
      order: contenders,
      pins: {},
    },
  }
}

const getNeighbourBlitzChallenge = ({
  game,
}: {
  game: gameTypes.Game
}): NeighbourBlitzChallenge | undefined => {
  // Benched micro-nations vanish from the answer key too (Italy without the
  // Vatican and San Marino), so the subject must still clear the bar without
  // them — and the dealt list must match what's scoreable and selectable.
  const inPlayNeighbours = (isoCode: ISOCountryCode) =>
    (BORDERS[isoCode] ?? []).filter(neighbour => isCountryInPlay(game, neighbour))
  const pool = shuffleArray(
    playableCountries(game).filter(isoCode => inPlayNeighbours(isoCode).length >= 4)
  )
  const country = pool[0]
  if (!country) return undefined

  return {
    _type: 'neighbour-blitz-challenge',
    country,
    neighbours: inPlayNeighbours(country),
    durationSeconds: 45,
    maximumPoints: maximumRoundPoints(game),
  }
}

const getSilhouetteChallenge = ({ game }: { game: gameTypes.Game }): SilhouetteChallenge => {
  const country = pickShapeFriendlyCountry(playableCountries(game), playableWorldCountries(game))
  return {
    _type: 'silhouette-challenge',
    country,
    durationSeconds: 30,
    maximumPoints: maximumRoundPoints(game),
    // Non-hard mode gets a region hint in the final stretch of the countdown.
    ...(game.difficulty !== 'hard' ? { region: REGION_LABELS[COUNTRIES[country].region] } : {}),
  }
}

/**
 * Micro-island states are near-invisible click targets at world zoom, and a
 * mid-Pacific mystery reads as "east of everything" on the flat map — the
 * big archipelagos (ID, PH, JP, NZ) stay in, they're perfectly clickable.
 */
const HOT_COLD_EXCLUDED = new Set<ISOCountryCode>(
  SHAPE_UNFRIENDLY.filter(isoCode => !['ID', 'PH', 'JP', 'NZ'].includes(isoCode))
)

const getHotColdChallenge = ({ game }: { game: gameTypes.Game }): HotColdChallenge => {
  const candidates = playableCountries(game).filter(isoCode => !HOT_COLD_EXCLUDED.has(isoCode))
  const pool = candidates.length
    ? candidates
    : playableWorldCountries(game).filter(isoCode => !HOT_COLD_EXCLUDED.has(isoCode))
  return {
    _type: 'hot-cold-challenge',
    country: sample(pool)!,
    maximumGuesses: 8,
    maximumPoints: maximumRoundPoints(game),
  }
}

const getSketchChallenge = ({ game }: { game: gameTypes.Game }): SketchChallenge => ({
  _type: 'sketch-challenge',
  country: pickShapeFriendlyCountry(playableCountries(game), playableWorldCountries(game)),
  maximumPoints: maximumRoundPoints(game),
})

/** How alike two values may be before a claim stops being decidable. */
const LIE_MINIMUM_GAP = 0.4
const LIE_MINIMUM_YEAR_GAP = 8

/**
 * Stat detective: a mystery country's stats reveal one by one. Only the
 * accessor ids travel — clients read the values from the shared dataset.
 */
/** A recognisable photo for a country: capital skyline first (broad coverage),
 *  then any curated landmark. Used as Stat Detective's final visual clue. */
const photoClueFor = (country: ISOCountryCode): string | undefined => {
  if (CAPITALS[country]?.image) return CAPITALS[country]!.image
  const landmark = Object.values(LANDMARKS).find(entry => entry.country === country)
  return landmark?.image
}

const getStatDetectiveChallenge = ({
  game,
}: {
  game: gameTypes.Game
}): StatDetectiveChallenge | undefined => {
  const CLUE_COUNT = 6
  const pool = shuffleArray(playableCountries(game))
  const assisted = game.difficulty !== 'hard'

  for (const country of pool.slice(0, 40)) {
    const viable = shuffleArray(
      Object.values(GROUP_CHALLENGES)
        .map(challenge => challenge.id)
        .filter(accessorId => isAccessorEnabled(game, accessorId))
        .filter(accessorId => !!getValueByAccessorID(country, accessorId))
    )
    if (viable.length < CLUE_COUNT) continue

    const photo = photoClueFor(country)
    return {
      _type: 'stat-detective-challenge',
      country,
      clues: viable.slice(0, CLUE_COUNT),
      secondsPerClue: 8,
      maximumPoints: maximumRoundPoints(game),
      // The region hint from the start stays a non-hard helper; the final
      // photo clue deals on every difficulty (when the country has one).
      ...(assisted ? { region: REGION_LABELS[COUNTRIES[country].region] } : {}),
      ...(photo ? { photo } : {}),
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
  const pool = playableCountries(game)

  for (const country of sampleMany(pool, 40)) {
    const accessors = shuffleArray(
      Object.values(GROUP_CHALLENGES)
        .map(challenge => challenge.id)
        .filter(accessorId => isAccessorEnabled(game, accessorId))
        .filter(accessorId => !!getValueByAccessorID(country, accessorId))
    )
    if (accessors.length < 3) continue

    const chosen = accessors.slice(0, 3)
    const lieIndex = Math.floor(Math.random() * chosen.length)
    const lieAccessor = chosen[lieIndex]
    const truth = getValueByAccessorID(country, lieAccessor)
    if (!truth) continue

    // Decoys prefer the variant pool but a lie may come from anywhere in play
    const lieSource = shuffleArray([...pool, ...playableWorldCountries(game)]).find(isoCode => {
      if (isoCode === country) return false
      const candidate = getValueByAccessorID(isoCode, lieAccessor)
      if (!candidate) return false
      if (candidate.unit === 'year') {
        return Math.abs(candidate.amount - truth.amount) >= LIE_MINIMUM_YEAR_GAP
      }
      return relativeGap(candidate.amount, truth.amount) >= LIE_MINIMUM_GAP
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
    const organizationId = sample(CORRIDOR_ORGANIZATIONS)!

    let organizationName = organizationId.toUpperCase()
    const variantPool = new Set(playableCountries(game))
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
    const pick = pickTraversal(game, within)
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

  const pick = pickTraversal(game)
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
  const pool = new Set(playableCountries(game))

  return Object.values(WATER_FEATURES)
    .filter(feature => {
      if (!kinds.includes(feature.kind)) return false
      // The feature must belong to the board being played: at least two
      // playable countries on the variant, and not mostly off-map
      const onBoard = feature.countries.filter(isoCode => pool.has(isoCode))
      return onBoard.length >= 2 && onBoard.length >= feature.countries.length / 3
    })
    .map(feature => ({
      ...feature,
      // The dealt list is the answer key AND the clock scale — benched
      // micro-nations (Monaco on the Mediterranean) can't be required.
      countries: feature.countries.filter(isoCode => isCountryInPlay(game, isoCode)),
    }))
}

/** More touching countries = a longer clock. */
const waterBlitzDuration = (countries: number) => Math.min(75, 20 + countries * 6)

const getWaterBlitzChallenge = async (
  game: gameTypes.Game,
  kinds: WaterFeatureKind[]
): Promise<WaterBlitzChallenge | undefined> => {
  const candidates = (await waterFeaturePool(game, kinds)).filter(
    feature => feature.countries.length >= 3
  )
  const feature = sample(candidates)
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

/** Names allowed before the round resolves; each spent guess is worth less. */
const NAME_WATER_ATTEMPTS = 3
const NAME_WATER_DURATION_SECONDS = 45

/**
 * The dataset carries no fame field, so projected footprint × shore count
 * stands in for prominence — the Mediterranean outscores Antongil Bay by
 * three orders of magnitude.
 */
const waterProminence = (feature: Pick<WaterFeature, 'bounds' | 'countries'>) =>
  feature.bounds[2] * feature.bounds[3] * Math.max(1, feature.countries.length)

/** Name That Water scales with difficulty: easy deals oceans and famous seas,
 *  normal adds the major lakes, hard deals the whole atlas. */
export const NAME_WATER_TIERS: {
  [difficulty in gameTypes.GameDifficulty]: {
    kinds: WaterFeatureKind[]
    poolFraction: number
  }
} = {
  easy: { kinds: ['ocean', 'sea'], poolFraction: 0.25 },
  normal: { kinds: ['ocean', 'sea', 'lake'], poolFraction: 0.6 },
  hard: { kinds: ['ocean', 'sea', 'lake'], poolFraction: 1 },
}

/** Small variants slice thin — never starve the pool below a replayable spread. */
const NAME_WATER_MINIMUM_POOL = 8

/** The difficulty's slice of the pool: prominence-sorted, top fraction. */
export const nameWaterCandidates = <T extends Pick<WaterFeature, 'bounds' | 'countries'>>(
  features: T[],
  difficulty: gameTypes.GameDifficulty
): T[] => {
  const sorted = [...features].sort((a, b) => waterProminence(b) - waterProminence(a))
  const take = Math.ceil(sorted.length * NAME_WATER_TIERS[difficulty].poolFraction)
  return sorted.slice(0, Math.max(NAME_WATER_MINIMUM_POOL, take))
}

const getNameWaterChallenge = async (
  game: gameTypes.Game
): Promise<NameWaterChallenge | undefined> => {
  const pool = await waterFeaturePool(game, NAME_WATER_TIERS[game.difficulty].kinds)
  const candidates = nameWaterCandidates(pool, game.difficulty)
  const feature = sample(candidates)
  if (!feature) return undefined

  return {
    _type: 'name-water-challenge',
    featureId: feature.id,
    featureName: feature.name,
    kind: feature.kind,
    countries: feature.countries,
    maximumGuesses: NAME_WATER_ATTEMPTS,
    durationSeconds: NAME_WATER_DURATION_SECONDS,
    maximumPoints: maximumRoundPoints(game),
  }
}

/** How many countries on the board have this as an official language. */
const MOTHER_TONGUE_MIN_SPEAKERS = 3
const MOTHER_TONGUE_MAX_SPEAKERS = 12
const getMotherTongueChallenge = (game: gameTypes.Game): MotherTongueChallenge | undefined => {
  const pool = playableCountries(game)

  // Count on-board speakers per language, keep the answerable band (a language
  // spoken by 3–12 board countries — fewer is guessable, more is a slog).
  const speakers = new Map<string, ISOCountryCode[]>()
  for (const isoCode of pool) {
    for (const language of COUNTRIES[isoCode].languages ?? []) {
      const list = speakers.get(language) ?? []
      list.push(isoCode)
      speakers.set(language, list)
    }
  }
  const viable = [...speakers.entries()].filter(
    ([, countries]) =>
      countries.length >= MOTHER_TONGUE_MIN_SPEAKERS &&
      countries.length <= MOTHER_TONGUE_MAX_SPEAKERS
  )
  if (!viable.length) return undefined

  const [language, countries] = sample(viable)!
  return {
    _type: 'mother-tongue-challenge',
    language,
    countries,
    durationSeconds: Math.min(60, 20 + countries.length * 5),
    maximumPoints: maximumRoundPoints(game),
  }
}

/** Picks allowed in the multiple-choice variants before the round resolves. */
const CAPITAL_GUESS_ATTEMPTS = 2

/** What a last-attempt win keeps. Steep on purpose: with three options and two
 *  picks, guessing blind lands it two times in three. */
const CAPITAL_GUESS_LAST_ATTEMPT_FRACTION = 0.4

/**
 * Capital-guess: show a capital-city skyline photo and name the country (live
 * guesses shown). Deals only where a capital photo exists.
 *
 * The option variants give two picks, the second worth less. Hard mode
 * free-types without a cap and scores on the clock instead.
 */
const getCapitalGuessChallenge = (game: gameTypes.Game): CapitalGuessChallenge | undefined => {
  const pool = playableCountries(game)
  const country = shuffleArray(pool).find(isoCode => !!CAPITALS[isoCode]?.image)
  if (!country) return undefined

  // Outside hard mode, offer multiple-choice flag options; hard mode free-types.
  let options: ISOCountryCode[] | undefined
  if (game.difficulty !== 'hard') {
    const decoys = pickDecoys(country, pool, game.difficulty === 'easy' ? 2 : 3, {
      preferRegion: true,
      widen: playableWorldCountries(game),
    })
    if (decoys) options = shuffleArray([country, ...decoys])
  }

  return {
    _type: 'capital-guess-challenge',
    country,
    image: CAPITALS[country]!.image!,
    options,
    ...(options ? { maximumGuesses: CAPITAL_GUESS_ATTEMPTS } : {}),
    durationSeconds: 30,
    maximumPoints: maximumRoundPoints(game),
  }
}

/** Points for naming the country on attempt `attempt` (1-based) of `attempts`.
 *  Exported for the View, which reports the score it earned. */
export const capitalGuessScore = (
  attempt: number,
  attempts: number,
  maximumPoints: number
): number =>
  Math.max(
    1,
    Math.round(
      maximumPoints * attemptFraction(attempt, attempts, CAPITAL_GUESS_LAST_ATTEMPT_FRACTION)
    )
  )

/** Sparse dot clouds aren't a readable shape. */
const FLASHPOINT_MIN_POINTS = 40
/** One wave isn't a timeline. */
const FLASHPOINT_MIN_ERAS = 2
const FLASHPOINT_SECONDS_PER_ERA = 4
/** Thinking time after the last wave lands. */
const FLASHPOINT_TAIL_SECONDS = 12

/**
 * Flashpoint: a country's recorded conflict history (UCDP GED) draws itself
 * onto the blanked map as dots, era by era — name the country, the earlier the
 * more it's worth. Option variants get two picks like capital-guess; hard mode
 * free-types and scores on the clock.
 *
 * Dynamic import for the same reason as the water dealer: only nitro runs the
 * dealers, and the dot geometry shouldn't ride into client bundles through
 * this module.
 */
const getFlashpointChallenge = async (
  game: gameTypes.Game
): Promise<FlashpointChallenge | undefined> => {
  const { CONFLICT_FIELDS } = await import('~~/data/conflict-events.gen')
  const playable = new Set(playableCountries(game))
  const pool = Object.entries(CONFLICT_FIELDS).filter(
    ([isoCode, field]) =>
      playable.has(isoCode as ISOCountryCode) &&
      field!.total >= FLASHPOINT_MIN_POINTS &&
      field!.eras.length >= FLASHPOINT_MIN_ERAS
  )
  const picked = shuffleArray(pool)[0]
  if (!picked) return undefined
  const [country, field] = picked as [ISOCountryCode, NonNullable<(typeof pool)[number][1]>]

  // Outside hard mode, offer multiple-choice flag options; hard mode free-types.
  // Decoys must be plausible hosts (have a conflict field) or they self-eliminate.
  let options: ISOCountryCode[] | undefined
  let hint: string | undefined
  if (game.difficulty !== 'hard') {
    const decoys = pickDecoys(country, [...playable], game.difficulty === 'easy' ? 2 : 3, {
      preferRegion: true,
      eligible: isoCode => !!CONFLICT_FIELDS[isoCode],
      widen: playableWorldCountries(game),
    })
    if (decoys) options = shuffleArray([country, ...decoys])

    // Late hint: the defining conflict's shape, never its name — "began in
    // 1964, a civil war over who governs" separates region-mates without
    // handing the round over.
    const { CONFLICTS, CONFLICTS_BY_COUNTRY } = await import('~~/data/conflict-profiles.gen')
    const defining = dominantConflict(
      (CONFLICTS_BY_COUNTRY[country] ?? []).flatMap(id => CONFLICTS[id] ?? [])
    )
    if (defining) {
      const type = CONFLICT_TYPE_LABELS[defining.type].toLowerCase()
      const article = /^[aeiou]/.test(type) ? 'an' : 'a'
      const fought = INCOMPATIBILITY_LABELS[defining.incompatibility]
      const began = defining.episodes[0]?.[0]
      hint = `Its defining conflict began in ${began} — ${article} ${type} over ${fought}.`
    }
  }

  const eras = field.eras.map(({ era }) => era)
  return {
    _type: 'flashpoint-challenge',
    country,
    eras,
    secondsPerEra: FLASHPOINT_SECONDS_PER_ERA,
    options,
    ...(options ? { maximumGuesses: CAPITAL_GUESS_ATTEMPTS } : {}),
    ...(hint ? { hint } : {}),
    durationSeconds: eras.length * FLASHPOINT_SECONDS_PER_ERA + FLASHPOINT_TAIL_SECONDS,
    maximumPoints: maximumRoundPoints(game),
  }
}

/**
 * Pin-landmark: a photo, and the whole world to drop a pin on.
 *
 * Radii are chosen to mean something rather than to be round numbers. 150km is
 * roughly "you found the right city or its region" — the pin doesn't have to
 * land on the roof. 3,000km is about the width of Europe or the continental
 * US: past that you haven't misjudged the spot, you've misjudged the continent,
 * and there is nothing left to credit.
 */
const PIN_PERFECT_KM = 150
const PIN_ZERO_KM = 3000

const getPinLandmarkChallenge = (game: gameTypes.Game): PinLandmarkChallenge | undefined => {
  // Only landmarks whose coordinates survived the generator's country check;
  // and only countries this variant actually deals.
  const playable = new Set(playableCountries(game))
  const pool = Object.entries(LANDMARKS).filter(
    ([, landmark]) => landmark.coordinates && playable.has(landmark.country)
  )
  const picked = shuffleArray(pool)[0]
  if (!picked) return undefined

  const [slug, landmark] = picked
  return {
    _type: 'pin-landmark-challenge',
    slug,
    image: landmark.image,
    perfectDistanceKm: PIN_PERFECT_KM,
    zeroDistanceKm: PIN_ZERO_KM,
    durationSeconds: 40,
    maximumPoints: maximumRoundPoints(game),
  }
}

/**
 * Flag-palette: show a flag's raw colour swatches (no flag) and name the
 * country. Picks a country with a distinctive palette — enough colours that the
 * swatches aren't hopelessly ambiguous (a bare red+white could be dozens of
 * flags). Client-scored all-or-nothing like silhouette.
 */
const getFlagPaletteChallenge = (game: gameTypes.Game): FlagPaletteChallenge | undefined => {
  const pool = playableCountries(game)
  const candidates = shuffleArray(
    pool.filter(isoCode => {
      const colors = COUNTRIES[isoCode].identity.colors
      const simplified = COUNTRIES[isoCode].identity.simplifiedColors
      // 3+ distinctive named colours keeps it guessable-but-fair.
      return colors.length >= 3 && colors.length <= 6 && simplified.length >= 3
    })
  )
  const country = candidates[0]
  if (!country) return undefined

  return {
    _type: 'flag-palette-challenge',
    country,
    swatches: COUNTRIES[country].identity.colors.slice(0, 6),
    durationSeconds: 25,
    maximumPoints: maximumRoundPoints(game),
    // Non-hard mode gets a region hint in the final third of the countdown.
    ...(game.difficulty !== 'hard' ? { region: REGION_LABELS[COUNTRIES[country].region] } : {}),
  }
}

/**
 * Flag-palette verdict, shared by the server scorer and the client's guess
 * check. The puzzle shows ONLY the swatches, so any country whose flag carries
 * the exact same ordered colour list is indistinguishable from the subject
 * (Chile and Russia both fly white|blue|red) — every such country must count.
 */
export const isFlagPaletteMatch = (
  challenge: Pick<FlagPaletteChallenge, 'country' | 'swatches'>,
  isoCode: ISOCountryCode | undefined
): boolean => {
  if (!isoCode) return false
  if (isoCode === challenge.country) return true
  return COUNTRIES[isoCode]?.identity.colors.join('|') === challenge.swatches.join('|')
}

/**
 * Recognition modes deal from the generated disputed-territories dataset.
 * Dynamic import for the same reason as the water dealer: only nitro runs
 * the dealers, and the geometry must not ride into client bundles through
 * this module's other exports. The Views lazy-load it separately.
 */
const recognitionPool = async (cast: 'ghost-state' | 'no-mans-land') => {
  const { RECOGNITION_TERRITORIES } = await import('~~/data/recognition.gen')
  return Object.values(RECOGNITION_TERRITORIES).filter(territory => territory.cast === cast)
}

/**
 * A flag nobody recognizes, a status line, and the whole world to point at.
 * The parent — the state that claims it — is the answer.
 *
 * The round is rare (see ROUND_WEIGHTS), so each one should land on something
 * genuinely strange. Weight the pick by obscurity: a place most of the world
 * draws as its own shape isn't a ghost state to anyone. That demotes Taiwan,
 * which 23 of 31 governments draw apart, and Western Sahara at 22 — leaving
 * the six frozen oddities as the common draw.
 */
const ghostStateOddity = (drawnApart: number, povs: number) => 1 - drawnApart / povs

const getGhostStateChallenge = async (
  game: gameTypes.Game
): Promise<GhostStateChallenge | undefined> => {
  const pool = (await recognitionPool('ghost-state')).filter(
    territory => territory.parent && isValidISOCode(territory.parent)
  )
  if (!pool.length) return undefined

  const weights = pool.map(territory => {
    const povs = Object.values(territory.povs)
    const drawnApart = povs.filter(pov => pov.assignment === 'SELF').length
    // Floor at a small value so Taiwan still turns up now and then.
    return Math.max(0.05, ghostStateOddity(drawnApart, povs.length || 1))
  })

  const territory = weightedPick(
    pool.map((candidate, index) => [candidate, weights[index]] as const)
  )
  if (!territory?.parent) return undefined

  return {
    _type: 'ghost-state-challenge',
    territoryId: territory.id,
    parent: territory.parent,
    durationSeconds: 25,
    maximumPoints: maximumRoundPoints(game),
  }
}

/** A rock. Name everyone who wants it — or, for Bir Tawil, nobody. */
const getNoMansLandChallenge = async (
  game: gameTypes.Game
): Promise<NoMansLandChallenge | undefined> => {
  const pool = await recognitionPool('no-mans-land')
  const territory = sample(pool)
  if (!territory) return undefined

  return {
    _type: 'no-mans-land-challenge',
    territoryId: territory.id,
    claimants: territory.claimants,
    durationSeconds: 30,
    maximumPoints: maximumRoundPoints(game),
  }
}

/**
 * Ghosts of empires. Deals only where the board can be honest: every core
 * member must be playable in this variant, or the beat-2 Jaccard would score
 * countries the table cannot tap — an empire that spans boards simply doesn't
 * deal on a continental one (world always qualifies). Benched micro-nations
 * are different: they drop OFF the scored roster instead of blocking the
 * deal, or the Roman Empire (core: AD/LI/MC/SM/VA) would vanish below hard.
 * Rotates regions so the roster's spread doesn't collapse into one
 * continent's voice, never repeats an empire within a game, and weights
 * tiers per difficulty (icons everywhere, deep cuts toward hard).
 */
const getEmpireChallenge = async (game: gameTypes.Game): Promise<EmpireChallenge | undefined> => {
  // Dynamic, like the water dealer: metadata is small, but the dealer only
  // runs on nitro and the import keeps this module's client footprint flat.
  const { EMPIRES } = await import('~~/data/empires.gen')
  const tuning = EMPIRE_TUNING[game.difficulty]
  const playable = new Set(playableCountries(game))
  /** The scored, tappable core — the benched micro-nations drop out. */
  const inPlayCore = (core: readonly ISOCountryCode[]) =>
    core.filter(isoCode => isCountryInPlay(game, isoCode))

  const dealtIds = new Set<string>()
  const dealtRegions = new Set<string>()
  for (const round of game.rounds) {
    const prior = round.groupChallenge
    if (prior && '_type' in prior && prior._type === 'empire-challenge') {
      dealtIds.add(prior.empireId)
      const region = EMPIRES[prior.empireId]?.region
      if (region) dealtRegions.add(region)
    }
  }

  const candidates = Object.values(EMPIRES).filter(
    empire =>
      !dealtIds.has(empire.id) &&
      tuning.tierWeights[empire.tier] > 0 &&
      inPlayCore(empire.members.core).length >= 2 &&
      // Every core member must be valid and on this board — except a benched
      // micro-nation, which drops off the scored roster instead of blocking.
      empire.members.core.every(
        isoCode =>
          isValidISOCode(isoCode) && (playable.has(isoCode) || !isCountryInPlay(game, isoCode))
      ) &&
      empire.keyframeYears.length >= 2
  )
  if (!candidates.length) return undefined

  // Regional rotation, two-stage: a REGION first (uniform over regions not yet
  // dealt this game), then a tier-weighted empire inside it. Uniform-over-
  // regions is the rotation — it stops a skewed roster from making any one
  // continent the default deal.
  const byRegion = new Map<string, (typeof candidates)[number][]>()
  for (const empire of candidates) {
    byRegion.set(empire.region, [...(byRegion.get(empire.region) ?? []), empire])
  }
  const fresh = [...byRegion.keys()].filter(region => !dealtRegions.has(region))
  const regions = fresh.length ? fresh : [...byRegion.keys()]
  const region = sample(regions)!
  const pool = byRegion.get(region) ?? []

  const empire = weightedPick(
    pool.map(candidate => [candidate, tuning.tierWeights[candidate.tier]] as const)
  )
  if (!empire) return undefined

  // Non-hard helper: 3 name options (same-region icons preferred, so the
  // choice is a real one). The view shows flags only when EVERY option has an
  // honest one, so a flagged answer prefers flagged decoys — flag rounds stay
  // flag rounds instead of collapsing to text over one bare card.
  let options: string[] | undefined
  if (tuning.optionCount > 0) {
    const decoyPool = Object.values(EMPIRES).filter(
      other => other.id !== empire.id && other.tier === 'icon'
    )
    const preferred = decoyPool.filter(other => other.region === empire.region)
    const source = preferred.length >= tuning.optionCount - 1 ? preferred : decoyPool
    const ordered = empire.hasFlag
      ? [
          ...shuffleArray(source.filter(other => other.hasFlag)),
          ...shuffleArray(source.filter(other => !other.hasFlag)),
        ]
      : shuffleArray(source)
    const decoys = ordered.slice(0, tuning.optionCount - 1).map(other => other.id)
    if (decoys.length === tuning.optionCount - 1) options = shuffleArray([empire.id, ...decoys])
  }

  return {
    _type: 'empire-challenge',
    empireId: empire.id,
    keyframeYears: subsampleKeyframes(empire.keyframeYears, tuning.keyframes, empire.peakYear),
    peakYear: empire.peakYear,
    durationSeconds: tuning.nameSeconds,
    tapSeconds: tuning.tapSeconds,
    members: inPlayCore(empire.members.core),
    partialMembers: empire.members.partial.filter(
      isoCode => isValidISOCode(isoCode) && isCountryInPlay(game, isoCode)
    ),
    ...(options ? { options } : {}),
    maximumPoints: maximumRoundPoints(game),
  }
}

/**
 * Distance between two projected map-space boxes, centre to centre. The
 * recognition dataset and the map data share the map's fitted Robinson space,
 * so this is a subtraction rather than a reprojection.
 *
 * Deliberately NOT border-hops: Cyprus has no land borders at all, so a
 * hop-count would score Turkey (10km away) exactly the same as Peru.
 */
const boxDistance = (
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number]
) => Math.hypot(a[0] + a[2] / 2 - (b[0] + b[2] / 2), a[1] + a[3] / 2 - (b[1] + b[3] / 2))

/** Beyond this projected distance a guess is worth nothing. Tuned so a
 *  neighbouring country still scores well and another continent scores zero. */
const GHOST_STATE_FALLOFF = 260

/**
 * Full marks for naming the claimant state; a graded fraction for landing
 * near it; nothing for the far side of the world. Server-authoritative — the
 * client's only input is which country it tapped.
 */
export const scoreGhostState = async ({
  challenge,
  submittedGuesses,
}: {
  challenge: GhostStateChallenge
  submittedGuesses: ISOCountryCode[]
}): Promise<{ scored: number; maximum: number }> => {
  const maximum = challenge.maximumPoints
  const tapped = submittedGuesses[0]
  if (!tapped) return { scored: 0, maximum }
  if (tapped === challenge.parent) return { scored: maximum, maximum }

  // Dynamic, like the water dealer: the map geometry must not ride into client
  // bundles through this module.
  const { MAP_BOUNDS, MAP_REGIONS } = await import('~~/data/map.gen')
  const tappedBounds = MAP_BOUNDS[tapped]
  const parentBounds = MAP_BOUNDS[challenge.parent]
  if (!tappedBounds || !parentBounds) return { scored: 0, maximum }

  const tappedCentre = mainlandBox(MAP_REGIONS[tapped], tappedBounds)
  const parentCentre = mainlandBox(MAP_REGIONS[challenge.parent], parentBounds)

  const fraction = 1 - boxDistance(tappedCentre, parentCentre) / GHOST_STATE_FALLOFF
  // `scored` feeds board movement 1:1 — never emit NaN or a negative.
  const scored = Number.isFinite(fraction) ? Math.max(0, Math.round(maximum * fraction)) : 0
  return { scored: clampScore(scored, maximum), maximum }
}

/**
 * Jaccard overlap against the true claimant set.
 *
 * Bir Tawil is the point of the mode: nobody claims it, so the true set is
 * empty and the correct play is to submit nothing. An empty guess against an
 * empty truth is a perfect answer, not a division by zero.
 */
export const scoreNoMansLand = ({
  challenge,
  submittedGuesses,
}: {
  challenge: NoMansLandChallenge
  submittedGuesses: ISOCountryCode[]
}): { scored: number; maximum: number } => {
  const maximum = challenge.maximumPoints
  const truth = new Set(challenge.claimants)
  const guess = new Set(submittedGuesses)
  return { scored: clampScore(maximum * jaccardFraction(guess, truth), maximum), maximum }
}

/**
 * Trend race: which of these countries' stat moved the most? Every dealt card
 * is a decisive mover in the same direction over a SHARED window (series
 * clipped to the latest common start year — comparing different windows would
 * be dishonest), and the winner's margin must itself be decisive. Anything
 * ambiguous falls through to the ranking fallback.
 */
const getTrendRaceChallenge = ({
  game,
}: {
  game: gameTypes.Game
}): TrendRaceChallenge | undefined => {
  const pool = playableCountries(game)
  const optionCount = DIFFICULTY_CONFIGURATION[game.difficulty].rankingChallengeCountries

  for (const metric of shuffleArray(TREND_METRIC_IDS.filter(id => TREND_METRICS[id].race))) {
    const movers: { isoCode: ISOCountryCode; direction: TrendReading['direction'] }[] = []
    for (const isoCode of pool) {
      const direction = readTrend(TRENDS[isoCode]?.[metric], metric)?.direction
      if (direction === 'rising' || direction === 'falling') movers.push({ isoCode, direction })
    }

    const risers = movers.filter(mover => mover.direction === 'rising')
    const fallers = movers.filter(mover => mover.direction === 'falling')
    const candidates = risers.length >= fallers.length ? risers : fallers
    if (candidates.length < optionCount) continue
    const seek = candidates === risers ? 'rising' : 'falling'

    for (let attempt = 0; attempt < 2; attempt++) {
      const picked = sampleMany(candidates, optionCount)
      const sharedStart = Math.max(...picked.map(({ isoCode }) => TRENDS[isoCode]![metric]![0][0]))
      const standings = picked
        .flatMap(({ isoCode }) => {
          const clipped = TRENDS[isoCode]![metric]!.filter(([year]) => year >= sharedStart)
          const reading = readTrend(clipped, metric)
          return reading?.direction === seek ? [{ isoCode, change: Math.abs(reading.change) }] : []
        })
        .sort((a, b) => b.change - a.change)
      if (standings.length !== optionCount) continue
      if (!isDecisiveGap(standings[0].change, standings[1].change, TREND_METRICS[metric].scale)) {
        continue
      }

      return {
        _type: 'trend-race-challenge',
        metric,
        direction: seek === 'rising' ? 'risen' : 'fallen',
        options: shuffleArray(standings.map(({ isoCode }) => isoCode)),
        standings: standings.map(({ isoCode }) => isoCode),
        windowStartYear: sharedStart,
        durationSeconds: 30,
        maximumPoints: maximumRoundPoints(game),
      }
    }
  }

  return undefined
}

/**
 * One shot at the steepest mover: full marks for standings[0], a linear taper
 * to nothing for the weakest card. Server-authoritative from the pinned
 * standings — the client's only input is which card it tapped.
 */
export const scoreTrendRace = ({
  challenge,
  submittedGuesses,
}: {
  challenge: TrendRaceChallenge
  submittedGuesses: ISOCountryCode[]
}): { scored: number; maximum: number } => {
  const maximum = challenge.maximumPoints
  const pick = submittedGuesses[0]
  const position = pick ? challenge.standings.indexOf(pick) : -1
  if (position === -1) return { scored: 0, maximum }
  return {
    scored: Math.round(maximum * attemptFraction(position + 1, challenge.standings.length, 0)),
    maximum,
  }
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

  // A dealer that THROWS (bad generated data, drifted accessor) must degrade
  // to the ranking fallback below, exactly like one that deals nothing — an
  // escaped throw fails the round-staging task with no retry, freezing the
  // room permanently (prod postmortem: timeline's HK card).
  try {
    return await dealRoundChallenge(kind, game)
  } catch (error) {
    console.error(`Round dealer '${kind}' crashed for ${game.id} — falling back to ranking`, error)
    return getGroupChallenge({ game })
  }
}

const dealRoundChallenge = async (
  kind: RoundChallengeKind,
  game: gameTypes.Game
): Promise<RoundChallenge> => {
  switch (kind) {
    case 'traversal': {
      const challenge = getTraversalChallenge({ game })
      if (challenge) return challenge
      break
    }
    case 'border-chain': {
      const challenge = getBorderChainChallenge({ game })
      if (challenge) return challenge
      break
    }
    case 'manhunt': {
      const challenge = getManhuntChallenge({ game })
      if (challenge) return challenge
      break
    }
    case 'unique-or-bust': {
      const challenge = await getUniqueOrBustChallenge({ game })
      if (challenge) return challenge
      break
    }
    case 'timeline': {
      const challenge = getTimelineChallenge({ game })
      if (challenge) return challenge
      break
    }
    case 'empire': {
      const challenge = await getEmpireChallenge(game)
      if (challenge) return challenge
      break
    }
    case 'heritage-hunt': {
      const challenge = getHeritageHuntChallenge({ game })
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
    case 'mother-tongue': {
      const challenge = getMotherTongueChallenge(game)
      if (challenge) return challenge
      break
    }
    case 'flag-palette': {
      const challenge = getFlagPaletteChallenge(game)
      if (challenge) return challenge
      break
    }
    case 'capital-guess': {
      const challenge = getCapitalGuessChallenge(game)
      if (challenge) return challenge
      break
    }
    case 'flashpoint': {
      const challenge = await getFlashpointChallenge(game)
      if (challenge) return challenge
      break
    }
    case 'ghost-state': {
      const challenge = await getGhostStateChallenge(game)
      if (challenge) return challenge
      break
    }
    case 'no-mans-land': {
      const challenge = await getNoMansLandChallenge(game)
      if (challenge) return challenge
      break
    }
    case 'pin-landmark': {
      const challenge = getPinLandmarkChallenge(game)
      if (challenge) return challenge
      break
    }
    case 'trend-race': {
      const challenge = getTrendRaceChallenge({ game })
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
  const wastedGuesses = submittedGuesses.length - minimumGuesses
  return { scored: attemptDecayScore(wastedGuesses, maximum), maximum }
}

/**
 * Pin-landmark: points fall off linearly with how far the pin missed.
 *
 * Full marks anywhere inside `perfectDistanceKm` (a city-sized bullseye — you
 * shouldn't need to hit the exact rooftop), tapering to nothing at
 * `zeroDistanceKm`. Never partially credits a wrong hemisphere.
 *
 * Server-authoritative: the pin is the whole answer, and the landmark's real
 * point is looked up here from the slug rather than trusted from the client.
 */
export const scorePinLandmark = ({
  challenge,
  pin,
}: {
  challenge: PinLandmarkChallenge
  pin: LatLng | undefined
}): { scored: number; maximum: number; distanceKm?: number } => {
  const maximum = challenge.maximumPoints
  const landmark = LANDMARKS[challenge.slug]
  if (!pin || !landmark?.coordinates) return { scored: 0, maximum }

  const distanceKm = haversineKm(pin, landmark.coordinates)
  const scored = scorePinDistance({
    distanceKm,
    perfectDistanceKm: challenge.perfectDistanceKm,
    zeroDistanceKm: challenge.zeroDistanceKm,
    maximumPoints: maximum,
  })
  return { scored, maximum, distanceKm }
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
  return { scored: attemptDecayScore(probes, maximum), maximum }
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
  return { scored: clampScore(scored, maximum), maximum }
}

export const getGroupChallenge = ({ game }: { game: gameTypes.Game }) => {
  const playerIds = Object.keys(game.players)
  const pool = playableCountries(game)

  // Continental pools are small — a full lobby on hard could ask for more
  // countries than the continent has data for. Shrink the hand per player
  // rather than refusing to deal (never below a rankable three).
  const configured = DIFFICULTY_CONFIGURATION[game.difficulty].rankingChallengeCountries
  const perPlayer = Math.max(3, Math.min(configured, Math.floor(pool.length / playerIds.length)))
  const required = perPlayer * playerIds.length

  // Round 1 doubles as the tutorial — it stays on universally comfortable
  // stats. Heavy-group accessors (conflicts) never open a game.
  const opener = game.rounds.length === 0

  // Source data drifts between regenerations and some accessors end up with
  // little or no data — only ever deal a challenge that can fill the round,
  // otherwise players get a question with zero countries to rank.
  const viable = Object.values(GROUP_CHALLENGES).filter(challenge => {
    if (!isAccessorEnabled(game, challenge.id)) return false
    if (opener && HEAVY_ACCESSORS.has(challenge.id)) return false
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

  const base = sample(viable)!

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
    /** The widen set when `pool` can't fill the table — pass the game's
     *  in-play world pool so benched micro-nations never turn up as decoys. */
    widen?: ISOCountryCode[]
  } = {}
): ISOCountryCode[] | undefined => {
  const eligible = (list: ISOCountryCode[]) =>
    list.filter(isoCode => isoCode !== country && (opts.eligible?.(isoCode) ?? true))

  // Widen to the whole (in-play) world when the board pool can't fill the table.
  let candidates = eligible(pool)
  if (candidates.length < count) candidates = eligible(opts.widen ?? [...ISOCountryCodes])
  if (candidates.length < count) return undefined

  if (opts.similarity) {
    const shortlist = [...candidates]
      .sort((a, b) => opts.similarity!(a) - opts.similarity!(b))
      .slice(0, Math.max(count, opts.similarityShortlist ?? 8))
    return shuffleArray(shortlist).slice(0, count)
  }

  if (opts.preferRegion) {
    const region = COUNTRIES[country].region
    const regional = shuffleArray(
      candidates.filter(isoCode => COUNTRIES[isoCode].region === region)
    )
    const filler = shuffleArray(candidates.filter(isoCode => !regional.includes(isoCode)))
    return [...regional, ...filler].slice(0, count)
  }

  return shuffleArray(candidates).slice(0, count)
}

/** Flag-pick: the real flag among the three most colour-confusable decoys. */
const dealFlagPick = (
  country: ISOCountryCode,
  pool: ISOCountryCode[],
  world: ISOCountryCode[]
): Partial<IndividualChallenge> | undefined => {
  const palette = COUNTRIES[country].identity?.colors ?? []
  const decoys = pickDecoys(country, pool, 3, {
    similarity: isoCode => flagPaletteDistance(palette, COUNTRIES[isoCode].identity?.colors ?? []),
    widen: world,
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
  pool: ISOCountryCode[],
  world: ISOCountryCode[]
): { country: ISOCountryCode; options: ISOCountryCode[]; variant: 'flag-twins' } | undefined => {
  // The subject needs a usable palette AND ≥3 palette-twins (among countries
  // in play — a benched twin can't take a decoy seat). If the passed country
  // is an emblem flag (empty palette), pick one that qualifies rather than
  // bailing — keeps the variant dealable and FORCE testing reliable.
  const hasPaletteTwins = (isoCode: ISOCountryCode): boolean => {
    const palette = COUNTRIES[isoCode].identity.simplifiedColors
    if (!palette.length) return false
    let twins = 0
    for (const other of world) {
      if (other === isoCode) continue
      if (sameSimplifiedPalette(palette, COUNTRIES[other].identity.simplifiedColors)) twins++
      if (twins >= 3) return true
    }
    return false
  }

  const subject = hasPaletteTwins(country)
    ? country
    : (shuffleArray(pool).find(hasPaletteTwins) ?? shuffleArray(world).find(hasPaletteTwins))
  if (!subject) return undefined

  const palette = COUNTRIES[subject].identity.simplifiedColors
  const decoys = pickDecoys(subject, pool, 3, {
    eligible: isoCode =>
      sameSimplifiedPalette(palette, COUNTRIES[isoCode].identity.simplifiedColors),
    widen: world,
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
  pool: ISOCountryCode[],
  world: ISOCountryCode[]
): { country: ISOCountryCode; neighbours: ISOCountryCode[] } | undefined => {
  const onBoard = new Set(pool)
  const eligible = (candidatePool: ISOCountryCode[]) =>
    shuffleArray(candidatePool).find(isoCode => {
      const neighbours = (BORDERS[isoCode] ?? []).filter((border): border is ISOCountryCode =>
        onBoard.has(border as ISOCountryCode)
      )
      return neighbours.length >= BORDER_DETECTIVE_MIN && neighbours.length <= BORDER_DETECTIVE_MAX
    })

  // Prefer an on-board subject; widen to the world if the continent is too sparse.
  const country = eligible(pool) ?? eligible(world)
  if (!country) return undefined

  const neighbours = (BORDERS[country] ?? []).filter((border): border is ISOCountryCode =>
    onBoard.has(border as ISOCountryCode)
  )
  return { country, neighbours: shuffleArray(neighbours) }
}

/**
 * Money-match (hard only): "Which country uses the ¥?" — pick the country whose
 * currency the hero shows. Decoys must use a DIFFERENT currency so there's
 * exactly one right answer (the Euro-zone shares EUR across 27 countries, so a
 * naive pick could have several correct options).
 */
const dealMoneyMatch = (
  pool: ISOCountryCode[],
  world: ISOCountryCode[]
): { country: ISOCountryCode; options: ISOCountryCode[]; image?: string } | undefined => {
  const subject = shuffleArray(pool).find(isoCode => !!COUNTRIES[isoCode].currency)
  if (!subject) return undefined
  const currency = COUNTRIES[subject].currency

  const decoys = pickDecoys(subject, pool, 3, {
    preferRegion: true,
    eligible: isoCode => !!COUNTRIES[isoCode].currency && COUNTRIES[isoCode].currency !== currency,
    widen: world,
  })
  if (!decoys) return undefined

  // A banknote image when one exists — the UI falls back to the glyph hero when
  // it doesn't, so the deal is NOT gated on the image (unlike capital-match).
  const image = currency ? CURRENCIES[currency]?.image : undefined

  return { country: subject, options: shuffleArray([subject, ...decoys]), image }
}

/**
 * The single verdict for an individual gate answer, shared by the server
 * handler and the client's result beat. Strict ISO equality, with one
 * carve-out: currency questions ("Which country spends the euro?") have many
 * right answers when the currency is shared (the Euro-zone alone spans 20+
 * countries), so any submitted country spending the challenge currency wins.
 * Scoped to the currency-asking variants only — other variants on the money
 * gate (e.g. higher-lower) submit wrong-answer tokens that may coincidentally
 * share a currency with the subject.
 */
export const isCorrectIndividualAnswer = (
  challenge: Pick<IndividualChallenge, 'id' | 'country' | 'variant'>,
  isoCode: ISOCountryCode
): boolean => {
  if (isoCode === challenge.country) return true
  const variant = challenge.variant ?? 'find'
  const asksForCurrency =
    variant === 'money-match' || (variant === 'find' && challenge.id === 'currency')
  if (!asksForCurrency) return false
  const currency = COUNTRIES[challenge.country].currency
  return !!currency && COUNTRIES[isoCode]?.currency === currency
}

/**
 * Capital-match (photo): "Which country's capital is this?" — a skyline photo
 * with four flag options. Deals only where a capital photo exists; decoys
 * prefer the same region.
 */
const dealCapitalMatch = (
  pool: ISOCountryCode[],
  world: ISOCountryCode[]
): { country: ISOCountryCode; image: string; options: ISOCountryCode[] } | undefined => {
  const hasPhoto = (isoCode: ISOCountryCode) => !!CAPITALS[isoCode]?.image
  const subject = shuffleArray(pool).find(hasPhoto) ?? shuffleArray(world).find(hasPhoto)
  if (!subject) return undefined
  const image = CAPITALS[subject]!.image!

  const decoys = pickDecoys(subject, pool, 3, { preferRegion: true, widen: world })
  if (!decoys) return undefined

  return { country: subject, image, options: shuffleArray([subject, ...decoys]) }
}

/**
 * Landmark-quiz (photo): "Which country is this landmark in?" — an iconic
 * landmark photo with four flag options. Picks a random curated landmark;
 * decoys prefer the same region. The slug is carried for the reveal: the
 * dossier (name, description) and the answer marker on the result map.
 */
const dealLandmarkQuiz = (
  pool: ISOCountryCode[],
  world: ISOCountryCode[]
):
  | {
      country: ISOCountryCode
      image: string
      options: ISOCountryCode[]
      landmarkSlug: string
    }
  | undefined => {
  // Only landmarks whose country is in play — a benched micro-nation
  // (St Peter's → the Vatican) can't be the answer to anything.
  const inPlay = new Set(world)
  const entries = Object.entries(LANDMARKS).filter(([, entry]) => inPlay.has(entry.country))
  if (!entries.length) return undefined

  // Prefer a landmark whose country is on the board; else any (widen to world).
  const onBoard = new Set(pool)
  const preferred = shuffleArray(entries.filter(([, entry]) => onBoard.has(entry.country)))
  const picked = preferred[0] ?? shuffleArray(entries)[0]
  if (!picked) return undefined
  const [landmarkSlug, landmark] = picked

  const decoys = pickDecoys(landmark.country, pool, 3, { preferRegion: true, widen: world })
  if (!decoys) return undefined

  return {
    country: landmark.country,
    image: landmark.image,
    options: shuffleArray([landmark.country, ...decoys]),
    landmarkSlug,
  }
}

/** Odd-one-out: three countries share a property, `country` is the impostor. */
const dealOddOneOut = (
  difficulty: gameTypes.GameDifficulty,
  countryPool: ISOCountryCode[],
  /** Whether this is the world board — the pool alone can't tell once
   *  benched micro-nations have thinned it below the full roster. */
  isWorld: boolean
): { country: ISOCountryCode; oddOneOut: IndividualChallenge['oddOneOut'] } | undefined => {
  // A single-continent board makes "three share a region" unanswerable —
  // everything shares the region. Those games ask about language (and, on
  // hard, alliances) instead.
  const kinds: ('region' | 'language' | 'organization')[] = isWorld
    ? ['region', 'language']
    : ['language']
  if (difficulty === 'hard') kinds.push('organization')
  const kind = sample(kinds)!

  const attempt = (): ReturnType<typeof dealOddOneOut> => {
    switch (kind) {
      case 'region': {
        const pool = shuffleArray([...countryPool])
        const region = COUNTRIES[pool[0]].region
        const same = pool.filter(isoCode => COUNTRIES[isoCode].region === region).slice(0, 3)
        const odd = pool.find(isoCode => COUNTRIES[isoCode].region !== region)
        if (same.length < 3 || !odd) return undefined
        const label = titleCase(region)
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
        const same = sampleMany(speakers, 3)
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
        const same = sampleMany(members, 3)
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

/** Mid-board higher/lower gate: harder games demand a longer duel streak. */
const HIGHER_LOWER_DUELS: { [difficulty in gameTypes.GameDifficulty]: number } = {
  easy: 2,
  normal: 3,
  hard: 4,
}

/** Higher-lower: a streak of stat duels with comfortably distinct values. */
const dealHigherLower = (
  settings: { difficulty: gameTypes.GameDifficulty; challengeOverrides?: ChallengeOverrides },
  countryPool: ISOCountryCode[],
  world: ISOCountryCode[]
): Pick<IndividualChallenge, 'higherLower'> | undefined => {
  const { difficulty } = settings
  const duels = HIGHER_LOWER_DUELS[difficulty]
  const viableAccessors = shuffleArray(
    Object.values(GROUP_CHALLENGES)
      .map(challenge => challenge.id)
      .filter(accessorId => isAccessorEnabled(settings, accessorId))
  )

  // Small continental pools may not carry enough clean data for a full
  // streak on any stat — widen to the world before giving up on the variant
  for (const candidates of [countryPool, world]) {
    for (const accessorId of viableAccessors) {
      const scale = getChallengeDetails(accessorId).scale

      const pool = shuffleArray(
        candidates.filter(isoCode => !!getValueByAccessorID(isoCode, accessorId))
      )
      const pairs: { a: ISOCountryCode; b: ISOCountryCode }[] = []

      for (let index = 0; index + 1 < pool.length && pairs.length < duels; index += 2) {
        const a = pool[index]
        const b = pool[index + 1]
        const valueA = getValueByAccessorID(a, accessorId)?.amount ?? 0
        const valueB = getValueByAccessorID(b, accessorId)?.amount ?? 0
        // Skip near-ties: stale data shouldn't decide a coin-flip question. A
        // zero on an unbounded stat is missing-data noise, never a clean duel.
        if (!scale && Math.min(valueA, valueB) === 0) continue
        if (!isDecisiveGap(valueA, valueB, scale)) continue
        pairs.push({ a, b })
      }

      if (pairs.length === duels) return { higherLower: { accessorId, pairs } }
    }
  }

  return undefined
}

/** Trend gates ask for a longer streak than higher-lower — every duel ships a
 *  guaranteed riser + faller, so blind guessing stays a coin flip per round. */
const TREND_DUELS: { [difficulty in gameTypes.GameDifficulty]: number } = {
  easy: 3,
  normal: 4,
  hard: 5,
}

/** Trend-duel: which of two countries' stat is rising/falling — one decisive
 *  riser + one decisive faller per pair, a fresh metric and countries each. */
const dealTrendDuels = (
  settings: { difficulty: gameTypes.GameDifficulty; challengeOverrides?: ChallengeOverrides },
  countryPool: ISOCountryCode[],
  world: ISOCountryCode[]
): Pick<IndividualChallenge, 'trendDuels'> | undefined => {
  if (!isGroupEnabled(settings, 'trends')) return undefined
  const duels = TREND_DUELS[settings.difficulty]

  // Small continental pools may not carry a riser AND a faller on enough
  // metrics — widen to the world before giving up on the variant.
  for (const candidates of [countryPool, world]) {
    const trendDuels: NonNullable<IndividualChallenge['trendDuels']> = []
    const used = new Set<ISOCountryCode>()

    for (const metric of shuffleArray([...TREND_METRIC_IDS])) {
      if (trendDuels.length === duels) break
      let riser: ISOCountryCode | undefined
      let faller: ISOCountryCode | undefined
      for (const isoCode of shuffleArray([...candidates])) {
        if (used.has(isoCode)) continue
        const direction = readTrend(TRENDS[isoCode]?.[metric], metric)?.direction
        if (direction === 'rising') riser ??= isoCode
        if (direction === 'falling') faller ??= isoCode
        if (riser && faller) break
      }
      if (!riser || !faller) continue
      used.add(riser)
      used.add(faller)
      const [a, b] = shuffleArray([riser, faller])
      trendDuels.push({ metric, seek: Math.random() < 0.5 ? 'rising' : 'falling', a, b })
    }

    if (trendDuels.length === duels) return { trendDuels }
  }

  return undefined
}

const TRAJECTORY_OPTIONS: { [difficulty in gameTypes.GameDifficulty]: number } = {
  easy: 4,
  normal: 5,
  hard: 6,
}

/** Trajectory-match: whose chart is this? The answer comes from the pool's
 *  drama-score top decile so generic diagonals never appear; decoys prefer the
 *  answer's region but their own series must be visibly distinct, so the
 *  right pick is never a coin flip. */
const dealTrajectoryMatch = (
  settings: { difficulty: gameTypes.GameDifficulty; challengeOverrides?: ChallengeOverrides },
  countryPool: ISOCountryCode[],
  world: ISOCountryCode[]
): Pick<IndividualChallenge, 'country' | 'trajectory'> | undefined => {
  if (!isGroupEnabled(settings, 'trends')) return undefined
  const optionCount = TRAJECTORY_OPTIONS[settings.difficulty]

  for (const candidates of [countryPool, world]) {
    for (const metric of shuffleArray([...TREND_METRIC_IDS])) {
      const readings = new Map<ISOCountryCode, TrendReading>()
      const scored: { isoCode: ISOCountryCode; drama: number }[] = []
      for (const isoCode of candidates) {
        const series = TRENDS[isoCode]?.[metric]
        const reading = readTrend(series, metric)
        if (!series || !reading) continue
        readings.set(isoCode, reading)
        if (reading.direction !== 'flat')
          scored.push({ isoCode, drama: dramaScore(series, metric) })
      }
      if (scored.length < 2 || readings.size < optionCount) continue

      scored.sort((x, y) => y.drama - x.drama)
      const topDecile = scored.slice(0, Math.max(2, Math.ceil(scored.length / 10)))
      const country = sample(topDecile)!.isoCode
      const answer = readings.get(country)!

      const decoys = pickDecoys(country, candidates, optionCount - 1, {
        preferRegion: true,
        eligible: isoCode => {
          const reading = readings.get(isoCode)
          if (!reading) return false
          return (
            reading.direction !== answer.direction ||
            isDecisiveGap(reading.endAmount, answer.endAmount, TREND_METRICS[metric].scale)
          )
        },
      })
      if (!decoys) continue

      return {
        country,
        trajectory: {
          metric,
          options: shuffleArray([country, ...decoys]),
          valuesHint: settings.difficulty !== 'hard',
        },
      }
    }
  }

  return undefined
}

/** Leader-pick: who runs this country, millionaire-style (decoys same region). */
const dealLeaderPick = (
  countryPool: ISOCountryCode[],
  world: ISOCountryCode[]
): { country: ISOCountryCode; options: ISOCountryCode[] } | undefined => {
  const poolLeaders = countryPool.filter(isoCode => !!COUNTRIES[isoCode].government?.leader)
  const withLeaders =
    poolLeaders.length >= 4
      ? poolLeaders
      : world.filter(isoCode => !!COUNTRIES[isoCode].government?.leader)
  if (withLeaders.length < 4) return undefined

  const country = sample(withLeaders)!
  const decoys = pickDecoys(country, withLeaders, 3, {
    preferRegion: true,
    eligible: isoCode => !!COUNTRIES[isoCode].government?.leader,
    widen: world,
  })
  if (!decoys) return undefined

  return { country, options: shuffleArray([country, ...decoys]) }
}

/** The face to quiz on: the one political-leader selector, portrait required. */
const portraitFor = (isoCode: ISOCountryCode) => {
  const leader = politicalLeader(isoCode, { requireImage: true })
  return leader?.image ? { image: leader.image, name: leader.name } : undefined
}

/** Leader-portrait: whose face is this? Decoys prefer the same region — but
 *  never a country the pictured leader ALSO leads (Macron co-rules Andorra),
 *  or the gate has two right answers. */
const dealLeaderPortrait = (
  countryPool: ISOCountryCode[],
  world: ISOCountryCode[]
): Pick<IndividualChallenge, 'country' | 'options' | 'portrait'> | undefined => {
  const withPortraits = shuffleArray(countryPool.filter(isoCode => !!portraitFor(isoCode)))
  const country = withPortraits[0]
  if (!country) return undefined
  const portrait = portraitFor(country)
  if (!portrait) return undefined

  const decoys = pickDecoys(country, countryPool, 3, {
    preferRegion: true,
    eligible: isoCode => !countryLedBy(isoCode, portrait.name),
    widen: world,
  })
  if (!decoys) return undefined

  return { country, options: shuffleArray([country, ...decoys]), portrait }
}

/**
 * Deal an individual gate challenge. Each tile theme keeps the classic
 * find-on-the-map variant plus themed twists — the server validates every
 * variant through `isCorrectIndividualAnswer`.
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

/**
 * The find-fallback subject for the themed gates: a leader gate needs a named
 * leader and a currency gate a currency, or the phrasing has a hole in it.
 */
const pickThemedFindCountry = (
  accessorId: IndividualChallengeAccessorId,
  pool: ISOCountryCode[]
): ISOCountryCode => {
  const withProperty = (predicate: (isoCode: ISOCountryCode) => boolean) => {
    const themed = pool.filter(predicate)
    return pickSizedCountry(themed.length ? themed : pool, 'large')!
  }
  switch (accessorId) {
    case 'government.leader':
      return withProperty(isoCode => !!COUNTRIES[isoCode].government?.leader)
    case 'currency':
      return withProperty(isoCode => !!COUNTRIES[isoCode].currency)
    default:
      return pickSizedCountry(pool, 'large')!
  }
}

export const getIndividualChallenge = ({
  accessorId,
  difficulty = 'normal',
  variant = 'world',
  includeMicroNations,
  challengeOverrides,
}: {
  accessorId: IndividualChallengeAccessorId
  difficulty?: gameTypes.GameDifficulty
  variant?: gameTypes.GameVariant
  includeMicroNations?: boolean
  challengeOverrides?: ChallengeOverrides
}): IndividualChallenge => {
  const rules: gameTypes.GameRules = { difficulty, variant, includeMicroNations }
  const pool = playableCountries(rules)
  const world = playableWorldCountries(rules)
  const isWorld = variant === 'world'
  const settings = { difficulty, challengeOverrides }
  const base: IndividualChallenge = {
    _type: 'individual-challenge',
    id: accessorId,
    country: pickThemedFindCountry(accessorId, pool),
    variant: 'find',
  }

  const forced = forcedIndividualVariant()
  if (forced) {
    switch (forced) {
      case 'flag-pick': {
        const dealt = dealFlagPick(base.country, pool, world)
        return dealt ? { ...base, ...dealt } : base
      }
      case 'flag-twins': {
        const dealt = dealFlagTwins(base.country, pool, world)
        return dealt ? { ...base, ...dealt } : base
      }
      case 'border-detective': {
        const dealt = dealBorderDetective(pool, world)
        return dealt ? { ...base, variant: 'border-detective', ...dealt } : base
      }
      case 'money-match': {
        const dealt = dealMoneyMatch(pool, world)
        return dealt ? { ...base, variant: 'money-match', ...dealt } : base
      }
      case 'odd-one-out': {
        const dealt = dealOddOneOut(difficulty, pool, isWorld)
        if (dealt) return { ...base, variant: 'odd-one-out', ...dealt }
        break
      }
      case 'higher-lower': {
        const dealt = dealHigherLower(settings, pool, world)
        if (dealt) return { ...base, variant: 'higher-lower', ...dealt }
        break
      }
      case 'trend-duel': {
        const dealt = dealTrendDuels(settings, pool, world)
        if (dealt) return { ...base, variant: 'trend-duel', ...dealt }
        break
      }
      case 'trajectory-match': {
        const dealt = dealTrajectoryMatch(settings, pool, world)
        if (dealt) return { ...base, variant: 'trajectory-match', ...dealt }
        break
      }
      case 'leader-pick': {
        const dealt = dealLeaderPick(pool, world)
        if (dealt) return { ...base, variant: 'leader-pick', ...dealt }
        break
      }
      case 'outline-reveal':
        return {
          ...base,
          variant: 'outline-reveal',
          country: pickShapeFriendlyCountry(pool, world),
        }
      case 'zoom-out':
        return { ...base, variant: 'zoom-out', country: pickShapeFriendlyCountry(pool, world) }
      case 'leader-portrait': {
        const dealt = dealLeaderPortrait(pool, world)
        if (dealt) return { ...base, variant: 'leader-portrait', ...dealt }
        break
      }
      case 'capital-match': {
        const dealt = dealCapitalMatch(pool, world)
        if (dealt) return { ...base, variant: 'capital-match', ...dealt }
        break
      }
      case 'landmark-quiz': {
        const dealt = dealLandmarkQuiz(pool, world)
        if (dealt) return { ...base, variant: 'landmark-quiz', ...dealt }
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
        const dealt = dealFlagTwins(base.country, pool, world)
        if (dealt) return { ...base, ...dealt }
      }
      if (roll < 0.75) {
        const dealt = dealFlagPick(base.country, pool, world)
        if (dealt) return { ...base, ...dealt }
      }
      break
    }
    case 'isoCode': {
      // Two kinetic "name the country" gates on this tile: outline-reveal (the
      // border draws itself) and zoom-out (the map zooms out from a coastline).
      if (difficulty === 'hard' && roll < 0.25) {
        return {
          ...base,
          variant: 'outline-reveal',
          country: pickShapeFriendlyCountry(pool, world),
        }
      }
      if (roll < 0.35) {
        return { ...base, variant: 'zoom-out', country: pickShapeFriendlyCountry(pool, world) }
      }
      if (roll < 0.55) {
        const dealt = dealLandmarkQuiz(pool, world)
        if (dealt) return { ...base, variant: 'landmark-quiz', ...dealt }
      }
      if (roll < 0.7) {
        const dealt = dealBorderDetective(pool, world)
        if (dealt) return { ...base, variant: 'border-detective', ...dealt }
      }
      if (roll < 0.85) {
        const dealt = dealTrajectoryMatch(settings, pool, world)
        if (dealt) return { ...base, variant: 'trajectory-match', ...dealt }
      }
      if (roll < 0.95) {
        const dealt = dealOddOneOut(difficulty, pool, isWorld)
        if (dealt) return { ...base, variant: 'odd-one-out', ...dealt }
      }
      break
    }
    case 'capital.name': {
      // Money-match is a hard-only twist on this "knowledge" tile.
      if (difficulty === 'hard' && roll < 0.18) {
        const dealt = dealMoneyMatch(pool, world)
        if (dealt) return { ...base, variant: 'money-match', ...dealt }
      }
      if (roll < 0.2) {
        const dealt = dealCapitalMatch(pool, world)
        if (dealt) return { ...base, variant: 'capital-match', ...dealt }
      } else if (roll < 0.4) {
        const dealt = dealHigherLower(settings, pool, world)
        if (dealt) return { ...base, variant: 'higher-lower', ...dealt }
      } else if (roll < 0.6) {
        const dealt = dealLeaderPick(pool, world)
        if (dealt) return { ...base, variant: 'leader-pick', ...dealt }
      } else if (roll < 0.8) {
        const dealt = dealLeaderPortrait(pool, world)
        if (dealt) return { ...base, variant: 'leader-portrait', ...dealt }
      } else if (roll < 0.95) {
        const dealt = dealTrendDuels(settings, pool, world)
        if (dealt) return { ...base, variant: 'trend-duel', ...dealt }
      }
      break
    }
    case 'government.leader': {
      // The leadership gate: faces first, names second; the find fallback is
      // a map hunt for the phrased leader's country.
      if (roll < 0.5) {
        const dealt = dealLeaderPortrait(pool, world)
        if (dealt) return { ...base, variant: 'leader-portrait', ...dealt }
      }
      if (roll < 0.9) {
        const dealt = dealLeaderPick(pool, world)
        if (dealt) return { ...base, variant: 'leader-pick', ...dealt }
      }
      break
    }
    case 'currency': {
      // The money gate: money-match headlines here (not hard-only, unlike the
      // knowledge tile); a stat duel backs it up when a note can't be dealt.
      if (roll < 0.65) {
        const dealt = dealMoneyMatch(pool, world)
        if (dealt) return { ...base, variant: 'money-match', ...dealt }
      }
      if (roll < 0.85) {
        const dealt = dealHigherLower(settings, pool, world)
        if (dealt) return { ...base, variant: 'higher-lower', ...dealt }
      }
      break
    }
    case 'landmarks': {
      // The landmark gate: photo quizzes, with the capital skyline sibling.
      if (roll < 0.6) {
        const dealt = dealLandmarkQuiz(pool, world)
        if (dealt) return { ...base, variant: 'landmark-quiz', ...dealt }
      }
      if (roll < 0.9) {
        const dealt = dealCapitalMatch(pool, world)
        if (dealt) return { ...base, variant: 'capital-match', ...dealt }
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

// Module-scope constant: the details table is pure copy, and rebuilding a
// ~500-line literal on every call (dealers loop over it) was pure waste.
const CHALLENGE_DETAILS: {
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
  'government.leader': {
    topic: 'general knowledge',
    phrasing: 'Which country is led by {leader}?',
  },
  currency: {
    topic: 'economics',
    phrasing: 'Which country spends the {currency}?',
  },
  landmarks: {
    topic: 'geography',
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
    phrasing: 'Which of these countries has the largest population?',
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
  // Legacy — no longer dealt; kept so in-flight games keep rendering.
  'government.amountOfMilitaryConflicts': {
    topic: 'general knowledge',
    phrasing: 'Rank these countries by the number of armed conflicts they are involved in',
    markers: {
      most: 'most conflicts',
      least: 'fewest conflicts',
    },
  },
  'government.conflictsFought': {
    topic: 'general knowledge',
    phrasing:
      'Rank these countries by distinct armed conflicts fought as a warring party since 1946',
    markers: {
      most: 'most conflicts',
      least: 'fewest conflicts',
    },
  },
  'government.yearsAtWar': {
    topic: 'general knowledge',
    phrasing:
      'Rank these countries by how many years since 1946 they have spent in a conflict at war intensity',
    markers: {
      most: 'most years at war',
      least: 'fewest years at war',
    },
    // Bounded: 1946 through the current UCDP vintage (2024).
    scale: { min: 0, max: 79 },
  },
  'government.recentConflicts': {
    topic: 'general knowledge',
    phrasing:
      'Rank these countries by armed conflicts they have been party to in the last five years',
    markers: {
      most: 'most recent conflicts',
      least: 'fewest recent conflicts',
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
  'government.humanDevelopmentIndex': {
    topic: 'general knowledge',
    phrasing: 'Rank these countries by their Human Development Index',
    markers: {
      most: 'most developed',
      least: 'least developed',
    },
    scale: { min: 0, max: 1 },
  },
  'government.happiness': {
    topic: 'general knowledge',
    phrasing: 'Rank these countries by their World Happiness score',
    markers: {
      most: 'happiest',
      least: 'least happy',
    },
    // Cantril-ladder scores run roughly 1–8 in practice; a 0–10 band keeps the
    // plotted marker legible against the ladder's full theoretical range.
    scale: { min: 0, max: 10 },
  },
  'economics.gdpTotal': {
    topic: 'economics',
    phrasing: 'Rank these countries by total GDP (purchasing power parity)',
    markers: {
      most: 'largest economy',
      least: 'smallest economy',
    },
  },
  'economics.gdpGrowth': {
    topic: 'economics',
    phrasing: 'Rank these countries by their GDP growth rate',
    markers: {
      most: 'fastest growing',
      least: 'slowest growing',
    },
  },
  'economics.publicDebt': {
    topic: 'economics',
    phrasing: 'Rank these countries by public debt as a percentage of GDP',
    markers: {
      most: 'highest debt',
      least: 'lowest debt',
    },
  },
  'infrastructure.mobileSubscriptions': {
    topic: 'infrastructure',
    phrasing: 'Rank these countries by mobile phone subscriptions per 100 people',
    markers: {
      most: 'most subscriptions',
      least: 'fewest subscriptions',
    },
  },
  'infrastructure.airports': {
    topic: 'infrastructure',
    phrasing: 'Rank these countries by number of airports',
    markers: {
      most: 'most airports',
      least: 'fewest airports',
    },
  },
  'energy.electricityAccess': {
    topic: 'energy',
    phrasing: 'Rank these countries by the percentage of people with electricity access',
    markers: {
      most: 'highest percent',
      least: 'lowest percent',
    },
  },
  'energy.fossilFuels': {
    topic: 'energy',
    phrasing: 'Rank these countries by the share of electricity from fossil fuels',
    markers: {
      most: 'highest percent',
      least: 'lowest percent',
    },
  },
  'people.netMigration': {
    topic: 'people',
    phrasing: 'Rank these countries by net migration rate per 1000 people',
    markers: {
      most: 'most inward migration',
      least: 'most outward migration',
    },
  },
  'people.birthRate': {
    topic: 'people',
    phrasing: 'Rank these countries by birth rate per 1000 people',
    markers: {
      most: 'highest birth rate',
      least: 'lowest birth rate',
    },
  },
  'people.urbanization': {
    topic: 'people',
    phrasing: 'Rank these countries by the percentage of people living in urban areas',
    markers: {
      most: 'most urban',
      least: 'most rural',
    },
  },
  'environment.methaneEmissions': {
    topic: 'environment',
    phrasing: 'Rank these countries by their methane emissions',
    markers: {
      most: 'most emissions',
      least: 'fewest emissions',
    },
  },
  'economics.touristArrivals': {
    topic: 'economics',
    phrasing: 'Rank these countries by yearly international tourist arrivals',
    markers: {
      most: 'most visited',
      least: 'least visited',
    },
  },
  'economics.workingHours': {
    topic: 'economics',
    phrasing: 'Rank these countries by annual working hours per worker',
    markers: {
      most: 'longest hours',
      least: 'shortest hours',
    },
  },
  'energy.consumptionPerCapita': {
    topic: 'energy',
    phrasing: 'Rank these countries by energy use per person',
    markers: {
      most: 'highest use',
      least: 'lowest use',
    },
  },
  'health.meatConsumption': {
    topic: 'health',
    phrasing: 'Rank these countries by meat consumption per person',
    markers: {
      most: 'most meat',
      least: 'least meat',
    },
  },
  'health.maleHeight': {
    topic: 'health',
    phrasing: 'Rank these countries by average male height',
    markers: {
      most: 'tallest',
      least: 'shortest',
    },
    // Adult male means span ~160–184 cm; a full 0-based track would bury
    // every country at the top and make the decisiveness gap unreachable.
    scale: { min: 155, max: 190 },
  },
  'health.roadDeaths': {
    topic: 'health',
    phrasing: 'Rank these countries by road-traffic deaths per 100,000 people',
    markers: {
      most: 'most deaths',
      least: 'fewest deaths',
    },
  },
  'environment.airPollution': {
    topic: 'environment',
    phrasing: 'Rank these countries by outdoor air pollution',
    markers: {
      most: 'most polluted',
      least: 'cleanest air',
    },
  },
  'environment.redListIndex': {
    topic: 'environment',
    phrasing: 'Rank these countries by how safe their wildlife is from extinction',
    markers: {
      most: 'safest wildlife',
      least: 'most at risk',
    },
    // The Red List Index is 0–1 but real countries sit ~0.4–1.
    scale: { min: 0.4, max: 1 },
  },
  'environment.threatenedMammals': {
    topic: 'environment',
    phrasing: 'Rank these countries by their number of threatened mammal species',
    markers: {
      most: 'most species',
      least: 'fewest species',
    },
  },
  'environment.protectedLand': {
    topic: 'environment',
    phrasing: 'Rank these countries by the share of their land that is protected',
    markers: {
      most: 'highest percent',
      least: 'lowest percent',
    },
  },
  'environment.freshwaterPerCapita': {
    topic: 'environment',
    phrasing: 'Rank these countries by renewable freshwater per person',
    markers: {
      most: 'most water',
      least: 'least water',
    },
  },
  'environment.evSalesShare': {
    topic: 'environment',
    phrasing: 'Rank these countries by the share of new cars sold that are electric',
    markers: {
      most: 'highest percent',
      least: 'lowest percent',
    },
  },
  'people.deathRate': {
    topic: 'people',
    phrasing: 'Rank these countries by yearly deaths per 1,000 people',
    markers: {
      most: 'highest rate',
      least: 'lowest rate',
    },
  },
  'people.density': {
    topic: 'people',
    phrasing: 'Rank these countries by population density',
    markers: {
      most: 'most dense',
      least: 'most sparse',
    },
  },
  'people.share65Plus': {
    topic: 'people',
    phrasing: 'Rank these countries by the share of people aged 65 and over',
    markers: {
      most: 'oldest',
      least: 'youngest',
    },
    // Shares run ~1–30%; a 0–100 track would bunch everyone at the bottom.
    scale: { min: 0, max: 35 },
  },
  'people.sexRatio': {
    topic: 'people',
    phrasing: 'Rank these countries by the number of men per 100 women',
    markers: {
      most: 'most men',
      least: 'most women',
    },
  },
}

/**
 * Returns client side challenge details like question copy and presentational attributes
 */
export const getChallengeDetails = (
  accessorID: IndividualChallengeAccessorId | GroupChallengeAccessorId
): ChallengeConfiguration => CHALLENGE_DETAILS[accessorID]

/** ScalePlot's prop object, flattened from a stat's ChallengeScale + ChallengeMarkers. */
export interface ScalePlotProps {
  amount: number
  min: number
  max: number
  invert?: boolean
  leastLabel: string
  mostLabel: string
}

/**
 * ScalePlot props for a bounded index (CPI, HDI, Gini, democracy, happiness);
 * undefined when the accessor has no fixed scale or the amount is missing.
 */
export const getScaleProps = (
  accessorId: IndividualChallengeAccessorId | GroupChallengeAccessorId,
  amount: number | undefined
): ScalePlotProps | undefined => {
  if (amount === undefined) return undefined
  const details = getChallengeDetails(accessorId)
  if (!details?.scale || !details.markers) return undefined
  const { min, max, invert } = details.scale
  return {
    amount,
    min,
    max,
    invert,
    leastLabel: details.markers.least,
    mostLabel: details.markers.most,
  }
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

export interface RankingBreakdownRow {
  isoCode: ISOCountryCode
  /** 1-based slot in the correct order. */
  correctPosition: number
  /** 1-based slot the player put it in; undefined when it was never placed. */
  submittedPosition?: number
  points: number
}

/**
 * Per-country ledger of a ranking round, in correct order. The scorer and the
 * scorecard's reveal both read from this, so the taught breakdown can never
 * drift from the points actually paid.
 */
export const rankingBreakdown = ({
  submitted,
  correct,
}: {
  submitted: ISOCountryCode[]
  correct: ISOCountryCode[]
}): RankingBreakdownRow[] => {
  const ranked = new Set(correct)
  const placed = [...new Set(submitted)].filter(isoCode => ranked.has(isoCode))

  return correct.map((isoCode, index) => {
    const submittedIndex = placed.indexOf(isoCode)
    return {
      isoCode,
      correctPosition: index + 1,
      submittedPosition: submittedIndex === -1 ? undefined : submittedIndex + 1,
      points:
        submittedIndex === -1
          ? 0
          : Math.max(0, MAXIMUM_SCORE_PER_COUNTRY - Math.abs(submittedIndex - index)),
    }
  })
}

/**
 * Score a ranking round: full marks per country in its exact slot, one point
 * less per slot of displacement in either direction, nothing beyond that.
 *
 * Server-authoritative: only the player's dealt hand counts, each country
 * once — a padded or foreign submission can't inflate the score (which feeds
 * board movement 1:1) or the pot.
 */
export const scoreChallengeSubmission = ({
  groupChallengeAccessorId,
  submittedRanking,
  dealtCountries,
}: {
  groupChallengeAccessorId: GroupChallengeAccessorId
  submittedRanking: ISOCountryCode[]
  dealtCountries: ISOCountryCode[]
}): {
  scored: number
  maximum: number
} => {
  const correctRanking = getCorrectRanking({ groupChallengeAccessorId, isoCodes: dealtCountries })
  const rows = rankingBreakdown({ submitted: submittedRanking, correct: correctRanking })

  return {
    scored: rows.reduce((sum, row) => sum + row.points, 0),
    maximum: dealtCountries.length * MAXIMUM_SCORE_PER_COUNTRY,
  }
}
