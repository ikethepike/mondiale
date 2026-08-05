import { SEA_NEIGHBOURS } from '~~/data/sea-lanes.gen'
import type {
  ManhuntChallenge,
  ManhuntClue,
  ManhuntMoveKind,
} from '~~/types/challenges/group-modes.type'
import type { GroupChallengeAccessorId } from '~~/types/challenges/group-challenge.type'
import { isAccessorEnabled } from '~~/types/challenges/challenge-groups.type'
import type { GameDifficulty, GameRules } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'
import { OrganizationVector } from '~~/types/organization.type'
import { sample, shuffleArray } from './arrays'
import { clampScore } from './scoring'
import { connectionsOf } from './chain'
import { getCountry, mentionsCountry } from './country'
import { distancesFrom } from './traversal'
import { getValueByAccessorID } from './values'
import { isCountryPlayable, playableCountries } from './game-rules'
import { REGION_LABELS } from './variant'

/**
 * Manhunt: detectives hunting a deposed despot on the run. The despot's trail
 * is the game's only true secret — it lives under this key, in a redis blob
 * that never enters a broadcast (the player-secret pattern), while everything
 * on the challenge state is safe for the whole table to read.
 */
export const manhuntKey = (gameId: string, roundIndex: number) => `${gameId}:manhunt:${roundIndex}`

export interface ManhuntSecret {
  /** Countries the despot has passed through; last is the current position. */
  trail: ISOCountryCode[]
  /** Authoritative candidate set — every country consistent with the clues,
   *  the dragnet misses and the movement graph. Derivable from public state,
   *  kept here so the engine never recomputes from scratch. */
  candidates: ISOCountryCode[]
  /** The live hunt beat's markers. Presence is public; WHERE is not, until
   *  the beat resolves into a dragnet aggregate. */
  markers: { [playerId: string]: ISOCountryCode }
}

// --- The sea-lane graph -----------------------------------------------------

/**
 * Two countries are sea neighbours when their coasts share a named sea. A sea
 * passage lets the despot hop between them at the price of a charge —
 * announced to the table, unlike ground movement. Precomputed from
 * data/water.gen at generation time (create-sea-lanes-file.ts): a static
 * import of the geometry here would ride into the eager server bundle.
 */
export const seaNeighboursOf = (isoCode: ISOCountryCode): ISOCountryCode[] =>
  SEA_NEIGHBOURS[isoCode] ?? []

/** Ground ∪ sea — the widest graph; capture-proximity scoring runs on it so
 *  an island hideout never scores an infinite distance. */
export const pursuitNeighboursOf = (isoCode: ISOCountryCode): ISOCountryCode[] => [
  ...new Set([...connectionsOf(isoCode), ...seaNeighboursOf(isoCode)]),
]

// --- Movement ---------------------------------------------------------------

const groundMovesOf = (isoCode: ISOCountryCode, rules: GameRules): ISOCountryCode[] => [
  ...new Set(
    connectionsOf(isoCode).filter(
      connected => connected !== isoCode && isCountryPlayable(rules, connected)
    )
  ),
]

/**
 * The despot's legal hops. Ground (border/strait) is always open; sea
 * passages need a charge, and a destination with no ground exit of its own
 * needs a FURTHER charge in reserve — the forced move must stay satisfiable,
 * so the despot can never maroon themselves on an island.
 */
export const legalManhuntMoves = (
  from: ISOCountryCode,
  seaPassagesLeft: number,
  rules: GameRules
): { ground: ISOCountryCode[]; sea: ISOCountryCode[] } => {
  const ground = groundMovesOf(from, rules)
  if (seaPassagesLeft < 1) return { ground, sea: [] }

  const groundSet = new Set(ground)
  const sea = seaNeighboursOf(from).filter(destination => {
    if (destination === from || groundSet.has(destination)) return false
    if (!isCountryPlayable(rules, destination)) return false
    return groundMovesOf(destination, rules).length > 0 || seaPassagesLeft >= 2
  })
  return { ground, sea }
}

/**
 * The timeout hop: random and free — ground when possible, a charge-burning
 * sea passage only when the despot is somewhere ground can't leave. Falling
 * back to staying put can only happen on drifted data; never throws.
 */
export const randomManhuntMove = (
  from: ISOCountryCode,
  seaPassagesLeft: number,
  rules: GameRules
): { isoCode: ISOCountryCode; kind: ManhuntMoveKind } => {
  const { ground, sea } = legalManhuntMoves(from, seaPassagesLeft, rules)
  if (ground.length) {
    return { isoCode: sample(ground)!, kind: 'ground' }
  }
  if (sea.length) {
    return { isoCode: sample(sea)!, kind: 'sea' }
  }
  return { isoCode: from, kind: 'ground' }
}

// --- The seed ---------------------------------------------------------------

/** A hunt worth running starts somewhere with real outs (mirrors the border
 *  chain's seed guard) — which also keeps island pockets out of the pool. */
const MINIMUM_SEED_MOVES = 3

/** Below this many viable seeds the board is too small to hide on (South
 *  America fields nine) — the dealer declines and another mode deals. */
export const MINIMUM_MANHUNT_POOL = 25

export const pickManhuntSeed = (rules: GameRules): ISOCountryCode | undefined => {
  const pool = shuffleArray(initialManhuntCandidates(rules))
  return pool[0]
}

/**
 * The detectives' opening knowledge: every country the seed could have been.
 * Exactly the pickManhuntSeed predicate, so the candidate engine starts sound.
 */
export const initialManhuntCandidates = (rules: GameRules): ISOCountryCode[] =>
  playableCountries(rules).filter(
    isoCode => groundMovesOf(isoCode, rules).length >= MINIMUM_SEED_MOVES
  )

// --- The candidate engine ---------------------------------------------------

/** The forced move's image: where a despot anywhere in `set` could now be. */
export const stepManhuntCandidates = (
  set: ISOCountryCode[],
  kind: ManhuntMoveKind,
  rules: GameRules
): ISOCountryCode[] => {
  const stepped = new Set<ISOCountryCode>()
  for (const isoCode of set) {
    const moves =
      kind === 'sea'
        ? seaNeighboursOf(isoCode).filter(
            destination => destination !== isoCode && isCountryPlayable(rules, destination)
          )
        : groundMovesOf(isoCode, rules)
    for (const destination of moves) stepped.add(destination)
  }
  return [...stepped]
}

/** A missed marker is a confirmed "not here". */
export const pruneManhuntCandidates = (
  set: ISOCountryCode[],
  missedMarkers: ISOCountryCode[]
): ISOCountryCode[] => {
  const missed = new Set(missedMarkers)
  return set.filter(isoCode => !missed.has(isoCode))
}

// --- The clue engine --------------------------------------------------------

/**
 * Threshold clues draw only from near-complete accessors — a cut over sparse
 * data is not a clean bisection and quietly leaks "well-documented country".
 * Coverage is asserted in lib/manhunt.test.ts so data regeneration can't rot
 * this list. Countries with no value under a dealt clue are KEPT as
 * candidates: soundness beats sharpness.
 */
export const MANHUNT_THRESHOLD_ACCESSORS: GroupChallengeAccessorId[] = [
  'people.population',
  'geography.area.total',
  'geography.area.land',
  'geography.area.arable',
  'geography.area.forested',
  'people.populationGrowthRate',
  'economics.gdpPerCapita',
  'economics.gdpTotal',
  'people.medianAge',
  'people.lifeExpectancy',
  'people.birthRate',
  'people.urbanization',
  'people.netMigration',
  'infrastructure.internetAccess',
  'infrastructure.mobileSubscriptions',
  'people.childrenPerWoman',
]

export interface ManhuntCluePick {
  clue: ManhuntClue
  /** Candidates satisfying the clue — always includes the despot's country. */
  matches: ISOCountryCode[]
}

/** Round a threshold to three significant digits so the intel line reads like
 *  intel, not like a spreadsheet. The predicate uses the SAME rounded value,
 *  so text and pruning can never disagree. */
const roundThreshold = (value: number): number => {
  if (!Number.isFinite(value) || value === 0) return value
  const magnitude = Math.floor(Math.log10(Math.abs(value)))
  const factor = Math.pow(10, Math.max(0, magnitude - 2))
  return Math.round(value / factor) * factor
}

const formatThreshold = (value: number, unit: string): string => {
  const formatted = value.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (unit === '$') return `$${formatted}`
  if (unit === '%') return `${formatted}%`
  return unit ? `${formatted} ${unit}` : formatted
}

interface ClueCandidate {
  clue: ManhuntClue
  matches: ISOCountryCode[]
  /** Set on threshold clues — lets a subpoena scope the pool to its topic. */
  accessorId?: GroupChallengeAccessorId
}

type ChallengeSettings = Parameters<typeof isAccessorEnabled>[0]

/**
 * Every possible true clue about the despot's current country, evaluated
 * against the live candidate set.
 */
const clueCandidates = (
  game: ChallengeSettings,
  despotAt: ISOCountryCode,
  candidates: ISOCountryCode[],
  hop: number,
  used: ManhuntClue[]
): ClueCandidate[] => {
  const country = getCountry(despotAt)
  const usedTexts = new Set(used.map(clue => clue.text))
  const out: ClueCandidate[] = []
  const push = (clue: ManhuntClue, matches: ISOCountryCode[]) => {
    if (usedTexts.has(clue.text)) return
    out.push({ clue, matches })
  }

  // Region — the guaranteed fallback: always defined, always true.
  push(
    {
      hop,
      kind: 'region',
      topic: 'geography',
      text: `The despot is hiding in ${REGION_LABELS[country.region]}`,
    },
    candidates.filter(isoCode => getCountry(isoCode)?.region === country.region)
  )

  // An eponymous language (Hungarian in Hungary) is a name leak, not a clue;
  // the same language stays dealable away from its eponym (Portuguese in Brazil).
  for (const language of country.languages ?? []) {
    if (mentionsCountry(language, despotAt)) continue
    push(
      {
        hop,
        kind: 'language',
        topic: 'department.communications',
        text: `Official languages there include ${language}`,
      },
      candidates.filter(isoCode => getCountry(isoCode)?.languages?.includes(language))
    )
  }

  for (const organization of country.membership ?? []) {
    push(
      {
        hop,
        kind: 'membership',
        topic: 'relations.alliance',
        text: `The country is a member of the ${OrganizationVector[organization.id]}`,
      },
      candidates.filter(isoCode =>
        getCountry(isoCode)?.membership?.some(member => member.id === organization.id)
      )
    )
  }

  for (const color of country.identity?.simplifiedColors ?? []) {
    push(
      {
        hop,
        kind: 'flag-colors',
        topic: 'relations.embassy',
        text: `The flag flying over the hideout carries ${color}`,
      },
      candidates.filter(isoCode => getCountry(isoCode)?.identity?.simplifiedColors?.includes(color))
    )
  }

  for (const accessorId of MANHUNT_THRESHOLD_ACCESSORS) {
    if (!isAccessorEnabled(game, accessorId)) continue
    const label = accessorTopic(accessorId)
    // One threshold clue per accessor per round — repeats read as filler.
    if (used.some(clue => clue.kind === 'threshold' && clue.text.startsWith(`Its ${label} `))) {
      continue
    }
    const despotValue = getValueByAccessorID(despotAt, accessorId)
    if (!despotValue || despotValue.unit === 'year') continue

    const values = candidates
      .map(isoCode => getValueByAccessorID(isoCode, accessorId)?.amount)
      .filter((amount): amount is number => amount !== undefined)
      .sort((a, b) => a - b)
    if (values.length < 4) continue

    const threshold = roundThreshold(values[Math.floor(values.length / 2)])
    const above = despotValue.amount >= threshold

    const matches = candidates.filter(isoCode => {
      const amount = getValueByAccessorID(isoCode, accessorId)?.amount
      if (amount === undefined) return true
      return amount >= threshold === above
    })
    out.push({
      clue: {
        hop,
        kind: 'threshold',
        accessorId,
        threshold,
        above,
        text: `Its ${label} is ${above ? 'at least' : 'below'} ${formatThreshold(
          threshold,
          despotValue.unit
        )}`,
      },
      matches,
      accessorId,
    })
  }

  return out.filter(candidate => !usedTexts.has(candidate.clue.text))
}

/** Lazy import breaker: lib/challenges imports this module for the dealer, so
 *  the topic labels come through a local mirror of accessorTopicLabel's output
 *  rather than importing challenges.ts back. */
const ACCESSOR_TOPICS: Partial<Record<GroupChallengeAccessorId, string>> = {
  'people.population': 'population',
  'geography.area.total': 'total area',
  'geography.area.land': 'land area',
  'geography.area.arable': 'arable land',
  'geography.area.forested': 'forested area',
  'people.populationGrowthRate': 'population growth rate',
  'economics.gdpPerCapita': 'GDP per capita',
  'economics.gdpTotal': 'total GDP',
  'people.medianAge': 'median age',
  'people.lifeExpectancy': 'life expectancy',
  'people.birthRate': 'birth rate',
  'people.urbanization': 'urbanization',
  'people.netMigration': 'net migration rate',
  'infrastructure.internetAccess': 'internet access',
  'infrastructure.mobileSubscriptions': 'mobile subscriptions',
  'people.childrenPerWoman': 'children per woman',
}

const accessorTopic = (accessorId: GroupChallengeAccessorId): string =>
  ACCESSOR_TOPICS[accessorId] ?? accessorId

/**
 * Each forced hop re-inflates the candidate set by its graph neighbourhood,
 * so a straight half-cut only fights the expansion to a standstill (the set
 * plateaus around sixty countries — measured in lib/manhunt.test.ts). Aiming
 * the cut at roughly a third converges the round to a huntable endgame while
 * staying far from a giveaway.
 */
const CLUE_TARGET_FRACTION = 0.35

/**
 * Pick the intel line for this hop: of every TRUE clue about the despot's
 * current country, the one that prunes the live candidate set closest to the
 * designed rate. The noose tightens by design; how fast is up to the players
 * — a despot hiding among statistical twins blunts every cut, and each
 * dragnet miss sharpens the next one.
 */
const bestClueCandidate = (
  pool: ClueCandidate[],
  candidates: ISOCountryCode[]
): ClueCandidate | undefined => {
  const target = Math.max(2, candidates.length * CLUE_TARGET_FRACTION)
  let best: ClueCandidate | undefined
  for (const candidate of shuffleArray(pool)) {
    // A clue matching the whole set carries no information — dealt only if
    // nothing else exists (a collapsed endgame set can make every clue moot).
    if (!best) {
      best = candidate
      continue
    }
    const bestUseless = best.matches.length === candidates.length
    const candidateUseless = candidate.matches.length === candidates.length
    if (bestUseless && !candidateUseless) {
      best = candidate
      continue
    }
    if (!bestUseless && candidateUseless) continue
    if (Math.abs(candidate.matches.length - target) < Math.abs(best.matches.length - target)) {
      best = candidate
    }
  }
  return best
}

/** The truth invariant: the despot always satisfies their own clue. Data
 *  drift must degrade, never crash the round or strand the target. */
const guardedPick = (
  best: ClueCandidate | undefined,
  despotAt: ISOCountryCode,
  candidates: ISOCountryCode[],
  hop: number
): ManhuntCluePick => {
  if (best) {
    if (!best.matches.includes(despotAt)) best.matches.push(despotAt)
    return { clue: best.clue, matches: best.matches }
  }
  // Unreachable with real data (region always produces) — total fallback.
  return {
    clue: { hop, kind: 'region', text: 'The trail has gone cold' },
    matches: [...candidates],
  }
}

export const pickManhuntClue = (
  game: ChallengeSettings,
  despotAt: ISOCountryCode,
  candidates: ISOCountryCode[],
  hop: number,
  used: ManhuntClue[]
): ManhuntCluePick => {
  const pool = clueCandidates(game, despotAt, candidates, hop, used)
  return guardedPick(bestClueCandidate(pool, candidates), despotAt, candidates, hop)
}

// --- Subpoenas ---------------------------------------------------------------

/**
 * The topics a detective may subpoena. Each scopes the clue pool: threshold
 * topics by accessor, categorical topics by clue kind. Curated so every
 * topic has near-complete data behind it.
 */
interface SubpoenaTopicIcon {
  accessor?: GroupChallengeAccessorId
  topic?: string
}
/** Widens each entry's icon literal so chips can probe both fields. */
const subpoenaIcon = (icon: SubpoenaTopicIcon): SubpoenaTopicIcon => icon

export const MANHUNT_SUBPOENA_TOPICS = [
  {
    id: 'people',
    label: 'People',
    icon: subpoenaIcon({ accessor: 'people.population' }),
    accessors: [
      'people.population',
      'people.medianAge',
      'people.lifeExpectancy',
      'people.birthRate',
      'people.urbanization',
      'people.childrenPerWoman',
    ] as GroupChallengeAccessorId[],
    kinds: [] as ManhuntClue['kind'][],
  },
  {
    id: 'economy',
    label: 'Economy',
    icon: subpoenaIcon({ topic: 'economics' }),
    accessors: [
      'economics.gdpPerCapita',
      'economics.gdpTotal',
      'infrastructure.internetAccess',
      'infrastructure.mobileSubscriptions',
    ] as GroupChallengeAccessorId[],
    kinds: [] as ManhuntClue['kind'][],
  },
  {
    id: 'land',
    label: 'Land',
    icon: subpoenaIcon({ topic: 'geography' }),
    accessors: [
      'geography.area.total',
      'geography.area.land',
      'geography.area.arable',
      'geography.area.forested',
    ] as GroupChallengeAccessorId[],
    kinds: [] as ManhuntClue['kind'][],
  },
  {
    id: 'language',
    label: 'Languages',
    icon: subpoenaIcon({ topic: 'department.communications' }),
    accessors: [] as GroupChallengeAccessorId[],
    kinds: ['language'] as ManhuntClue['kind'][],
  },
  {
    id: 'alliances',
    label: 'Alliances',
    icon: subpoenaIcon({ topic: 'relations.alliance' }),
    accessors: [] as GroupChallengeAccessorId[],
    kinds: ['membership'] as ManhuntClue['kind'][],
  },
] as const

export type ManhuntSubpoenaTopicId = (typeof MANHUNT_SUBPOENA_TOPICS)[number]['id']

export const isManhuntSubpoenaTopic = (value: unknown): value is ManhuntSubpoenaTopicId =>
  MANHUNT_SUBPOENA_TOPICS.some(topic => topic.id === value)

/**
 * A detective forces the next cut onto THEIR topic: the answer is still a
 * true, engine-graded clue about the despot's current country, scoped to the
 * requested territory of fact. An empty scope (no data, topic exhausted)
 * falls back to the engine's own best cut — the token still buys a cut,
 * never a dud.
 */
export const answerManhuntSubpoena = (
  game: ChallengeSettings,
  despotAt: ISOCountryCode,
  candidates: ISOCountryCode[],
  hop: number,
  used: ManhuntClue[],
  topicId: ManhuntSubpoenaTopicId
): ManhuntCluePick => {
  const pool = clueCandidates(game, despotAt, candidates, hop, used)
  const topic = MANHUNT_SUBPOENA_TOPICS.find(entry => entry.id === topicId)
  // The sharpness floor: engine-dealt clues aim for the bisection target, but
  // a scoped subpoena can hold only kill-shots — "official languages include
  // Lithuanian" is a singleton. No token may cut below ~10% of the field
  // (min 3); a topic with only sharper truths falls back to the engine's
  // best honest cut, so the token still buys a cut, never a giveaway.
  const floor = Math.min(candidates.length, Math.max(3, Math.ceil(candidates.length * 0.1)))
  const scoped = topic
    ? pool.filter(
        candidate =>
          candidate.matches.length >= floor &&
          ((candidate.accessorId &&
            (topic.accessors as readonly GroupChallengeAccessorId[]).includes(
              candidate.accessorId
            )) ||
            (topic.kinds as readonly ManhuntClue['kind'][]).includes(candidate.clue.kind))
      )
    : []
  const best = bestClueCandidate(scoped.length ? scoped : pool, candidates)
  return guardedPick(best, despotAt, candidates, hop)
}

// --- Taunts -------------------------------------------------------------------

/** The only words that travel — clients render by index, the server
 *  whitelists against these lists (the cheer-relay discipline). */
export const MANHUNT_TAUNTS = {
  despot: [
    "You'll never take me alive",
    'Lovely weather in my hideout',
    'Was that marker supposed to scare me?',
    'The treasury sends its regards',
  ],
  detective: [
    'The net is closing',
    'We can smell the cologne from here',
    'Nowhere left to run',
    'Your face is on every lamppost',
  ],
} as const

// --- Scoring ----------------------------------------------------------------

/** The despot's share grows with every hop survived; the chase pot splits by
 *  how close each detective's final marker landed. */
const CHASE_SHARE = 0.75
const CAPTURER_BONUS = 0.25
const CONSOLATION_SHARE = 0.25

export const scoreManhunt = (
  challenge: ManhuntChallenge,
  finalMarkers: { [playerId: string]: ISOCountryCode }
): { [playerId: string]: { scored: number; maximum: number } } => {
  const { state, maximumPoints, turnCount, despotId } = challenge
  const outcome = state.outcome
  const scores: { [playerId: string]: { scored: number; maximum: number } } = {}
  if (!outcome) return scores

  const captured = outcome.kind === 'captured'
  const despotAt = outcome.country
  const distances = distancesFrom(despotAt, pursuitNeighboursOf)

  const weights = state.detectives.map(playerId => {
    const marker = finalMarkers[playerId]
    const distance = marker !== undefined ? distances.get(marker) : undefined
    return { playerId, weight: distance === undefined ? 0 : 1 / (1 + distance) }
  })
  const totalWeight = weights.reduce((sum, { weight }) => sum + weight, 0)

  const pot = captured ? CHASE_SHARE * maximumPoints : CONSOLATION_SHARE * maximumPoints
  const capturers = captured ? new Set(outcome.capturerIds) : new Set<string>()
  const bonus = capturers.size ? (CAPTURER_BONUS * maximumPoints) / capturers.size : 0

  for (const { playerId, weight } of weights) {
    const share = totalWeight > 0 ? (pot * weight) / totalWeight : 0
    const scored = Math.round(share + (capturers.has(playerId) ? bonus : 0))
    scores[playerId] = { scored: clampScore(scored, maximumPoints), maximum: maximumPoints }
  }

  const survivedHops = captured ? Math.max(0, outcome.hop - 1) : turnCount
  scores[despotId] = {
    scored: Math.round(maximumPoints * (survivedHops / turnCount)),
    maximum: maximumPoints,
  }

  return scores
}

// --- Tuning -----------------------------------------------------------------

export const MANHUNT_TUNING: {
  [difficulty in GameDifficulty]: {
    turnCount: number
    moveSeconds: number
    huntSeconds: number
    seaPassages: number
    /** Subpoena tokens per detective for the whole round. */
    subpoenas: number
  }
} = {
  easy: { turnCount: 6, moveSeconds: 15, huntSeconds: 30, seaPassages: 1, subpoenas: 2 },
  normal: { turnCount: 7, moveSeconds: 15, huntSeconds: 25, seaPassages: 2, subpoenas: 2 },
  hard: { turnCount: 8, moveSeconds: 15, huntSeconds: 20, seaPassages: 2, subpoenas: 1 },
}
