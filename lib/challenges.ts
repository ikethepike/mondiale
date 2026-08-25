import { ANTHEM_LYRICS } from '~~/data/anthem-lyrics.gen'
import { ANTHEMS } from '~~/data/anthems.gen'
import { BORDERS } from '~~/data/borders.gen'
import { CAPITALS } from '~~/data/capitals.gen'
import { COUNTRIES } from '~~/data/countries.gen'
import { CURRENCIES } from '~~/data/currencies.gen'
import { PLACES } from '~~/data/places.gen'
import { TONGUES } from '~~/data/tongues.gen'
import { ISOCountryCodes } from '~~/data/iso-codes.gen'
// Type-only: erased at compile, so the heavy water dataset stays a dynamic import.
import type { WaterFeature } from '~~/data/water.gen'
import { FAR_FLUNG } from '~~/data/far-flung.gen'
import { currencyNamesASpender } from '~~/lib/currency'
import {
  SWEEP_TUNING,
  sweepBoardFor,
  sweepOffBoardFor,
  sweepSlotBand,
  viableSweepSets,
} from '~~/lib/clean-sweep'
import { chronicleCountries, dealChronicleEvents } from '~~/lib/chronicle'
import { hexToRgb, sameSimplifiedPalette } from '~~/lib/palette'
import { curatedPlaces, dealableHeritage, dealableLandmarks } from '~~/lib/places'
import { SCRIPTORIUM_POOL, scriptoriumAnswers } from '~~/lib/scriptorium'
import {
  ANSWER_SHAPE_BY_KIND,
  HEAVY_ACCESSORS,
  isAccessorEnabled,
  isGroupEnabled,
  MINIMUM_TABLE_BY_KIND,
  type ChallengeOverrides,
} from '~~/types/challenges/challenge-groups.type'
import {
  type GroupChallengeAccessorId,
  GROUP_CHALLENGES,
} from '~~/types/challenges/group-challenge.type'
import type {
  AnthemBuzzChallenge,
  AtlasChallenge,
  BorderChainChallenge,
  CapitalGuessChallenge,
  CleanSweepChallenge,
  GroundPlanChallenge,
  CompositionChallenge,
  EmpireChallenge,
  FlagPaletteChallenge,
  FlashpointChallenge,
  FlashpointHint,
  FlashpointHintKind,
  HeritageHuntChallenge,
  GhostStateChallenge,
  HotColdChallenge,
  ManhuntChallenge,
  MotherTongueChallenge,
  NameWaterChallenge,
  NeighbourBlitzChallenge,
  NoMansLandChallenge,
  PinLandmarkChallenge,
  PyramidSchemeChallenge,
  SilhouetteChallenge,
  SketchChallenge,
  StarChartChallenge,
  GovernmentChallenge,
  StatDetectiveChallenge,
  TerraIncognitaChallenge,
  TimelineChallenge,
  TongueBuzzChallenge,
  TrendRaceChallenge,
  TwoTruthsChallenge,
  UniqueOrBustChallenge,
  WaterBlitzChallenge,
  WaterFeatureKind,
} from '~~/types/challenges/group-modes.type'
import { individualChallengeVariants } from '~~/types/challenges/individual-challenge.type'
import type {
  ErrataKind,
  IndividualChallenge,
  IndividualChallengeAccessorId,
} from '~~/types/challenges/individual-challenge.type'
import type {
  RoundChallenge,
  RoundChallengeKind,
  TraversalChallenge,
} from '~~/types/challenges/traversal-challenge.type'
import type { ScaleTone } from '~~/types/challenge.type'
import { ORGANIZATION_FACTS, type OrganizationVector } from '~~/types/organization.type'
import type * as gameTypes from '~~/types/game.types'
import { isValidISOCode, type Amount, type ISOCountryCode } from '~~/types/geography.types'
import {
  CONFLICT_TYPE_LABELS,
  INCOMPATIBILITY_LABELS,
  dominantConflict,
} from '~~/types/vendor/ucdp/ucdp.types'
import { sample, sampleMany, shuffleArray, weightedPick } from './arrays'
import {
  crossingsForCut,
  cutForDifficulty,
  groundPlanCities,
  groundPlanImage,
  GROUND_PLAN_LAYERS,
} from '~~/lib/ground-plan'
import { GROUND_PLAN_SECONDS_PER_LAYER, groundPlanSeconds } from '~~/lib/round-beats'
import { isBrainSeat } from './bots'
import {
  ATLAS_TABLE_SEED_OPTIONS,
  ATLAS_TARGET_LINKS,
  hasAtlasChain,
  pickAtlasSeed,
} from './atlas-chain'
import { getChallengeDetails } from './challenge-details'
import { normalizeAnswer, titleCase } from './strings'
import { EMPIRE_TUNING, empireFameWeight, subsampleKeyframes } from './empires'
import { countryName, mentionsCountry, pickSizedCountry } from './country'
import { formatNumber } from './number'
import {
  FLASHPOINT_SECONDS_PER_ERA,
  FLASHPOINT_SECONDS_PER_HINT,
  flashpointSeconds,
} from './round-beats'
import { countryLedBy, politicalLeader } from './leaders'
import {
  DIFFICULTY_CONFIGURATION,
  isCountryInPlay,
  playableCountries,
  playableWorldCountries,
} from './game-rules'
import { pickChainSeed } from './chain'
import { flagSwatches } from './audio-palette'
import { boardSpeakers } from './language-rounds'
import { seededTongueSample } from './tongue-samples'
import { initialManhuntCandidates, MANHUNT_TUNING, MINIMUM_MANHUNT_POOL } from './manhunt'
import { UNIQUE_BOARD, UNIQUE_TUNING, uniqueRegisters, uniqueViableLetters } from './unique-or-bust'
import { pickStarChart, starChartInitials, starChartSeconds } from './star-chart'
import {
  pickVanishDeck,
  terraAbsorber,
  terraCollapseThreshold,
  terraSeconds,
  TERRA_CADENCE_MS,
} from './terra-incognita'
import { haversineKm, isLabelableBox, labelBoxFor, mainlandBox, type LatLng } from './geo'
import { chainContenders } from './player'
import { pickRoundKind, ROUND_WEIGHTS } from './round-mix'
import {
  attemptDecayScore,
  attemptFraction,
  clampScore,
  jaccardFraction,
  scorePinDistance,
} from './scoring'
import { dealTimelineDeck, TIMELINE_TUNING } from './timeline'
import {
  ROSETTA_RELATIONS,
  rosettaRelationIds,
  rosettaTerms,
  type RosettaRelationId,
} from './rosetta'
import { organizationsOf } from './odd-one-out'
import { dealGovernment } from './government'
import {
  countriesGovernedByFamily,
  countriesWithGoverningLogo,
  governedOutsideFamily,
  governingParty,
  impostorParties,
  type Party,
  partiesWithLogo,
  partySpectrum,
  SPECTRUM_BANDS,
  shortPartyName,
} from './parties'
import { isNeighbour, isRouteComplete, pickTraversal, traversalWithin } from './traversal'
import {
  dramaScore,
  isDecisiveGap,
  readTrend,
  relativeGap,
  TREND_METRIC_IDS,
  TREND_METRICS,
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

/**
 * Test hook: FORCE_ROUND_TYPE=<kind> makes every round that kind
 * (FORCE_TRAVERSAL_ROUNDS=1 kept as an alias for traversal).
 */
const forcedRoundKind = (): RoundChallengeKind | undefined => {
  if (typeof process === 'undefined') return undefined
  if (process.env?.FORCE_TRAVERSAL_ROUNDS === '1') return 'traversal'
  const forced = process.env?.FORCE_ROUND_TYPE
  // hasOwn, not `in` — `in` walks the prototype chain, so 'toString' would
  // validate and be dealt as a kind.
  return forced && Object.hasOwn(ROUND_WEIGHTS, forced) ? (forced as RoundChallengeKind) : undefined
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
  'VA',
  'MC',
  'SM',
  'AD',
  'LI',
  'LU',
]

/** Can a shape-centric mode (zoom-out, outline draw) deal this country? The one
 *  gate — the camera's opening-frame test sweeps exactly this set, so a country
 *  that can be dealt is a country whose framing is covered. */
export const isShapeFriendly = (isoCode: ISOCountryCode): boolean => {
  if (SHAPE_UNFRIENDLY.includes(isoCode)) return false
  const area = COUNTRIES[isoCode].geography.area.land
  return !!area && area.amount > 20
}

const pickShapeFriendlyCountry = (
  candidates: ISOCountryCode[],
  world: ISOCountryCode[] = [...ISOCountryCodes]
): ISOCountryCode => {
  const filter = (isoCodes: ISOCountryCode[]) => isoCodes.filter(isShapeFriendly)

  // A variant pool that filters down to nothing falls back to the world
  const pool = filter(candidates)
  const viable = pool.length ? pool : filter(world)
  return sample(viable)!
}

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
 * Atlas dealer — Border Chain's letter-rule sibling; the two share the server
 * engine (chain-engine.ts) and this state shape. The seed guard lives in
 * lib/atlas-chain: a healthy opening letter over the world pool, since the
 * letters game is global even on a region board.
 */
const getAtlasChallenge = ({ game }: { game: gameTypes.Game }): AtlasChallenge | undefined => {
  const contenders = chainContenders(game)
  // Solo, there is nobody to outlast.
  if (contenders.length < 2) return undefined
  const seed = pickAtlasSeed(game, { minOptions: ATLAS_TABLE_SEED_OPTIONS })
  if (!seed) return undefined

  const strikes = game.difficulty === 'easy' ? 1 : 0
  return {
    _type: 'atlas-challenge',
    turnSeconds: DIFFICULTY_CONFIGURATION[game.difficulty].chainTurnSeconds,
    maximumPoints: maximumRoundPoints(game),
    strikes,
    // Hard's twin knives: any shared ending chains, and only placement pays.
    overlaps: game.difficulty === 'hard',
    state: {
      // The rules card holds the opening shot clock until the table is ready.
      briefing: true,
      ready: [],
      chains: [[seed]],
      order: shuffleArray(contenders),
      activeIndex: 0,
      turn: 0,
      // Stamped when the briefing lifts (atlas-turns) — staging pauses first.
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
  // Also pre-filtered by the mix (lib/round-mix `isKindFeasible`), so a small
  // table never spends a pick here — kept as defence in depth, and because
  // FORCE_ROUND_TYPE reaches this dealer without passing the picker.
  if (contenders.length < (MINIMUM_TABLE_BY_KIND.manhunt ?? 0)) return undefined
  // A board too small to hide on never deals (South America fields nine
  // viable seeds) — the real seed is picked at reveal, off the snapshot.
  if (initialManhuntCandidates(game).length < MINIMUM_MANHUNT_POOL) return undefined

  const tuning = MANHUNT_TUNING[game.difficulty]
  // The despot is the round's starring role — deal it to a human whenever
  // one is standing. Through isBrainSeat, not `.bot`: an AFK seat under
  // autopilot is brain-played too, and handing it the starring role while
  // real humans sit at the table is what this filter exists to prevent. An
  // all-bot table still gets a bot despot so the round deals at all.
  const humanContenders = contenders.filter(playerId => {
    const seat = game.players[playerId]
    return !!seat && !isBrainSeat(seat)
  })
  const despotId = sample(humanContenders.length ? humanContenders : contenders)!
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

/**
 * Clean Sweep dealer: one enumerable set, one board, everyone racing each
 * other through it. Below two players the exclusive claim is exclusive against
 * nobody, so smaller tables never see it. The set comes from the register's
 * viable entries for this table — the band's floor rises with the seats, so a
 * full table never clears a small board in seconds.
 */
const getCleanSweepChallenge = ({
  game,
}: {
  game: gameTypes.Game
}): CleanSweepChallenge | undefined => {
  const contenders = chainContenders(game)
  // Pre-filtered by the mix too — see the note in getManhuntChallenge.
  if (contenders.length < (MINIMUM_TABLE_BY_KIND['clean-sweep'] ?? 0)) return undefined

  const band = sweepSlotBand(game.difficulty, contenders.length)
  const setId = sample(viableSweepSets(game, band))
  if (!setId) return undefined
  const members = sweepBoardFor(setId, game, band)
  if (!members) return undefined

  // Members this board doesn't ask for — a claim on one is refused, never
  // benched: the prompt says "every member" and they really are members.
  const offBoard = sweepOffBoardFor(setId, game, members)

  return {
    _type: 'clean-sweep-challenge',
    setId,
    members,
    ...(offBoard.length ? { offBoard } : {}),
    durationSeconds: SWEEP_TUNING[game.difficulty].durationSeconds,
    maximumPoints: maximumRoundPoints(game),
    state: {
      briefing: true,
      ready: [],
      // Stamped when the table is briefed (sweep-beats) — no clock until then.
      deadline: 0,
      order: contenders,
      claims: [],
      strays: [],
      benched: {},
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
  // Pre-filtered by the mix too — see the note in getManhuntChallenge.
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
  // Gated on the site's own recognisability tier, the same way pin-landmark
  // gates: easy deals a country's best-known site, not its fourth.
  const pool = shuffleArray(
    dealableHeritage(game.difficulty).filter(([, site]) => playable.has(site.country))
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

/** An anthem needs a few bars before it's placeable; a speech clip is shorter
 *  and a long silence after it ends is dead air. */
const ANTHEM_BUZZ_SECONDS = 30

const TONGUE_BUZZ_SECONDS = 20

/**
 * Opening Ceremony: an anthem plays from the top, buzz early with the country.
 * Deals only where a clip shipped — coverage is good but not universal, and a
 * silent round is no round at all.
 */
const getAnthemBuzzChallenge = ({
  game,
}: {
  game: gameTypes.Game
}): AnthemBuzzChallenge | undefined => {
  const withAnthem = (pool: ISOCountryCode[]) => pool.filter(isoCode => ANTHEMS[isoCode])
  const pool = withAnthem(playableCountries(game))
  const country = sample(pool.length ? pool : withAnthem(playableWorldCountries(game)))
  if (!country) return undefined

  const anthem = ANTHEMS[country]
  if (!anthem) return undefined

  return {
    _type: 'anthem-buzz-challenge',
    country,
    clip: { webm: anthem.webm, m4a: anthem.m4a },
    durationSeconds: ANTHEM_BUZZ_SECONDS,
    maximumPoints: maximumRoundPoints(game),
    // Every difficulty unlocks these as the clip runs — an audio round gives
    // the ear nothing to reason from when it draws a blank, so hard keeps the
    // same ladder as normal rather than sitting in silence. The clock still
    // prices them (see HINT_UNLOCK_AT). Tongues rides the same rule.
    region: REGION_LABELS[COUNTRIES[country].region],
    // The flag's OWN hues, not the snapped names: `simplifiedColors`
    // holds strings like "blue", which CSS renders as generic web blue
    // rather than Sweden's. Same source the flag-palette round uses, and
    // it never comes back empty (22 emblem-heavy flags simplify to none).
    // Through the palette home, never a raw slice: on a crest-heavy flag
    // the raw list's first six entries are mostly emblem gradient.
    swatches: flagSwatches(country),
    initial: countryName(country).slice(0, 1).toUpperCase(),
    ...(ANTHEM_LYRICS.has(country) ? { lyricsUrl: `/anthems/lyrics/${country}-anthem.json` } : {}),
  }
}

/**
 * A speech clip plays — name any country where that language is official.
 * The answer is a SET, not one country: English is official in 55 of them, so
 * demanding a single code would make the most recognisable languages unfair.
 */
const getTongueBuzzChallenge = ({
  game,
}: {
  game: gameTypes.Game
}): TongueBuzzChallenge | undefined => {
  const pool = playableCountries(game)
  // Everyone who speaks it, like Mother Tongue: the round asks where a voice
  // is understood, not where a statute names it, so `boardSpeakers` reads both
  // language fields and the two rounds can't disagree about a country.
  const speakers = [...boardSpeakers(pool)].filter(([language]) => TONGUES[language])

  const entry = sample(speakers)
  if (!entry) return undefined

  const [language, countries] = entry
  // ALL the language's samples, not one: the dock plays them in sequence, so
  // three voices become continuous listening material. Shuffled at deal time —
  // the whole room hears the same order, but rounds don't always open on
  // Common Voice's first recording.
  const clips = shuffleArray(TONGUES[language]?.clips ?? [])
  if (!clips.length) return undefined

  return {
    _type: 'tongue-buzz-challenge',
    language,
    clips,
    countries,
    ...(game.variant !== 'world' ? { scope: game.variant } : {}),
    durationSeconds: TONGUE_BUZZ_SECONDS,
    maximumPoints: maximumRoundPoints(game),
    // Every difficulty unlocks these as the clip runs, matching the anthem
    // round's ladder — the clock prices them (see HINT_UNLOCK_AT). Still
    // conditional: region and initial read the first speaker country.
    ...(countries[0]
      ? {
          region: REGION_LABELS[COUNTRIES[countries[0]].region],
          speakerCount: countries.length,
          // Seeded sample for languages no anthem is sung in. Languages that
          // DO have one ship no sample: the view borrows a couple of lyric
          // lines through `tongueSampleSource`/`anthemTongueSample`, keyed off
          // `region` being present.
          ...(() => {
            const seeded = seededTongueSample(language)
            return seeded ? { sample: seeded } : {}
          })(),
          initial: countryName(countries[0]).slice(0, 1).toUpperCase(),
        }
      : {}),
  }
}

/**
 * Whether a guess is one of a tongue round's correct countries. The client pays
 * out on a buzz and the server verifies the same buzz, so both import this —
 * two membership tests would drift the moment the answer set grows a qualifier.
 */
export const speaksTongue = (challenge: TongueBuzzChallenge, guess: ISOCountryCode): boolean =>
  challenge.countries.includes(guess)

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
const TWO_TRUTHS_SECONDS = 40

/**
 * Stat detective: a mystery country's stats reveal one by one. Only the
 * accessor ids travel — clients read the values from the shared dataset.
 */
/** A recognisable photo for a country: capital skyline first (broad coverage),
 *  then any curated landmark. Used as Stat Detective's final visual clue. */
const photoClueFor = (country: ISOCountryCode): string | undefined => {
  if (CAPITALS[country]?.image) return CAPITALS[country]!.image
  const landmark = Object.values(PLACES).find(entry => entry.country === country)
  return landmark?.image
}

const getStatDetectiveChallenge = ({
  game,
}: {
  game: gameTypes.Game
}): StatDetectiveChallenge | undefined => {
  const CLUE_COUNT = 6
  const pool = shuffleArray(playableCountries(game))

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
      // The region is table stakes on every difficulty — the numbers are the
      // puzzle; the photo clue stays the finale (when the country has one).
      region: REGION_LABELS[COUNTRIES[country].region],
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
    const lieIndex = sample(chosen.map((_, index) => index)) ?? 0
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
      durationSeconds: TWO_TRUTHS_SECONDS,
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

    const pick = pickTraversal(game, members)
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
  kinds: WaterFeatureKind[],
  poolFraction = 1
): Promise<WaterBlitzChallenge | undefined> => {
  const candidates = (await waterFeaturePool(game, kinds)).filter(
    feature => feature.countries.length >= 3
  )
  const feature = sample(prominenceCandidates(candidates, poolFraction))
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

/** Highlands scales the same way: easy deals the famous ranges and deserts,
 *  normal opens the plateaus, hard deals the whole set. */
export const HIGHLANDS_TIERS: {
  [difficulty in gameTypes.GameDifficulty]: {
    kinds: WaterFeatureKind[]
    poolFraction: number
  }
} = {
  easy: { kinds: ['range', 'desert'], poolFraction: 0.2 },
  normal: { kinds: ['range', 'desert', 'plateau'], poolFraction: 0.5 },
  hard: { kinds: ['range', 'desert', 'plateau'], poolFraction: 1 },
}

/** Small variants slice thin — never starve the pool below a replayable spread. */
const WATER_MINIMUM_POOL = 8

/** A difficulty's slice of a feature pool: prominence-sorted, top fraction. */
export const prominenceCandidates = <T extends Pick<WaterFeature, 'bounds' | 'countries'>>(
  features: T[],
  poolFraction: number
): T[] => {
  const sorted = [...features].sort((a, b) => waterProminence(b) - waterProminence(a))
  const take = Math.ceil(sorted.length * poolFraction)
  return sorted.slice(0, Math.max(WATER_MINIMUM_POOL, take))
}

export const nameWaterCandidates = <T extends Pick<WaterFeature, 'bounds' | 'countries'>>(
  features: T[],
  difficulty: gameTypes.GameDifficulty
): T[] => prominenceCandidates(features, NAME_WATER_TIERS[difficulty].poolFraction)

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
    ...(feature.aliases?.length ? { aliases: feature.aliases } : {}),
    kind: feature.kind,
    countries: feature.countries,
    maximumGuesses: NAME_WATER_ATTEMPTS,
    durationSeconds: NAME_WATER_DURATION_SECONDS,
    maximumPoints: maximumRoundPoints(game),
  }
}

/** How many countries on the board speak this language. */
const MOTHER_TONGUE_MIN_SPEAKERS = 3
const MOTHER_TONGUE_MAX_SPEAKERS = 12
const getMotherTongueChallenge = (game: gameTypes.Game): MotherTongueChallenge | undefined => {
  const pool = playableCountries(game)

  // Count on-board speakers per language, keep the answerable band (a language
  // spoken by 3–12 board countries — fewer is guessable, more is a slog).
  // `boardSpeakers` counts every speaker, official or not, because that is what
  // the round asks and what it credits.
  const viable = [...boardSpeakers(pool)].filter(
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
    // A regional board's answer set is only the speakers ON it, so the round
    // has to say which board it means — and credit the off-board speakers a
    // player names instead of calling them wrong.
    ...(game.variant !== 'world' ? { scope: game.variant } : {}),
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

/** Picks allowed in the Ground Plan option variants. */
const GROUND_PLAN_ATTEMPTS = 2

/**
 * Ground Plan: a city draws itself one layer at a time on cream paper — water
 * first, then the grain, the arterials, the rail, and finally the bridges.
 * Name the city before it finishes.
 *
 * Deals only cities whose country is in play, so a win still moves a pawn
 * somewhere the board can reach. Outside hard mode a four-city table is offered
 * and the cut is a signature one; hard mode free-types a generic cut.
 */
const getGroundPlanChallenge = (game: gameTypes.Game): GroundPlanChallenge | undefined => {
  const playable = new Set(playableCountries(game))
  const roster = groundPlanCities().filter(entry => playable.has(entry.country))
  const entry = sample(roster)
  if (!entry) return undefined

  const cut = cutForDifficulty(entry.cuts, game)
  if (!cut) return undefined

  let options: string[] | undefined
  if (game.difficulty !== 'hard') {
    // Decoys are other ROSTER cities, so every option is a city whose plan the
    // round could equally have drawn — a table of unrelated names would give
    // the answer away by tone alone.
    const decoys = shuffleArray(
      groundPlanCities().filter(other => other.city !== entry.city)
    ).slice(0, game.difficulty === 'easy' ? 2 : 3)
    if (decoys.length) options = shuffleArray([entry.city, ...decoys.map(other => other.city)])
  }

  const layers = [...GROUND_PLAN_LAYERS]
  return {
    _type: 'ground-plan-challenge',
    country: entry.country,
    city: entry.city,
    cut,
    crossings: crossingsForCut(cut.slug),
    ...(entry.lesson ? { lesson: entry.lesson } : {}),
    // The skyline the reveal lands on. A roster city that is its country's
    // capital already ships a photo; a non-capital carries its own or none.
    ...(groundPlanImage(entry) ? { image: groundPlanImage(entry) } : {}),
    layers,
    secondsPerLayer: GROUND_PLAN_SECONDS_PER_LAYER,
    options,
    ...(options ? { maximumGuesses: GROUND_PLAN_ATTEMPTS } : {}),
    durationSeconds: groundPlanSeconds(layers.length),
    maximumPoints: maximumRoundPoints(game),
  }
}

/**
 * The Star Chart: the map goes dark and three capitals pulse at their true
 * coordinates — type which city each one is. Every rule of the deal (the
 * obscurity ladder, the near-pair guard, the field the variant scopes) lives
 * in lib/star-chart.ts; this only dresses the pick as a round.
 *
 * Outside hard mode the stars carry their initials as an aid — derived from
 * the same canonical names an answer matches on, so the two can't drift.
 */
const getStarChartChallenge = (game: gameTypes.Game): StarChartChallenge | undefined => {
  const stars = pickStarChart(game)
  if (!stars) return undefined

  return {
    _type: 'star-chart-challenge',
    stars,
    ...(game.difficulty === 'hard' ? {} : { initials: starChartInitials(stars) }),
    durationSeconds: starChartSeconds(stars.length),
    maximumPoints: maximumRoundPoints(game),
  }
}

/**
 * Government: one chamber, three questions — who governs, how large they are,
 * and who is with them.
 *
 * The answers are stamped onto `state.answers` here and STRIPPED by the engine
 * before the first beat rides the snapshot; `Game` reaches every socket in the
 * room, so shipping them with beat 1 would put the answer in the devtools.
 */
const getGovernmentChallenge = (game: gameTypes.Game): GovernmentChallenge | undefined => {
  const deal = dealGovernment(game, game.difficulty)
  if (!deal) return undefined

  return {
    _type: 'government-challenge',
    country: deal.country,
    ...(deal.chamber ? { chamber: deal.chamber } : {}),
    totalSeats: deal.totalSeats,
    options: deal.options,
    blocks: deal.blocks,
    benches: deal.benches.map(({ name, seats, share, color, logo }) => ({
      name,
      seats,
      share,
      ...(color ? { color } : {}),
      ...(logo ? { logo } : {}),
    })),
    sorted: deal.sorted,
    maximumPoints: maximumRoundPoints(game),
    state: {
      beat: 'party',
      turn: 0,
      deadline: 0,
      picks: { party: {}, seats: {}, sides: {} },
      scores: {},
      answers: {
        governingParty: deal.governingParty,
        governingSeats: deal.governingSeats,
        standings: Object.fromEntries(
          deal.benches.map(bench => [bench.name, bench.standing] as const)
        ),
        // Held back with the answers: the governing bench's row IS beat 2's
        // answer. Restored onto `challenge.benches` when beat 3 opens.
        benchSeats: Object.fromEntries(
          deal.benches.map(bench => [bench.name, bench.seats] as const)
        ),
        minority: deal.minority,
        ...(deal.backedSeats !== undefined ? { backedSeats: deal.backedSeats } : {}),
      },
    },
  }
}

/**
 * Terra Incognita: the atlas starts losing countries, and the round is a race
 * to notice which ones. Every rule of the deal — the legibility gate, the
 * difficulty's reach, the lean toward the overlooked, the no-adjacent-blanks
 * guard — lives in lib/terra-incognita.ts; this only dresses the deck as a
 * round and stamps the schedule the two ends replay it from.
 */
const getTerraIncognitaChallenge = (game: gameTypes.Game): TerraIncognitaChallenge | undefined => {
  const vanishings = pickVanishDeck(game)
  if (!vanishings) return undefined

  // Everything downstream sizes itself off the deck the board could actually
  // seat, never the difficulty's nominal count — a thin variant deals short.
  const cadenceMs = TERRA_CADENCE_MS[game.difficulty]
  return {
    _type: 'terra-incognita-challenge',
    vanishings,
    // Who swallows each loss, resolved once here: naming the expander restores
    // the hole just as naming the country that went does.
    absorbedBy: Object.fromEntries(
      vanishings.flatMap(isoCode => {
        const absorber = terraAbsorber(isoCode)
        return absorber ? [[isoCode, absorber] as const] : []
      })
    ),
    cadenceMs,
    collapseThreshold: terraCollapseThreshold(vanishings.length, game.difficulty),
    durationSeconds: terraSeconds(vanishings.length, cadenceMs),
    maximumPoints: maximumRoundPoints(game),
  }
}

const COMPOSITION_SECONDS = 30

const getCompositionChallenge = async (
  gameState: gameTypes.Game
): Promise<CompositionChallenge | undefined> => {
  // Board gates and thresholds live in lib/migration.ts (data rides with it);
  // loaded lazily so the corridor matrix stays out of the eager bundle.
  const { compositionBoards, hasClearLeader, corridorsToDestination } = await import('./migration')
  const pool = playableCountries(gameState)
  const boards = compositionBoards(pool)
  if (!boards.length) return undefined

  // The option table is always the bar's own origins, so it can't narrow with
  // difficulty the way capital-guess's decoy list does — hiding a slice the
  // player can see would make it unnameable. The board itself is the lever:
  // easy leads with the blowouts, hard with the boards whose top two are
  // close enough that the bar alone won't tell you. Both tiers backfill, so a
  // thin variant still deals.
  const clear = boards.filter(hasClearLeader)
  const close = boards.filter(isoCode => !hasClearLeader(isoCode))
  const ranked =
    gameState.difficulty === 'easy'
      ? [...shuffleArray(clear), ...shuffleArray(close)]
      : gameState.difficulty === 'hard'
        ? [...shuffleArray(close), ...shuffleArray(clear)]
        : shuffleArray([...boards])
  const country = ranked[0]
  if (!country) return undefined

  const slices: CompositionChallenge['slices'] = corridorsToDestination(country).map(origin => ({
    isoCode: origin.isoCode,
    share: origin.share,
  }))

  // Outside hard mode the origins on the bar are the option table — the answer
  // is already on screen, and the question is which slice leads. Hard mode
  // free-types, so the bar stays anonymous until the reveal.
  const options =
    gameState.difficulty === 'hard' ? undefined : shuffleArray(slices.map(slice => slice.isoCode))

  return {
    _type: 'composition-challenge',
    country,
    slices,
    options,
    durationSeconds: COMPOSITION_SECONDS,
    maximumPoints: maximumRoundPoints(gameState),
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
/** The vague rungs — the only ones an option variant gets, since its flag
 *  table has already narrowed the world to three or four. */
const FLASHPOINT_OPTION_HINTS: FlashpointHintKind[] = ['onset', 'tempo']
/** A neighbour sketch needs enough rings to read as a region rather than as a
 *  pointer at one country. */
const FLASHPOINT_MIN_NEIGHBOURS = 2
/** The last episode must reach this year to still count as running — UCDP's
 *  latest complete year, not "now". */
const FLASHPOINT_RUNNING_SINCE = 2023

/**
 * The hint ladder, vague → sharp, built only from UCDP fields that cannot name
 * the answer. `name` is the location string, `sideA` is always "Government of
 * <answer>", `territory` is Kashmir/Chechnya/Basque — all four are the answer
 * wearing a hat, so none of them is read here. `sideB` is skipped too: most
 * entries are safe non-state actors, but a handful name a NEIGHBOUR state
 * ("Republic of Croatia" for Serbia), which `mentionsCountry` cannot catch
 * because the leaked name isn't the subject's own.
 */
const flashpointHints = async (
  country: ISOCountryCode,
  kinds?: FlashpointHintKind[]
): Promise<FlashpointHint[]> => {
  const { CONFLICTS, CONFLICTS_BY_COUNTRY } = await import('~~/data/conflict-profiles.gen')
  const { conflictMapping } = await import('~~/data/conflicts.gen')
  const defining = dominantConflict(
    (CONFLICTS_BY_COUNTRY[country] ?? []).flatMap(id => CONFLICTS[id] ?? [])
  )
  if (!defining) return []

  const episodes = defining.episodes
  const began = episodes[0]?.[0]
  const latest = episodes[episodes.length - 1]?.[1]
  const metrics = conflictMapping[country]

  const built: (FlashpointHint | undefined)[] = [
    // Onset by DECADE, never the exact year: "the war that began in 1964" is a
    // search key, "the 1960s" is a period.
    began
      ? {
          kind: 'onset',
          text: `Its defining conflict broke out in the ${Math.floor(began / 10) * 10}s, and it ${
            (latest ?? 0) >= FLASHPOINT_RUNNING_SINCE ? 'has not finished' : 'is over'
          }.`,
        }
      : undefined,
    {
      kind: 'shape',
      text: (() => {
        const type = CONFLICT_TYPE_LABELS[defining.type].toLowerCase()
        const article = /^[aeiou]/.test(type) ? 'An' : 'A'
        return `${article} ${type}, fought over ${INCOMPATIBILITY_LABELS[defining.incompatibility]}.`
      })(),
    },
    // The rhythm of the thing: one long grind reads differently from a dozen
    // flare-ups, and neither names anybody.
    episodes.length
      ? {
          kind: 'tempo',
          text: (() => {
            if (episodes.length > 1) {
              return `It flared and died down across ${episodes.length} separate bouts.`
            }
            // A single-year episode is a border war, not a grind — "about 1
            // years of it" is both wrong and a tell that nobody proofread.
            const span = (latest ?? 0) - (began ?? 0) + 1
            return span <= 1
              ? 'It began and ended inside a single year.'
              : `One unbroken stretch of fighting, about ${formatNumber(span)} years of it.`
          })(),
        }
      : undefined,
    // The sharpest rung, and the only one drawn from the country-level metrics
    // rather than the one defining conflict. "Separate conflicts" is ACD's
    // count of distinct disputes, which is why it can read 1 under a cloud of
    // dots spanning decades — say "disputes" so it can't be misread as a
    // headcount of the events on screen, and never contradict `tempo`.
    metrics?.total
      ? {
          kind: 'scale',
          text: `${formatNumber(metrics.total)} distinct ${
            metrics.total === 1 ? 'dispute' : 'disputes'
          } on the record since 1946${
            metrics.recent
              ? ` — ${formatNumber(metrics.recent)} still live in the last five years.`
              : ', none live in the last five years.'
          }`,
        }
      : undefined,
  ]

  // The spatial rung: the NEIGHBOURS' outlines, never the answer's own shape —
  // that would just be the silhouette round's answer. Islands get nothing here.
  const neighbours = (BORDERS[country] ?? []).filter(isValidISOCode)
  if (neighbours.length >= FLASHPOINT_MIN_NEIGHBOURS) {
    built.push({ kind: 'bounds', neighbours })
  }

  const wanted = kinds ? new Set(kinds) : undefined
  return built.filter((hint): hint is FlashpointHint => {
    if (!hint || (wanted && !wanted.has(hint.kind))) return false
    // Belt and braces: the templates above never read a name field, but a
    // future one might, and a giveaway must not reach the screen.
    return !hint.text || !mentionsCountry(hint.text, country)
  })
}

/**
 * Flashpoint: a country's recorded conflict history (UCDP GED) draws itself
 * onto the blanked map as dots, era by era — name the country, the earlier the
 * more it's worth. Option variants get two picks like capital-guess; hard mode
 * free-types and scores on the clock.
 *
 * The hint ladder is NOT gated on difficulty the way the flag options are:
 * `HARD_ONLY_ROUND_KINDS` means hard is the only difficulty that deals this
 * kind in auto, so gating hints to non-hard left the mode players actually
 * meet with a blank map and no help at all.
 *
 * Dynamic import for the same reason as the water dealer: only nitro runs the
 * dealers, and the dot geometry shouldn't ride into client bundles through
 * this module.
 */
const getFlashpointChallenge = async (
  game: gameTypes.Game
): Promise<FlashpointChallenge | undefined> => {
  const { CONFLICT_FIELDS } = await import('~~/data/conflict-events.gen')
  const { CONFLICTS_BY_COUNTRY } = await import('~~/data/conflict-profiles.gen')
  const playable = new Set(playableCountries(game))
  const pool = Object.entries(CONFLICT_FIELDS).filter(
    ([isoCode, field]) =>
      playable.has(isoCode as ISOCountryCode) &&
      field!.total >= FLASHPOINT_MIN_POINTS &&
      field!.eras.length >= FLASHPOINT_MIN_ERAS &&
      // A country with dots but no ACD profile (Brazil) can't carry the ladder,
      // and its metrics read "0 conflicts since 1946" under a cloud of them.
      (CONFLICTS_BY_COUNTRY[isoCode as ISOCountryCode] ?? []).length > 0
  )
  const picked = shuffleArray(pool)[0]
  if (!picked) return undefined
  const [country, field] = picked as [ISOCountryCode, NonNullable<(typeof pool)[number][1]>]

  // Outside hard mode, offer multiple-choice flag options; hard mode free-types.
  // Decoys must be plausible hosts (have a conflict field) or they self-eliminate.
  let options: ISOCountryCode[] | undefined
  if (game.difficulty !== 'hard') {
    const decoys = pickDecoys(country, [...playable], game.difficulty === 'easy' ? 2 : 3, {
      preferRegion: true,
      eligible: isoCode => !!CONFLICT_FIELDS[isoCode],
      widen: playableWorldCountries(game),
    })
    if (decoys) options = shuffleArray([country, ...decoys])
  }

  const hints = await flashpointHints(country, options ? FLASHPOINT_OPTION_HINTS : undefined)
  const eras = field.eras.map(({ era }) => era)
  return {
    _type: 'flashpoint-challenge',
    country,
    eras,
    secondsPerEra: FLASHPOINT_SECONDS_PER_ERA,
    options,
    ...(options ? { maximumGuesses: CAPITAL_GUESS_ATTEMPTS } : {}),
    ...(hints.length ? { hints } : {}),
    secondsPerHint: FLASHPOINT_SECONDS_PER_HINT,
    durationSeconds: flashpointSeconds(eras.length, hints.length),
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
 * and there is nothing left to credit. These are the hard-mode and
 * heritage-hunt bands; easier difficulties widen via PIN_LANDMARK_TIERS.
 */
const PIN_PERFECT_KM = 150
const PIN_ZERO_KM = 3000

/** Below hard, only each country's icon landmarks deal (the fame gate) and the
 *  taper is kinder: on easy the right country is a bullseye, and only a missed
 *  continent scores nothing. */
export const PIN_LANDMARK_TIERS: {
  [difficulty in gameTypes.GameDifficulty]: {
    perfectDistanceKm: number
    zeroDistanceKm: number
  }
} = {
  easy: { perfectDistanceKm: 300, zeroDistanceKm: 5000 },
  normal: { perfectDistanceKm: 200, zeroDistanceKm: 4000 },
  hard: { perfectDistanceKm: PIN_PERFECT_KM, zeroDistanceKm: PIN_ZERO_KM },
}

const getPinLandmarkChallenge = (game: gameTypes.Game): PinLandmarkChallenge | undefined => {
  // Only curated landmarks whose coordinates survived the generator's country
  // check, and only countries this variant actually deals. The recognisability
  // gate is the entry's own `fame` tier, not its position in the map.
  const playable = new Set(playableCountries(game))
  const picked = sample(
    dealableLandmarks(game.difficulty).filter(
      ([, landmark]) => landmark.coordinates && playable.has(landmark.country)
    )
  )
  if (!picked) return undefined

  const tier = PIN_LANDMARK_TIERS[game.difficulty]
  const [slug, landmark] = picked
  return {
    _type: 'pin-landmark-challenge',
    slug,
    image: landmark.image,
    perfectDistanceKm: tier.perfectDistanceKm,
    zeroDistanceKm: tier.zeroDistanceKm,
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
 * continent's voice, never repeats an empire within a game, and weights the
 * fame tiers per difficulty (canon everywhere, deep cuts toward hard).
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
      empireFameWeight(empire.fame, game.difficulty) > 0 &&
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
  // dealt this game), then a fame-weighted empire inside it. Uniform-over-
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
    pool.map(candidate => [candidate, empireFameWeight(candidate.fame, game.difficulty)] as const)
  )
  if (!empire) return undefined

  // Non-hard helper: 3 name options, decoys drawn from the names this
  // difficulty would itself deal (same region preferred), so the choice is a
  // real one and an easy table never weighs two ghosts it has never heard of.
  // The view shows flags only when EVERY option has an honest one, so a
  // flagged answer prefers flagged decoys — flag rounds stay flag rounds
  // instead of collapsing to text over one bare card.
  let options: string[] | undefined
  if (tuning.optionCount > 0) {
    const decoyPool = Object.values(EMPIRES).filter(
      other => other.id !== empire.id && empireFameWeight(other.fame, game.difficulty) > 0
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
 * Pyramid Scheme: four age structures animate across sixty years, and the table
 * drags each country onto its own shape.
 *
 * The gate is everything here. Age structures converge — a quarter of all
 * country pairs sit under 20 apart across the 42 cohort bins, and the pairs that
 * collapse hardest are the famous ones (Britain and Norway are 5.0 apart, the US
 * and Australia 5.5). Dealt at random, four countries contain a visually
 * identical pair 85% of the time. `drawDistinctPyramids` refuses those sets, and
 * a board too thin to clear the floor returns undefined so the mix buys another
 * kind rather than dealing an unreadable round.
 */
const getPyramidSchemeChallenge = async (
  game: gameTypes.Game
): Promise<PyramidSchemeChallenge | undefined> => {
  // ~583KB of cohort frames — lazily loaded so it stays out of the eager bundle
  // (issue #110), the same way trend-race defers its series table.
  const { PYRAMID_TUNING, drawDistinctPyramids } = await import('./pyramids')
  const tuning = PYRAMID_TUNING[game.difficulty]
  const countries = drawDistinctPyramids(
    playableCountries(game),
    tuning.subjects,
    tuning.floor,
    sample
  )
  if (!countries) return undefined

  return {
    _type: 'pyramid-scheme-challenge',
    countries: shuffleArray(countries),
    distinctnessFloor: tuning.floor,
    durationSeconds: tuning.durationSeconds,
    maximumPoints: maximumRoundPoints(game),
  }
}

/**
 * Trend race: which of these countries' stat moved the most? Every dealt card
 * is a decisive mover in the same direction over a SHARED window (series
 * clipped to the latest common start year — comparing different windows would
 * be dishonest), and the winner's margin must itself be decisive. Anything
 * ambiguous falls through to the ranking fallback.
 */
const getTrendRaceChallenge = async ({
  game,
}: {
  game: gameTypes.Game
}): Promise<TrendRaceChallenge | undefined> => {
  const { TRENDS } = await import('./trends-data')
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
 * How many kinds one staging may try before taking the ranking floor. Three
 * covers the realistic stack (a data-thin dealer, then a second one hitting
 * the same thin continental pool) without letting a single round fan out into
 * a dozen dynamic dataset imports.
 */
const MAXIMUM_DEAL_ATTEMPTS = 3

/**
 * Deal the shared challenge for a round: always a ranking challenge for the
 * opening round (it doubles as the tutorial round), then the decayed mix
 * (lib/round-mix) over every group mode. A mode that can't produce a viable
 * prompt for this table yields to another kind, and only a spent attempt
 * budget falls back to a ranking round.
 */
export const getRoundChallenge = async ({
  game,
}: {
  game: gameTypes.Game
}): Promise<RoundChallenge> => {
  const forced = forcedRoundKind()
  const isFirstRound = game.rounds.length === 0

  // The test hook and the tutorial opener bypass the mix entirely.
  if (forced || isFirstRound) {
    const kind = forced ?? 'ranking'
    try {
      return (await dealRoundChallenge(kind, game)) ?? getGroupChallenge({ game })
    } catch (error) {
      console.error(
        `Round dealer '${kind}' crashed for ${game.id} — falling back to ranking`,
        error
      )
      return getGroupChallenge({ game })
    }
  }

  const contenders = chainContenders(game).length
  const spent: RoundChallengeKind[] = []

  for (let attempt = 0; attempt < MAXIMUM_DEAL_ATTEMPTS; attempt++) {
    const kind = pickRoundKind({ game, contenders, exclude: spent })
    if (!kind) break
    spent.push(kind)

    try {
      const challenge = await dealRoundChallenge(kind, game)
      if (challenge) return challenge
    } catch (error) {
      // A THROWN dealer is a data or code fault, not a thin pool — retrying
      // would spend the budget on kinds that may share the same broken
      // dataset, three stack traces deep, while the round-staging task waits.
      // Take the floor immediately and loudly (prod postmortem: timeline's
      // HK card — an escaped throw freezes the room permanently).
      console.error(
        `Round dealer '${kind}' crashed for ${game.id} — falling back to ranking`,
        error
      )
      return getGroupChallenge({ game })
    }

    // Nothing to deal for THIS table — the kind is fine, the board is thin.
    console.warn(`Round dealer '${kind}' had nothing for ${game.id} (attempt ${attempt + 1})`)
  }

  // The ranking floor. Logged with the table's shape because "ranking looks
  // over-represented" is only actionable once you know WHICH configuration
  // starves — every miss here used to be silent.
  console.warn(
    `Round mix fell back to ranking for ${game.id} after ${spent.length} attempts ` +
      `[${spent.join(', ')}] (${game.difficulty}/${game.variant}, ${contenders} players, ` +
      `round ${game.rounds.length + 1})`
  )
  return getGroupChallenge({ game })
}

/** Undefined buys another kind; a THROW takes the ranking floor — never catch here. */
type RoundDealer = (
  game: gameTypes.Game
) => RoundChallenge | undefined | Promise<RoundChallenge | undefined>

// Ranking is a first-class pick in the mix, not a fallback — its dealer always
// returns, so a pick never reads as a miss and burns an attempt.
const ROUND_DEALERS: Record<RoundChallengeKind, RoundDealer> = {
  ranking: game => getGroupChallenge({ game }),
  traversal: game => getTraversalChallenge({ game }),
  'border-chain': game => getBorderChainChallenge({ game }),
  atlas: game => getAtlasChallenge({ game }),
  manhunt: game => getManhuntChallenge({ game }),
  'unique-or-bust': game => getUniqueOrBustChallenge({ game }),
  'clean-sweep': game => getCleanSweepChallenge({ game }),
  timeline: game => getTimelineChallenge({ game }),
  empire: game => getEmpireChallenge(game),
  'heritage-hunt': game => getHeritageHuntChallenge({ game }),
  'neighbour-blitz': game => getNeighbourBlitzChallenge({ game }),
  silhouette: game => getSilhouetteChallenge({ game }),
  'anthem-buzz': game => getAnthemBuzzChallenge({ game }),
  'tongue-buzz': game => getTongueBuzzChallenge({ game }),
  'hot-cold': game => getHotColdChallenge({ game }),
  sketch: game => getSketchChallenge({ game }),
  'stat-detective': game => getStatDetectiveChallenge({ game }),
  'two-truths': game => getTwoTruthsChallenge({ game }),
  'river-run': game => getWaterBlitzChallenge(game, ['river']),
  'shared-shores': game => getWaterBlitzChallenge(game, ['sea', 'lake']),
  highlands: game => {
    const tier = HIGHLANDS_TIERS[game.difficulty]
    return getWaterBlitzChallenge(game, tier.kinds, tier.poolFraction)
  },
  'name-that-water': game => getNameWaterChallenge(game),
  'mother-tongue': game => getMotherTongueChallenge(game),
  'flag-palette': game => getFlagPaletteChallenge(game),
  'capital-guess': game => getCapitalGuessChallenge(game),
  'ground-plan': game => getGroundPlanChallenge(game),
  'star-chart': game => getStarChartChallenge(game),
  government: game => getGovernmentChallenge(game),
  'terra-incognita': game => getTerraIncognitaChallenge(game),
  composition: game => getCompositionChallenge(game),
  flashpoint: game => getFlashpointChallenge(game),
  'ghost-state': game => getGhostStateChallenge(game),
  'no-mans-land': game => getNoMansLandChallenge(game),
  'pin-landmark': game => getPinLandmarkChallenge(game),
  'trend-race': game => getTrendRaceChallenge({ game }),
  'pyramid-scheme': game => getPyramidSchemeChallenge(game),
}

/**
 * One attempt at one kind. Undefined means "nothing viable for this table" —
 * the caller decides whether that buys another kind or the ranking floor, so
 * the fallback lives in exactly one place.
 */
const dealRoundChallenge = async (
  kind: RoundChallengeKind,
  game: gameTypes.Game
): Promise<RoundChallenge | undefined> => await ROUND_DEALERS[kind](game)

/**
 * Score a traversal round from the player's full guess list (Travle rules):
 * the round is complete when the guessed countries bridge start → target,
 * and every guess beyond the minimum needed — mistakes and inefficient
 * choices alike — costs points. An unbridged guess set scores nothing.
 */
export const scoreTraversalSubmission = ({
  challenge,
  submittedGuesses,
  rules,
}: {
  challenge: TraversalChallenge
  submittedGuesses: ISOCountryCode[]
  rules: gameTypes.GameRules
}): { scored: number; maximum: number } => {
  const maximum = challenge.maximumPoints
  // The dealer's graph, re-derived — a guess off the board can't bridge here
  // any more than it could have shortened the route the round was dealt from.
  // It still counts against the guess budget: naming it was the mistake.
  const within = traversalWithin(rules, challenge.corridor?.members)

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
  const landmark = PLACES[challenge.slug]
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

/** Articles a named water feature may shed before matching ("the Baltic Sea"). */
const WATER_NAME_ARTICLES = ['the', 'el', 'la', 'il']

/**
 * Does a named-water guess hit the dealt feature? The id is authoritative; the
 * typed name is the fallback for suggestion entries carrying no id. Both the
 * round view and the submit handler resolve through this, so the score the
 * client claims and the correctness the server enforces can never drift.
 */
export const isCorrectWaterGuess = (
  challenge: Pick<NameWaterChallenge, 'featureId' | 'featureName' | 'aliases'>,
  guess: { guessedId?: string; guessedName?: string } | undefined
): boolean => {
  if (!guess) return false
  if (guess.guessedId !== undefined && guess.guessedId === challenge.featureId) return true
  if (guess.guessedName === undefined) return false
  const normalize = (name: string) => normalizeAnswer(name, { articles: WATER_NAME_ARTICLES })
  const guessed = normalize(guess.guessedName)
  // NE's own name is often not the one players know (Lake Victoria files as
  // "Nyanza"), so the alternates grade alongside the headline.
  return [challenge.featureName, ...(challenge.aliases ?? [])].some(
    name => normalize(name) === guessed
  )
}

/** Shuffles a flat hand gets before the dealer tries another stat. */
const FLAT_HAND_REDEALS = 6

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
  // otherwise players get a question with zero countries to rank. A stat the
  // whole pool agrees on is no question either (a continental pool's
  // electricity access is 100% across the board, and the round would score
  // itself): the accessor must fill the round AND split the field.
  const viable = Object.values(GROUP_CHALLENGES).filter(challenge => {
    if (!isAccessorEnabled(game, challenge.id)) return false
    if (opener && HEAVY_ACCESSORS.has(challenge.id)) return false
    let available = 0
    let firstAmount: number | undefined
    let splits = false
    for (const isoCode of pool) {
      const value = getValueByAccessorID(isoCode, challenge.id)
      if (!value) continue
      available++
      if (firstAmount === undefined) firstAmount = value.amount
      else if (value.amount !== firstAmount) splits = true
      if (available >= required && splits) return true
    }
    return false
  })

  if (!viable.length) {
    throw new EvalError('No group challenge has enough country data to fill a round')
  }

  const flatHand = (hand: ISOCountryCode[], accessorId: GroupChallengeAccessorId) =>
    new Set(hand.map(isoCode => getValueByAccessorID(isoCode, accessorId)?.amount)).size <= 1

  const dealHands = (accessorId: GroupChallengeAccessorId) => {
    const deck = shuffleArray<ISOCountryCode>([...pool]).filter(
      isoCode => !!getValueByAccessorID(isoCode, accessorId)
    )
    const hands: Record<string, ISOCountryCode[]> = {}
    for (const playerId of playerIds) hands[playerId] = deck.splice(0, perPlayer)
    return hands
  }

  // A viable accessor can still shuffle a flat hand (most of Europe ties on
  // internet access too) — re-deal, then try the other accessors, before
  // settling for the first deal. Ranking is the round mix's floor, so a
  // degenerate hand beats refusing to deal, but only as the last resort.
  let base = sample(viable)!
  let hands = dealHands(base.id)
  deal: for (const candidate of shuffleArray([...viable])) {
    for (let attempt = 0; attempt < FLAT_HAND_REDEALS; attempt++) {
      const dealt = dealHands(candidate.id)
      if (Object.values(dealt).every(hand => !flatHand(hand, candidate.id))) {
        base = candidate
        hands = dealt
        break deal
      }
    }
  }

  // Clone — GROUP_CHALLENGES entries are module singletons shared across
  // every game and round on this server; mutating them bleeds state.
  const challenge: (typeof GROUP_CHALLENGES)[keyof typeof GROUP_CHALLENGES] = {
    ...base,
    countriesPerPlayer: hands,
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
 * handler and the client's result beat. Strict ISO equality, with two
 * carve-outs.
 *
 * Currency questions ("Which country spends the euro?") have many right
 * answers when the currency is shared (the Euro-zone alone spans 20+
 * countries), so any submitted country spending the challenge currency wins.
 * Scoped to the currency-asking variants only — other variants on the money
 * gate (e.g. higher-lower) submit wrong-answer tokens that may coincidentally
 * share a currency with the subject.
 *
 * Errata's swap makes TWO countries wrong — they are wearing each other's
 * names — and the question is "find the mistake", so either one is the
 * mistake. `culprits` is the answer key; `country` is only its head.
 */
export const isCorrectIndividualAnswer = (
  challenge: Pick<IndividualChallenge, 'id' | 'country' | 'variant' | 'errata' | 'scriptorium'>,
  isoCode: ISOCountryCode
): boolean => {
  if (isoCode === challenge.country) return true
  const variant = challenge.variant ?? 'find'
  if (variant === 'errata') return !!challenge.errata?.culprits.includes(isoCode)
  // Scriptorium's set answer, the currency posture: any country where the
  // language is official wins. Recomputed here rather than read from the
  // payload — both sides of the wire resolve the same lib/scriptorium set.
  if (variant === 'scriptorium') {
    const language = challenge.scriptorium?.language
    return !!language && scriptoriumAnswers(language).includes(isoCode)
  }
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
  const entries = curatedPlaces().filter(([, entry]) => inPlay.has(entry.country))
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
  const kinds: ('region' | 'language' | 'organization' | 'party-family')[] = isWorld
    ? ['region', 'language']
    : ['language']
  if (difficulty === 'hard') kinds.push('organization')
  // Rulers. Unlike the other three this asks about GOVERNMENTS rather than
  // geography, so it needs no world board — a continental game still has
  // countries governed by social democrats and countries that are not.
  kinds.push('party-family')
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
            kind,
            value: label,
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
            kind,
            value: language,
          },
        }
      }
      case 'organization': {
        // Membership ids are read through `organizationsOf`, which drops any
        // the typed table doesn't know — a club with no entry has no name to
        // ask about.
        const byOrganization = new Map<keyof typeof OrganizationVector, ISOCountryCode[]>()
        for (const isoCode of countryPool) {
          for (const organization of organizationsOf(isoCode)) {
            const members = byOrganization.get(organization) ?? []
            members.push(isoCode)
            byOrganization.set(organization, members)
          }
        }
        const viableOrganizations = shuffleArray(
          [...byOrganization.entries()].filter(([, members]) => members.length >= 3)
        )
        const entry = viableOrganizations[0]
        if (!entry) return undefined
        const [organizationId, members] = entry
        // The shorthand, not the enum's formal name: "the OECD", never
        // "Organisation for Economic Co-operation and Development".
        const name = ORGANIZATION_FACTS[organizationId].shortName
        const memberSet = new Set(members)
        const same = sampleMany(members, 3)
        const odd = shuffleArray([...countryPool]).find(isoCode => !memberSet.has(isoCode))
        if (!odd) return undefined
        return {
          country: odd,
          oddOneOut: {
            countries: shuffleArray([...same, odd]),
            propertyLabel: `Three of these are members of ${name}`,
            kind,
            value: name,
          },
        }
      }
      case 'party-family': {
        // Families and the impostor test both come from lib/parties, so the
        // dealer and the reveal's lesson read the same join.
        const families = shuffleArray(
          [...countriesGovernedByFamily()].filter(([, governed]) => {
            const inPool = governed.filter(isoCode => countryPool.includes(isoCode))
            return inPool.length >= 3
          })
        )
        const entry = families[0]
        if (!entry) return undefined
        const [family, governed] = entry
        const same = sampleMany(
          governed.filter(isoCode => countryPool.includes(isoCode)),
          3
        )
        // The impostor must be a country we can name a government for — an
        // unknown government is not an odd one out, it is a missing answer.
        const odd = shuffleArray([...countryPool]).find(isoCode =>
          governedOutsideFamily(isoCode, family)
        )
        if (!odd) return undefined
        return {
          country: odd,
          oddOneOut: {
            countries: shuffleArray([...same, odd]),
            propertyLabel: `Three of these are governed by a party of the ${family} family`,
            kind,
            value: family,
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
const dealTrendDuels = async (
  settings: { difficulty: gameTypes.GameDifficulty; challengeOverrides?: ChallengeOverrides },
  countryPool: ISOCountryCode[],
  world: ISOCountryCode[]
): Promise<Pick<IndividualChallenge, 'trendDuels'> | undefined> => {
  if (!isGroupEnabled(settings, 'trends')) return undefined
  const { TRENDS } = await import('./trends-data')
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

/** Trajectory-match scales two ways: how many charts sit on the board, and how
 *  far a decoy's endpoint must sit from the answer's. Easy deals few options
 *  that are obviously wrong; hard deals more that ask for a real read. */
const TRAJECTORY_TUNING: {
  [difficulty in gameTypes.GameDifficulty]: {
    optionCount: number
    /** Minimum endpoint separation from the answer, as a relative gap. */
    minSeparation: number
  }
} = {
  easy: { optionCount: 3, minSeparation: 0.45 },
  normal: { optionCount: 4, minSeparation: 0.3 },
  hard: { optionCount: 5, minSeparation: 0.15 },
}

/** Trajectory-match: whose chart is this? The answer comes from the pool's
 *  drama-score top decile so generic diagonals never appear; decoys prefer the
 *  answer's region but must run the opposite direction AND end a difficulty-
 *  scaled gap away, so the right pick is never a coin flip. */
const dealTrajectoryMatch = async (
  settings: { difficulty: gameTypes.GameDifficulty; challengeOverrides?: ChallengeOverrides },
  countryPool: ISOCountryCode[],
  world: ISOCountryCode[]
): Promise<Pick<IndividualChallenge, 'country' | 'trajectory'> | undefined> => {
  if (!isGroupEnabled(settings, 'trends')) return undefined
  const { TRENDS } = await import('./trends-data')
  const { optionCount, minSeparation } = TRAJECTORY_TUNING[settings.difficulty]

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
          // Flat decoys read as filler next to a dramatic answer, so a decoy
          // must trend decisively the OTHER way, not merely "not the same way".
          if (reading.direction === 'flat') return false
          return (
            reading.direction !== answer.direction &&
            relativeGap(reading.endAmount, answer.endAmount) >= minSeparation
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

/**
 * Logo Politics: a party's logo, and one of three things to know about it.
 *
 * It never asks which IDEOLOGY a party holds. A four-option ideology question
 * has no defensible answer — most parties carry several at once and the labels
 * run to a long tail of one-offs, so "pick THE ideology" is ambiguous by
 * construction. The three questions here are all single-valued:
 *
 * - `origin` — which country is this from? Decoys prefer the same region,
 *   which makes it a reading of the logo's iconography rather than a guess at
 *   the continent.
 * - `ruling` — does this party govern the named country? Half the deals are
 *   drawn from the government and half from the opposition, so the answer is
 *   never guessable from the framing.
 * - `spectrum` — where does it sit left-to-right? `partySpectrum` collapses
 *   Wikidata's position vocabulary onto exactly one of five bands, which is
 *   what makes this askable where the raw labels are not.
 *
 * A party whose NAME gives the country away is refused throughout — that scrub
 * matters for `origin` most, but a logo reading "Sweden Democrats" also hands
 * over a `ruling` question about Sweden.
 */
const dealLogoPolitics = (
  countryPool: ISOCountryCode[],
  world: ISOCountryCode[]
): {
  country: ISOCountryCode
  options?: ISOCountryCode[]
  partyLogo: NonNullable<IndividualChallenge['partyLogo']>
} | null => {
  const askable = (isoCode: ISOCountryCode) =>
    partiesWithLogo(isoCode).filter(
      party =>
        !mentionsCountry(party.name, isoCode) &&
        !(party.endonym && mentionsCountry(party.endonym, isoCode))
    )
  const hasLogo = (isoCode: ISOCountryCode) => askable(isoCode).length > 0
  const poolWithLogos = countryPool.filter(hasLogo)
  const candidates = poolWithLogos.length >= 4 ? poolWithLogos : world.filter(hasLogo)
  if (candidates.length < 4) return null

  const country = sample(candidates)!
  const stamp = (party: Party) => ({
    image: party.logo!,
    name: party.name,
    ...(party.credit ? { credit: party.credit } : {}),
    ...(party.license ? { license: party.license } : {}),
  })

  // Deal the three questions evenly, but never let a thin subject dead-end the
  // round: a kind that cannot be built here falls through to `origin`, which
  // every logo can answer.
  const ask = sample(['origin', 'ruling', 'spectrum'] as const)!

  if (ask === 'ruling') {
    // Flip the COIN first, then find a country that can honour it. Picking the
    // country first and flipping second looks even but is not: only a third of
    // countries have an askable governing party (the rest name themselves in
    // it), so a "yes" was impossible in most of them and the realised split
    // came out 15/85 — always answering "No" scored 85%.
    const wantsYes = Math.random() < 0.5
    const governs = (isoCode: ISOCountryCode) => {
      const leader = governingParty(isoCode)
      return leader ? askable(isoCode).find(party => party === leader) : undefined
    }

    const seat = wantsYes
      ? shuffleArray(candidates).find(isoCode => governs(isoCode)?.logo)
      : shuffleArray(candidates).find(isoCode =>
          askable(isoCode).some(party => party.logo && party !== governingParty(isoCode))
        )

    if (seat) {
      const party = wantsYes
        ? governs(seat)
        : sample(askable(seat).filter(candidate => candidate !== governingParty(seat)))
      if (party?.logo) {
        return { country: seat, partyLogo: { ...stamp(party), ask: 'ruling', rules: wantsYes } }
      }
    }
  }

  if (ask === 'spectrum') {
    const party = sample(askable(country).filter(candidate => partySpectrum(candidate)))
    const band = party ? partySpectrum(party) : undefined
    if (party?.logo && band) {
      return {
        country,
        partyLogo: { ...stamp(party), ask: 'spectrum', band, bands: [...SPECTRUM_BANDS] },
      }
    }
  }

  const party = sample(askable(country))
  if (!party?.logo) return null

  const decoys = pickDecoys(country, candidates, 3, {
    preferRegion: true,
    eligible: hasLogo,
    widen: world,
  })
  if (!decoys) return null

  return {
    country,
    options: shuffleArray([country, ...decoys]),
    partyLogo: { ...stamp(party), ask: 'origin' },
  }
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

/** Countries on an errata stage. A bigger cluster is more to read, not more
 *  to know — the real difficulty lever is `ERRATA_KIND_BY_DIFFICULTY`. */
const ERRATA_LINEUP_SIZE: Record<gameTypes.GameDifficulty, number> = {
  easy: 6,
  normal: 8,
  hard: 10,
}

/** Below this the stage is too thin to hide a misprint in. */
const ERRATA_MINIMUM_LINEUP = 5

/** An impostor is one wrong name to catch; a swap is two names that are each
 *  other's, which reads as right until you know the region. */
const ERRATA_KIND_BY_DIFFICULTY: Record<gameTypes.GameDifficulty, ErrataKind> = {
  easy: 'impostor',
  normal: 'impostor',
  hard: 'swap',
}

/**
 * Errata: a connected cluster of countries wearing written names, exactly one
 * of which is wrong.
 *
 * Every member must be big enough on the map to CARRY a name — the stage is
 * the labels, so a lineup member the renderer skips is a question with a hole
 * in it. Dealer and renderer read the same `isLabelableBox` threshold over the
 * same `labelBoxFor`.
 */
/** Countries on a Rulers stage. More logos is more to read, and the frame has
 *  to stay tight enough that every one of them is legible. */
const RULERS_LINEUP_SIZE: Record<gameTypes.GameDifficulty, number> = {
  easy: 4,
  normal: 5,
  hard: 6,
}

/** Map units. Past this the cluster straggles and the frame has to pull back
 *  far enough that the logos stop reading. Measured p90 of real clusters ~320. */
const RULERS_MAX_SPAN = 360

/**
 * Rulers: a framed neighbourhood wearing its governments' logos, one of which
 * is an opposition party from its OWN country.
 *
 * Grown by PROXIMITY rather than by land border. Errata needs borders because a
 * swap between neighbours is its question; Rulers' question is political, and
 * the frame only has to look like a coherent region. Border-growing would also
 * deal Western Europe almost every time — over the eligible pool only two
 * border components can supply six countries.
 */
const dealRulers = async (
  difficulty: gameTypes.GameDifficulty,
  pool: ISOCountryCode[]
): Promise<Pick<IndividualChallenge, 'country' | 'rulers'> | undefined> => {
  const { MAP_BOUNDS, MAP_REGIONS } = await import('~~/data/map.gen')

  const onBoard = new Set(pool)
  // The SAME predicate the logo layer uses, so the dealer can never deal a
  // country the stage then silently skips.
  const canCarry = (isoCode: ISOCountryCode) => {
    const code = isoCode as keyof typeof MAP_BOUNDS
    return onBoard.has(isoCode) && isLabelableBox(labelBoxFor(MAP_BOUNDS[code], MAP_REGIONS[code]))
  }

  const centre = (isoCode: ISOCountryCode): [number, number] | undefined => {
    const box = labelBoxFor(
      MAP_BOUNDS[isoCode as keyof typeof MAP_BOUNDS],
      MAP_REGIONS[isoCode as keyof typeof MAP_REGIONS]
    )
    return box ? [box[0] + box[2] / 2, box[1] + box[3] / 2] : undefined
  }

  const eligible = countriesWithGoverningLogo().filter(canCarry)
  const size = RULERS_LINEUP_SIZE[difficulty]

  for (const seed of shuffleArray(eligible)) {
    const from = centre(seed)
    if (!from) continue
    const cluster = eligible
      .flatMap(isoCode => {
        const point = centre(isoCode)
        if (!point) return []
        return [{ isoCode, distance: Math.hypot(point[0] - from[0], point[1] - from[1]) }]
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, size)
    if (cluster.length < size) continue
    if (cluster[cluster.length - 1]!.distance * 2 > RULERS_MAX_SPAN) continue

    const lineup = cluster.map(entry => entry.isoCode)
    // Two parties whose logos read the same defeat the question — Croatia's HDZ
    // and Bosnia's HDZ BiH are different parties wearing near-identical marks.
    const marks = lineup.map(isoCode => governingParty(isoCode)?.abbreviation?.toLowerCase())
    if (new Set(marks.filter(Boolean)).size !== marks.filter(Boolean).length) continue

    const victims = shuffleArray(lineup.filter(isoCode => impostorParties(isoCode).length))
    const victim = victims[0]
    if (!victim) continue
    const impostor = sample(impostorParties(victim))
    const governing = governingParty(victim)
    if (!impostor?.logo || !governing?.logo) continue

    const logos: Partial<Record<ISOCountryCode, string>> = {}
    const names: Partial<Record<ISOCountryCode, string>> = {}
    const ratios: Partial<Record<ISOCountryCode, number>> = {}
    for (const isoCode of lineup) {
      const party = isoCode === victim ? impostor : governingParty(isoCode)
      if (party?.logo) {
        logos[isoCode] = party.logo
        // The SHORT label — a full name is wider than the country it sits on.
        names[isoCode] = shortPartyName(party)
        // The mark's shape travels with it: the stage equalises painted AREA,
        // which it cannot work out from the image path alone.
        if (party.logoRatio) ratios[isoCode] = party.logoRatio
      }
    }
    if (Object.keys(logos).length < size) continue

    return {
      country: victim,
      rulers: {
        lineup: shuffleArray([...lineup]),
        logos,
        names,
        ratios,
        trueLogo: { [victim]: governing.logo },
        trueName: { [victim]: shortPartyName(governing) },
        ...(governing.logoRatio ? { trueRatio: { [victim]: governing.logoRatio } } : {}),
        impostor: {
          name: impostor.name,
          ...(impostor.credit ? { credit: impostor.credit } : {}),
          ...(impostor.license ? { license: impostor.license } : {}),
        },
        governing: { name: governing.name },
      },
    }
  }
  return undefined
}

const dealErrata = async (
  difficulty: gameTypes.GameDifficulty,
  pool: ISOCountryCode[],
  world: ISOCountryCode[]
): Promise<Pick<IndividualChallenge, 'country' | 'errata'> | undefined> => {
  // Dynamic, like the water and ghost-state dealers: the map geometry must
  // not ride into client bundles through this module.
  const { MAP_BOUNDS, MAP_REGIONS } = await import('~~/data/map.gen')

  const onBoard = new Set(pool)
  // `labelBoxFor`, not the raw bbox — the renderer hangs the name in the
  // middle of the box it can point at, so the dealer has to ask whether THAT
  // box can carry a name. Testing the whole-country bbox would pass a country
  // whose mainland ring is too small to label, and deal a question the stage
  // then renders with a hole in it.
  const canLabel = (isoCode: ISOCountryCode) => {
    const code = isoCode as keyof typeof MAP_BOUNDS
    return onBoard.has(isoCode) && isLabelableBox(labelBoxFor(MAP_BOUNDS[code], MAP_REGIONS[code]))
  }
  const neighbours = (isoCode: ISOCountryCode) => (BORDERS[isoCode] ?? []).filter(canLabel)

  const size = ERRATA_LINEUP_SIZE[difficulty]
  // Grow outward over land borders so every member touches the stage — a
  // scattered lineup would read as a quiz, not a map.
  const grow = (seed: ISOCountryCode): ISOCountryCode[] => {
    const cluster = [seed]
    const frontier = [seed]
    while (cluster.length < size && frontier.length) {
      const current = frontier.shift() as ISOCountryCode
      for (const next of shuffleArray(neighbours(current))) {
        if (cluster.length >= size) break
        if (cluster.includes(next)) continue
        cluster.push(next)
        frontier.push(next)
      }
    }
    return cluster
  }

  // Grown lazily, first workable cluster wins — a `.map().find()` would run a
  // BFS from all ~190 seeds to use one.
  let lineup: ISOCountryCode[] | undefined
  for (const seed of shuffleArray(
    pool.filter(isoCode => canLabel(isoCode) && neighbours(isoCode).length >= 2)
  )) {
    const cluster = grow(seed)
    if (cluster.length >= ERRATA_MINIMUM_LINEUP) {
      lineup = cluster
      break
    }
  }
  if (!lineup) return undefined

  const labels: Partial<Record<ISOCountryCode, string>> = {}
  for (const isoCode of lineup) labels[isoCode] = countryName(isoCode)

  const kind = ERRATA_KIND_BY_DIFFICULTY[difficulty]
  if (kind === 'swap') {
    // Two members that actually border each other — a swap across the stage
    // is spotted by distance alone, without knowing either country.
    const pairs = lineup.flatMap(isoCode =>
      lineup.filter(other => isNeighbour(isoCode, other)).map(other => [isoCode, other] as const)
    )
    const pair = sample(pairs)
    if (!pair) return undefined
    const [first, second] = pair
    labels[first] = countryName(second)
    labels[second] = countryName(first)
    return { country: first, errata: { lineup, kind, culprits: [first, second], labels } }
  }

  const victim = sample(lineup)
  if (!victim) return undefined
  // Easy borrows a name from another continent (wrong at a glance); normal
  // borrows one from the neighbourhood, where it could almost belong.
  const region = COUNTRIES[victim].region
  const offStage = world.filter(isoCode => !lineup.includes(isoCode))
  const sameRegion = offStage.filter(isoCode => COUNTRIES[isoCode].region === region)
  const elsewhere = offStage.filter(isoCode => COUNTRIES[isoCode].region !== region)
  const preferred = difficulty === 'easy' ? elsewhere : sameRegion
  const impostor = sample(preferred.length ? preferred : offStage)
  if (!impostor) return undefined

  labels[victim] = countryName(impostor)
  return { country: victim, errata: { lineup, kind, culprits: [victim], labels } }
}

/** Which relations a gate theme deals. A themed tile stays in its own
 *  register; the tiles absent from this table (isoCode and lexicon, the only
 *  other two that deal Rosetta) fall back to all of them. */
const ROSETTA_RELATIONS_BY_ACCESSOR: Partial<
  Record<IndividualChallengeAccessorId, RosettaRelationId[]>
> = {
  'capital.name': ['capital'],
  currency: ['currency'],
  'government.leader': ['leader'],
  landmarks: ['landmark'],
}

/**
 * Rosetta: A : B :: C : ? — the exemplar pair fixes which relation is meant.
 *
 * Uniqueness and the giveaway scrub are `rosettaTerms`' job (lib/rosetta); the
 * dealer only picks. BOTH halves of the analogy come off the board: the
 * exemplar is a demonstration, and a Europe game teaching the link with
 * "Tripoli → Libya" is demonstrating on a country that isn't on the player's
 * map. Off-board terms still count for the uniqueness index — they just can't
 * be the teacher.
 *
 * Within the board the exemplar prefers ANOTHER region and a big, well-known
 * country, so the pair reads as a demonstration rather than a second question
 * or a nudge towards where to look. A single-region board can't offer one, and
 * there the nudge is worth nothing anyway — every answer is that region — so
 * the preference yields rather than sending the dealer off the map.
 */
const dealRosetta = (
  accessorId: IndividualChallengeAccessorId,
  pool: ISOCountryCode[],
  world: ISOCountryCode[]
): Pick<IndividualChallenge, 'country' | 'rosetta'> | undefined => {
  const onBoard = new Set(pool)
  const relations = shuffleArray([
    ...(ROSETTA_RELATIONS_BY_ACCESSOR[accessorId] ?? rosettaRelationIds),
  ])

  for (const relation of relations) {
    // Unique across the whole atlas, not the board: a term shared with a
    // country that happens to be off this board is still a shared term.
    const terms = rosettaTerms(relation, world)
    const answers = shuffleArray(terms.filter(entry => onBoard.has(entry.isoCode)))
    const answer = answers[0]
    if (!answer) continue

    const answerRegion = COUNTRIES[answer.isoCode].region
    const others = terms.filter(
      entry => entry.isoCode !== answer.isoCode && onBoard.has(entry.isoCode)
    )
    const abroad = others.filter(entry => COUNTRIES[entry.isoCode].region !== answerRegion)
    const candidates = abroad.length ? abroad : others
    if (!candidates.length) continue
    const exemplarCountry = pickSizedCountry(
      candidates.map(entry => entry.isoCode),
      'large'
    )
    const exemplar = candidates.find(entry => entry.isoCode === exemplarCountry) ?? candidates[0]

    return {
      country: answer.isoCode,
      rosetta: {
        relation,
        exemplar: { term: exemplar.term, isoCode: exemplar.isoCode },
        term: answer.term,
        relationLabel: ROSETTA_RELATIONS[relation].label,
      },
    }
  }

  return undefined
}

/**
 * Atlas: the name chain (Nepal → Laos → …). The letter rule, the credit and
 * the solvability proof live in lib/atlas-chain; the dealer only picks a seed
 * the rule can carry. The chain plays on the WORLD pool even in region games —
 * the letters game is global by nature — and the guard proves the target
 * reachable under the plain single-letter rule, so hard's overlap credit
 * (each junction pays its overlap length) is pure upside on a solvable deal.
 */
const dealAtlas = (
  rules: gameTypes.GameRules
): Pick<IndividualChallenge, 'country' | 'atlas'> | undefined => {
  const target = ATLAS_TARGET_LINKS[rules.difficulty]
  const seed = pickAtlasSeed(rules)
  if (!seed) return undefined
  if (!hasAtlasChain(seed, target, playableWorldCountries(rules))) return undefined
  return { country: seed, atlas: { seed, target, overlaps: rules.difficulty === 'hard' } }
}

/**
 * Scriptorium: a written sample in a mystery script — name any country where
 * the language is official, typed on every difficulty (the suggestion
 * dropdown and easy's free region hint are the relief; an option table of
 * different-script countries answered itself). The pool and the answer set
 * live in lib/scriptorium (shared with the verdict); the sample itself
 * resolves at view time through lib/tongue-samples.
 */
const dealScriptorium = (
  world: ISOCountryCode[]
): Pick<IndividualChallenge, 'country' | 'scriptorium'> | undefined => {
  const inPlay = new Set(world)
  const playable = SCRIPTORIUM_POOL.filter(entry =>
    scriptoriumAnswers(entry.language).some(isoCode => inPlay.has(isoCode))
  )
  const entry = sample(playable)
  if (!entry) return undefined

  const answers = scriptoriumAnswers(entry.language).filter(isoCode => inPlay.has(isoCode))
  // The reveal zoom's canonical speaker: the most populous in-play answer.
  const country = [...answers].sort(
    (a, b) =>
      (COUNTRIES[b].people.population?.amount ?? 0) - (COUNTRIES[a].people.population?.amount ?? 0)
  )[0]
  if (!country) return undefined
  return { country, scriptorium: { language: entry.language } }
}

/**
 * Chronicle: one country's events, dragged into order. The pool selector, the
 * spaced-hand picker and the order check live in lib/chronicle — the view
 * grades through the same module (higher-lower's client-trust posture).
 */
const dealChronicle = (
  rules: gameTypes.GameRules
): Pick<IndividualChallenge, 'country' | 'chronicle'> | undefined => {
  const difficulty = rules.difficulty ?? 'normal'
  const country = sample(chronicleCountries(rules, difficulty))
  if (!country) return undefined
  const events = dealChronicleEvents(country, difficulty)
  if (!events) return undefined
  return { country, chronicle: { events } }
}

/**
 * Far Flung: a detached piece of a country, framed alone — name the owner.
 * Subjects come from data/far-flung.gen (curated seeds resolved to map
 * rings); grading is strict ISO equality, nothing bespoke. Below hard the
 * console is a four-card option table; decoys prefer the fragment's region
 * and never include another in-play answer's owner twice.
 */
const dealFarFlung = (
  difficulty: gameTypes.GameDifficulty,
  pool: ISOCountryCode[],
  world: ISOCountryCode[]
): Pick<IndividualChallenge, 'country' | 'farFlung' | 'options'> | undefined => {
  // Subjects come off the BOARD, like every sibling dealer — a Europe game
  // must not stage Temburong. `world` stays the decoy widen set only.
  const onBoard = new Set(pool)
  const slugs = Object.keys(FAR_FLUNG).filter(slug => onBoard.has(FAR_FLUNG[slug].iso))
  const slug = sample(slugs)
  if (!slug) return undefined
  const country = FAR_FLUNG[slug].iso

  if (difficulty === 'hard') return { country, farFlung: { slug } }

  const decoys = pickDecoys(country, pool, 3, { preferRegion: true, widen: world })
  if (!decoys) return undefined
  return { country, farFlung: { slug }, options: shuffleArray([country, ...decoys]) }
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
      // "Which country spends the Danish krone?" answers itself — only deal
      // currencies whose name betrays no spender
      return withProperty(isoCode => {
        const currency = COUNTRIES[isoCode].currency
        return !!currency && !currencyNamesASpender(currency)
      })
    default:
      return pickSizedCountry(pool, 'large')!
  }
}

export const getIndividualChallenge = async ({
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
}): Promise<IndividualChallenge> => {
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
        const dealt = await dealTrendDuels(settings, pool, world)
        if (dealt) return { ...base, variant: 'trend-duel', ...dealt }
        break
      }
      case 'trajectory-match': {
        const dealt = await dealTrajectoryMatch(settings, pool, world)
        if (dealt) return { ...base, variant: 'trajectory-match', ...dealt }
        break
      }
      case 'leader-pick': {
        const dealt = dealLeaderPick(pool, world)
        if (dealt) return { ...base, variant: 'leader-pick', ...dealt }
        break
      }
      case 'logo-politics': {
        const dealt = dealLogoPolitics(pool, world)
        if (dealt) return { ...base, variant: 'logo-politics', ...dealt }
        break
      }
      case 'rulers': {
        const dealt = await dealRulers(settings.difficulty, pool)
        if (dealt) return { ...base, variant: 'rulers', ...dealt }
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
      case 'errata': {
        const dealt = await dealErrata(difficulty, pool, world)
        if (dealt) return { ...base, variant: 'errata', ...dealt }
        break
      }
      case 'rosetta': {
        const dealt = dealRosetta(accessorId, pool, [...ISOCountryCodes])
        if (dealt) return { ...base, variant: 'rosetta', ...dealt }
        break
      }
      case 'atlas': {
        const dealt = dealAtlas(rules)
        if (dealt) return { ...base, variant: 'atlas', ...dealt }
        break
      }
      case 'scriptorium': {
        const dealt = dealScriptorium(world)
        if (dealt) return { ...base, variant: 'scriptorium', ...dealt }
        break
      }
      case 'chronicle': {
        const dealt = dealChronicle(rules)
        if (dealt) return { ...base, variant: 'chronicle', ...dealt }
        break
      }
      case 'far-flung': {
        const dealt = dealFarFlung(difficulty, pool, world)
        if (dealt) return { ...base, variant: 'far-flung', ...dealt }
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
      // Three kinetic "name the country" gates on this tile: outline-reveal
      // (the border draws itself), zoom-out (the map zooms out from a
      // coastline) and far-flung (a lone fragment, camera easing out).
      if (difficulty === 'hard' && roll < 0.2) {
        return {
          ...base,
          variant: 'outline-reveal',
          country: pickShapeFriendlyCountry(pool, world),
        }
      }
      if (roll < 0.26) {
        return { ...base, variant: 'zoom-out', country: pickShapeFriendlyCountry(pool, world) }
      }
      if (roll < 0.36) {
        const dealt = await dealErrata(difficulty, pool, world)
        if (dealt) return { ...base, variant: 'errata', ...dealt }
      }
      if (roll < 0.42) {
        const dealt = dealRosetta(accessorId, pool, [...ISOCountryCodes])
        if (dealt) return { ...base, variant: 'rosetta', ...dealt }
      }
      if (roll < 0.48) {
        const dealt = dealAtlas(rules)
        if (dealt) return { ...base, variant: 'atlas', ...dealt }
      }
      if (roll < 0.6) {
        const dealt = dealFarFlung(difficulty, pool, world)
        if (dealt) return { ...base, variant: 'far-flung', ...dealt }
      }
      if (roll < 0.68) {
        const dealt = dealLandmarkQuiz(pool, world)
        if (dealt) return { ...base, variant: 'landmark-quiz', ...dealt }
      }
      if (roll < 0.78) {
        const dealt = dealBorderDetective(pool, world)
        if (dealt) return { ...base, variant: 'border-detective', ...dealt }
      }
      if (roll < 0.88) {
        const dealt = await dealTrajectoryMatch(settings, pool, world)
        if (dealt) return { ...base, variant: 'trajectory-match', ...dealt }
      }
      if (roll < 0.96) {
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
      } else if (roll < 0.32) {
        // "Tokyo : Japan :: Lima : ?" — the capital register, asked sideways.
        const dealt = dealRosetta(accessorId, pool, [...ISOCountryCodes])
        if (dealt) return { ...base, variant: 'rosetta', ...dealt }
      } else if (roll < 0.48) {
        const dealt = dealHigherLower(settings, pool, world)
        if (dealt) return { ...base, variant: 'higher-lower', ...dealt }
      } else if (roll < 0.62) {
        const dealt = dealLeaderPick(pool, world)
        if (dealt) return { ...base, variant: 'leader-pick', ...dealt }
      } else if (roll < 0.78) {
        const dealt = dealLeaderPortrait(pool, world)
        if (dealt) return { ...base, variant: 'leader-portrait', ...dealt }
      } else if (roll < 0.93) {
        const dealt = await dealTrendDuels(settings, pool, world)
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
      if (roll < 0.85) {
        const dealt = dealLeaderPick(pool, world)
        if (dealt) return { ...base, variant: 'leader-pick', ...dealt }
      }
      if (roll < 0.95) {
        const dealt = dealRosetta(accessorId, pool, [...ISOCountryCodes])
        if (dealt) return { ...base, variant: 'rosetta', ...dealt }
      }
      break
    }
    case 'government.parties': {
      // The party gate: a logo to place, then a government to spot. Both read
      // the roster, so a country with no identifiable parties falls through to
      // the find fallback rather than dealing a question with no answer.
      if (roll < 0.6) {
        const dealt = dealLogoPolitics(pool, world)
        if (dealt) return { ...base, variant: 'logo-politics', ...dealt }
      }
      if (roll < 0.95) {
        // Rulers takes the slot the party-family odd-one-out used to hold: the
        // same question, asked on the map with the logos themselves rather than
        // as a list of country names.
        const dealt = await dealRulers(settings.difficulty, pool)
        if (dealt) return { ...base, variant: 'rulers', ...dealt }
      }
      break
    }
    case 'currency': {
      // The money gate: money-match headlines here (not hard-only, unlike the
      // knowledge tile); a stat duel backs it up when a note can't be dealt.
      if (roll < 0.6) {
        const dealt = dealMoneyMatch(pool, world)
        if (dealt) return { ...base, variant: 'money-match', ...dealt }
      }
      if (roll < 0.8) {
        const dealt = dealHigherLower(settings, pool, world)
        if (dealt) return { ...base, variant: 'higher-lower', ...dealt }
      }
      if (roll < 0.92) {
        const dealt = dealRosetta(accessorId, pool, [...ISOCountryCodes])
        if (dealt) return { ...base, variant: 'rosetta', ...dealt }
      }
      break
    }
    case 'landmarks': {
      // The landmark gate: photo quizzes, with the capital skyline sibling.
      if (roll < 0.55) {
        const dealt = dealLandmarkQuiz(pool, world)
        if (dealt) return { ...base, variant: 'landmark-quiz', ...dealt }
      }
      if (roll < 0.82) {
        const dealt = dealCapitalMatch(pool, world)
        if (dealt) return { ...base, variant: 'capital-match', ...dealt }
      }
      if (roll < 0.94) {
        const dealt = dealRosetta(accessorId, pool, [...ISOCountryCodes])
        if (dealt) return { ...base, variant: 'rosetta', ...dealt }
      }
      break
    }
    // The two mode-named tiles deal their own mode and nothing else — the
    // marker on the board promises a specific question, so anything but a
    // `find` fallback when the dealer comes up empty would break that promise.
    case 'errata': {
      const dealt = await dealErrata(difficulty, pool, world)
      if (dealt) return { ...base, variant: 'errata', ...dealt }
      break
    }
    case 'lexicon': {
      // The naming tile, now three tenants: Atlas (the name chain),
      // Scriptorium (a country from its writing alone) and Rosetta. No
      // relation restriction on Rosetta here — unlike the themed tiles, which
      // each deal their own register, this one draws from all of them.
      // Switchboard and The Naming belong here too when they land.
      if (roll < 0.35) {
        const dealt = dealAtlas(rules)
        if (dealt) return { ...base, variant: 'atlas', ...dealt }
      }
      if (roll < 0.6) {
        const dealt = dealScriptorium(world)
        if (dealt) return { ...base, variant: 'scriptorium', ...dealt }
      }
      const dealt = dealRosetta(accessorId, pool, [...ISOCountryCodes])
      if (dealt) return { ...base, variant: 'rosetta', ...dealt }
      break
    }
    case 'history': {
      // The history tile is mode-named like errata/lexicon: the hourglass on
      // the board promises the timeline question, so Chronicle deals or the
      // gate falls through to `find` — never a different mode's question.
      const dealt = dealChronicle(rules)
      if (dealt) return { ...base, variant: 'chronicle', ...dealt }
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

// The copy table lives in challenge-details.ts; re-exported so callers keep
// resolving stat copy through one selector.
export { getChallengeDetails }

/** ScalePlot's prop object, flattened from a stat's ChallengeScale + ChallengeMarkers. */
export interface ScalePlotProps {
  amount: number
  min: number
  max: number
  invert?: boolean
  tone: ScaleTone
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
  const { min, max, invert, tone } = details.scale
  return {
    amount,
    min,
    max,
    invert,
    // A stat that never declared a verdict doesn't get one painted on it.
    tone: tone ?? 'neutral',
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
  /**
   * 1-based first slot of this row's tie band — the competition rank every
   * country sharing the value gets, so five countries on 100 % all read "1".
   */
  tieStart: number
  /** How many countries share this value; 1 when it stands alone. */
  tiedCount: number
  /** True when at least one other country shares this exact value. */
  tied: boolean
  /** 1-based slot the player put it in; undefined when it was never placed. */
  submittedPosition?: number
  /** Slots between the submitted slot and the nearest slot of the tie band. */
  offBy?: number
  points: number
}

/**
 * Tie bands of a correct ranking: for each slot, the inclusive 1-based range of
 * slots its value occupies. Countries sharing a value are interchangeable — the
 * sort that produced the order broke that tie arbitrarily, so scoring must not
 * hold the player to it.
 */
const rankingTieBands = ({
  correct,
  groupChallengeAccessorId,
}: {
  correct: ISOCountryCode[]
  groupChallengeAccessorId?: GroupChallengeAccessorId
}): { start: number; end: number }[] => {
  // No accessor (or a missing amount) means no value to compare: every slot
  // stands alone, exactly as before ties were understood.
  const amounts = correct.map(isoCode =>
    groupChallengeAccessorId
      ? getValueByAccessorID(isoCode, groupChallengeAccessorId)?.amount
      : undefined
  )

  const bands: { start: number; end: number }[] = new Array(correct.length)
  let index = 0
  while (index < correct.length) {
    const amount = amounts[index]
    let end = index
    while (amount !== undefined && amounts[end + 1] === amount) end++

    for (let slot = index; slot <= end; slot++) bands[slot] = { start: index + 1, end: end + 1 }
    index = end + 1
  }

  return bands
}

/** Does this ranking round hold countries the data can't tell apart? */
export const rankingHasTies = ({
  correct,
  groupChallengeAccessorId,
}: {
  correct: ISOCountryCode[]
  groupChallengeAccessorId?: GroupChallengeAccessorId
}): boolean =>
  rankingTieBands({ correct, groupChallengeAccessorId }).some(band => band.end > band.start)

/**
 * Per-country ledger of a ranking round, in correct order. The scorer and the
 * scorecard's reveal both read from this, so the taught breakdown can never
 * drift from the points actually paid.
 *
 * Countries that share a value form one tie band: any slot inside the band is
 * spot on, and displacement is measured from the band's nearest edge. Rows
 * inside a band are ordered by where the player put them — the data's own order
 * within a tie is meaningless, theirs at least reads.
 */
export const rankingBreakdown = ({
  submitted,
  correct,
  groupChallengeAccessorId,
}: {
  submitted: ISOCountryCode[]
  correct: ISOCountryCode[]
  groupChallengeAccessorId?: GroupChallengeAccessorId
}): RankingBreakdownRow[] => {
  const ranked = new Set(correct)
  const placed = [...new Set(submitted)].filter(isoCode => ranked.has(isoCode))
  const bands = rankingTieBands({ correct, groupChallengeAccessorId })

  const rows = correct.map((isoCode, index): RankingBreakdownRow => {
    const { start, end } = bands[index]
    const band = { tieStart: start, tiedCount: end - start + 1, tied: end > start }
    const submittedIndex = placed.indexOf(isoCode)
    if (submittedIndex === -1) {
      return { isoCode, correctPosition: index + 1, ...band, points: 0 }
    }

    const submittedPosition = submittedIndex + 1
    const offBy = Math.max(0, start - submittedPosition, submittedPosition - end)
    return {
      isoCode,
      correctPosition: index + 1,
      ...band,
      submittedPosition,
      offBy,
      points: clampScore(MAXIMUM_SCORE_PER_COUNTRY - offBy, MAXIMUM_SCORE_PER_COUNTRY),
    }
  })

  // Re-order within each band by the player's own slot; unplaced countries sink
  // to the band's tail. Bands themselves keep the correct order.
  return rows.sort(
    (a, b) =>
      a.tieStart - b.tieStart ||
      (a.submittedPosition ?? Infinity) - (b.submittedPosition ?? Infinity) ||
      a.correctPosition - b.correctPosition
  )
}

/** A country's standing in the scorecard's answer rows: named and in the set,
 *  in the set but never named, or named and not in the set. The ledger's row
 *  classes are these words, so the vocabulary is declared exactly once. */
export type AnswerVerdict = 'found' | 'missed' | 'stray'

export interface AnswerBreakdown {
  /** What the player named. A guess is either in the set or it is a stray. */
  yours: { isoCode: ISOCountryCode; verdict: Exclude<AnswerVerdict, 'missed'> }[]
  /** The answer key. A country in it was either found or it was missed. */
  truth: { isoCode: ISOCountryCode; verdict: Exclude<AnswerVerdict, 'stray'> }[]
  tally: { found: number; total: number; wrong: number }
}

/**
 * The scorecard's answers-vs-truth ledger, for every round kind that banks two
 * country lists. Both rows come out of one function so the reveal can never
 * mark one list by a rule the other doesn't share.
 *
 * Duplicates collapse because `blitzScore` collapses them before charging — a
 * tally that counted a repeated name twice would contradict the points paid.
 * Set-shaped kinds sort both rows by display name so the player's row reads as
 * a subsequence of the truth (the gaps ARE the misses) and pipe wrong names to
 * the tail; sequence-shaped kinds keep their order untouched.
 */
export const answerBreakdown = ({
  submitted,
  correct,
  kind,
}: {
  submitted: ISOCountryCode[]
  correct: ISOCountryCode[]
  kind: RoundChallengeKind
}): AnswerBreakdown => {
  const answers = new Set(correct)
  const named = new Set(submitted)
  const unique = [...named]

  const yours: AnswerBreakdown['yours'] = unique.map(isoCode => ({
    isoCode,
    verdict: answers.has(isoCode) ? 'found' : 'stray',
  }))
  const truth: AnswerBreakdown['truth'] = [...answers].map(isoCode => ({
    isoCode,
    verdict: named.has(isoCode) ? 'found' : 'missed',
  }))

  if (ANSWER_SHAPE_BY_KIND[kind] === 'set') {
    const byName = (a: { isoCode: ISOCountryCode }, b: { isoCode: ISOCountryCode }) =>
      countryName(a.isoCode).localeCompare(countryName(b.isoCode))
    truth.sort(byName)
    // Hits first in the shared order, then the strays piped to the tail.
    yours.sort(
      (a, b) => Number(a.verdict === 'stray') - Number(b.verdict === 'stray') || byName(a, b)
    )
  }

  const found = yours.filter(row => row.verdict === 'found').length
  return { yours, truth, tally: { found, total: answers.size, wrong: unique.length - found } }
}

/**
 * Score a ranking round: full marks per country in its exact slot — or anywhere
 * inside the band of countries sharing its value — one point less per slot of
 * displacement in either direction, nothing beyond that.
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
  const rows = rankingBreakdown({
    submitted: submittedRanking,
    correct: correctRanking,
    groupChallengeAccessorId,
  })

  return {
    scored: rows.reduce((sum, row) => sum + row.points, 0),
    maximum: dealtCountries.length * MAXIMUM_SCORE_PER_COUNTRY,
  }
}
