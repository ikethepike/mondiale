import { SEA_NEIGHBOURS } from '~~/data/sea-lanes.gen'
import type {
  ManhuntChallenge,
  ManhuntClue,
  ManhuntMoveKind,
  ManhuntReading,
  ManhuntState,
} from '~~/types/challenges/group-modes.type'
import type { GroupChallengeAccessorId } from '~~/types/challenges/group-challenge.type'
import { isAccessorEnabled } from '~~/types/challenges/challenge-groups.type'
import type { GameDifficulty, GameRules } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'
import { OrganizationVector } from '~~/types/organization.type'
import { sample, shuffleArray } from './arrays'
import { clamp01 } from './number'
import { clampScore } from './scoring'
import { connectionsOf } from './chain'
import { getCountry, mentionsCountry } from './country'
import { distancesFrom } from './traversal'
import { getValueByAccessorID } from './values'
import { isCountryPlayable, playableCountries } from './game-rules'
import { REGION_LABELS } from './variant'

/**
 * The Despot: a hidden-movement chase. The trail is the game's only true
 * secret — it lives under this key, in a redis blob that never enters a
 * broadcast, beside each detective's private sonar readings. Everything on the
 * challenge state is safe for the whole table to read.
 */
export const manhuntKey = (gameId: string, roundIndex: number) => `${gameId}:manhunt:${roundIndex}`

/** The despot's plan for the live beat: where they go next, and the two
 *  true leaks about that destination they may choose between. */
export interface ManhuntPlan {
  turn: number
  isoCode: ISOCountryCode
  kind: ManhuntMoveKind
  options: ManhuntClue[]
  leak?: number
  /** Set when a subpoena bound these options — it is spent with them. */
  subpoenaBy?: string
}

export interface ManhuntSecret {
  /** Countries the despot has stood in, one per beat; last is the current
   *  position. A favour spent lying low repeats the country. */
  trail: ISOCountryCode[]
  plan?: ManhuntPlan
  /** Vaults emptied — banked at the end of the sheltered beat. */
  looted: ISOCountryCode[]
  /** Each detective's sonar readings — only ever sent to their own socket. */
  readings: { [playerId: string]: ManhuntReading[] }
}

// --- Graphs -----------------------------------------------------------------

export const seaNeighboursOf = (isoCode: ISOCountryCode): ISOCountryCode[] =>
  SEA_NEIGHBOURS[isoCode] ?? []

/** Ground ∪ sea — the widest graph; proximity scoring runs on it so an
 *  island hideout never sits at an infinite distance. */
export const pursuitNeighboursOf = (isoCode: ISOCountryCode): ISOCountryCode[] => [
  ...new Set([...connectionsOf(isoCode), ...seaNeighboursOf(isoCode)]),
]

const groundMovesOf = (isoCode: ISOCountryCode, rules: GameRules): ISOCountryCode[] => [
  ...new Set(
    connectionsOf(isoCode).filter(
      connected => connected !== isoCode && isCountryPlayable(rules, connected)
    )
  ),
]

const seaMovesOf = (isoCode: ISOCountryCode, rules: GameRules): ISOCountryCode[] =>
  seaNeighboursOf(isoCode).filter(
    destination => destination !== isoCode && isCountryPlayable(rules, destination)
  )

const rulesKey = (rules: GameRules) =>
  `${[...rules.regions].sort().join(',')}|${rules.difficulty}|${rules.includeMicroNations ?? ''}`

/** Per-origin graph caches, dropped wholesale past this many entries — a
 *  long-lived server meets many board combinations. */
const GRAPH_CACHE_LIMIT = 4000

const remember = <T>(cache: Map<string, T>, key: string, value: T): T => {
  if (cache.size >= GRAPH_CACHE_LIMIT) cache.clear()
  cache.set(key, value)
  return value
}

const distanceCache = new Map<string, Map<ISOCountryCode, number>>()

/** Borders between two countries over land and straits, on this board —
 *  undefined when no land route exists. Memoised: the candidate engine asks
 *  for whole rings at a time. */
export const bordersBetween = (
  from: ISOCountryCode,
  to: ISOCountryCode,
  rules: GameRules
): number | undefined => {
  const key = `${rulesKey(rules)}|${from}`
  const distances =
    distanceCache.get(key) ??
    remember(
      distanceCache,
      key,
      distancesFrom(from, isoCode => groundMovesOf(isoCode, rules))
    )
  return distances.get(to)
}

/** How a hop a→b was made, read off the trail alone. */
export const manhuntHopShape = (
  from: ISOCountryCode,
  to: ISOCountryCode
): 'ground' | 'sea' | 'stay' =>
  from === to ? 'stay' : connectionsOf(from).includes(to) ? 'ground' : 'sea'

// --- Movement ---------------------------------------------------------------

/** How far the despot may run over land in one beat — the sonar's range is
 *  balanced against it (the capture-rate pins in manhunt.test.ts). */
export const MANHUNT_STRIDE = 2

const strideCache = new Map<string, ISOCountryCode[]>()

/** Every country within the stride, never the start itself — doubling back
 *  is not a free beat lying low. */
const strideOf = (isoCode: ISOCountryCode, rules: GameRules): ISOCountryCode[] => {
  const key = `${rulesKey(rules)}|${isoCode}`
  const cached = strideCache.get(key)
  if (cached) return cached
  const reach = new Set<ISOCountryCode>()
  let frontier = [isoCode]
  for (let step = 0; step < MANHUNT_STRIDE; step++) {
    const next: ISOCountryCode[] = []
    for (const from of frontier) {
      for (const to of groundMovesOf(from, rules)) {
        if (to === isoCode || reach.has(to)) continue
        reach.add(to)
        next.push(to)
      }
    }
    frontier = next
  }
  return remember(strideCache, key, [...reach])
}

export interface ManhuntMoves {
  /** Up to MANHUNT_STRIDE borders over land and straits — free. */
  ground: ISOCountryCode[]
  /** Sea passages — each spends a smuggler's favour. */
  sea: ISOCountryCode[]
  /** Lying low also spends a favour. */
  stay: boolean
}

/**
 * The despot's legal moves. A favour (a sea passage or a beat lying low) is
 * announced only as "a favour was called in", never which. A move that would
 * leave the despot somewhere ground can't leave needs a further favour in
 * reserve, so the forced move always stays satisfiable.
 */
export const legalManhuntMoves = (
  from: ISOCountryCode,
  favoursLeft: number,
  rules: GameRules
): ManhuntMoves => {
  const ground = strideOf(from, rules)
  if (favoursLeft < 1) return { ground, sea: [], stay: false }
  const groundSet = new Set(ground)
  const sea = seaMovesOf(from, rules).filter(
    destination =>
      !groundSet.has(destination) &&
      (groundMovesOf(destination, rules).length > 0 || favoursLeft >= 2)
  )
  return { ground, sea, stay: ground.length > 0 || favoursLeft >= 2 }
}

/** Resolve a picked destination to the move it costs: ground first, so a
 *  destination reachable both ways never wastes a favour. */
export const manhuntMoveKind = (
  from: ISOCountryCode,
  to: ISOCountryCode,
  favoursLeft: number,
  rules: GameRules
): ManhuntMoveKind | undefined => {
  const moves = legalManhuntMoves(from, favoursLeft, rules)
  if (moves.ground.includes(to)) return 'ground'
  if (moves.sea.includes(to) || (to === from && moves.stay)) return 'favour'
  return undefined
}

/** The timeout hop: random and free — ground when possible. Falling back to
 *  staying put can only happen on drifted data; never throws. */
export const randomManhuntMove = (
  from: ISOCountryCode,
  favoursLeft: number,
  rules: GameRules
): { isoCode: ISOCountryCode; kind: ManhuntMoveKind } => {
  const { ground, sea, stay } = legalManhuntMoves(from, favoursLeft, rules)
  if (ground.length) return { isoCode: sample(ground)!, kind: 'ground' }
  if (sea.length) return { isoCode: sample(sea)!, kind: 'favour' }
  return { isoCode: from, kind: stay ? 'favour' : 'ground' }
}

// --- Vaults and the seed ----------------------------------------------------

/** A hunt worth running starts somewhere with real outs. */
const MINIMUM_SEED_MOVES = 3

/** Below this many viable seeds the board is too small to hide on — the
 *  dealer declines and another mode deals. */
export const MINIMUM_MANHUNT_POOL = 25

/** Small boards pack vaults close enough to chain shelters, so they get two. */
const vaultCount = (rules: GameRules): number =>
  playableCountries(rules).filter(iso => hasOuts(iso, rules)).length >= 60 ? 3 : 2
/** Vaults sit at least this far apart, so no one stakeout guards two exits. */
const VAULT_SPACING = 3
/** The despot starts within this many borders of a vault. */
const VAULT_REACH = 4

const hasOuts = (isoCode: ISOCountryCode, rules: GameRules) =>
  groundMovesOf(isoCode, rules).length >= MINIMUM_SEED_MOVES

/** The round's treasury vaults: public from the deal, spread apart. */
export const pickManhuntVaults = (
  rules: GameRules,
  random: () => number = Math.random
): ISOCountryCode[] => {
  const count = vaultCount(rules)
  const vaults: ISOCountryCode[] = []
  for (const isoCode of shuffleArray(
    playableCountries(rules).filter(iso => hasOuts(iso, rules)),
    random
  )) {
    if (vaults.length === count) break
    const spaced = vaults.every(
      vault => (bordersBetween(isoCode, vault, rules) ?? Infinity) >= VAULT_SPACING
    )
    if (spaced) vaults.push(isoCode)
  }
  return vaults
}

/**
 * The hunt's opening knowledge: every country the seed could be. The seed
 * pool is exactly this predicate, so the candidate engine starts sound.
 */
export const initialManhuntCandidates = (
  rules: GameRules,
  vaults: ISOCountryCode[]
): ISOCountryCode[] =>
  playableCountries(rules).filter(isoCode => {
    if (!hasOuts(isoCode, rules)) return false
    const distance = Math.min(
      ...vaults.map(vault => bordersBetween(vault, isoCode, rules) ?? Infinity)
    )
    return distance >= 1 && distance <= VAULT_REACH
  })

export const pickManhuntSeed = (
  rules: GameRules,
  vaults: ISOCountryCode[]
): ISOCountryCode | undefined => sample(initialManhuntCandidates(rules, vaults))

// --- Sonar ------------------------------------------------------------------

/** Readings at or beyond this many borders collapse into "this many or more". */
export const SONAR_CAP = 6

export const sonarDistance = (
  from: ISOCountryCode,
  to: ISOCountryCode,
  rules: GameRules
): number | null => {
  const borders = bordersBetween(from, to, rules)
  return borders === undefined ? null : Math.min(borders, SONAR_CAP)
}

/** How a reading reads: "here", "1 border", "4 borders", "6+ borders" or
 *  "overseas"; `short` is the chip's cut ("0", "4", "6+", "sea"). */
export const formatReading = (distance: number | null, short = false): string => {
  if (distance === null) return short ? 'sea' : 'overseas'
  const count = distance >= SONAR_CAP ? `${SONAR_CAP}+` : String(distance)
  if (short) return count
  if (distance === 0) return 'right here'
  return `${count} ${distance === 1 ? 'border' : 'borders'}`
}

/** A reading's warmth, on the shared ramp (lib/warmth): 0 on top of the
 *  despot, 1 at the sonar's cap or overseas. */
export const readingWarmth = (distance: number | null): number =>
  distance === null ? 1 : Math.min(distance, SONAR_CAP) / SONAR_CAP

/** The sonar's ripple out from a ping: ring k holds the countries k borders
 *  away, out to the reading's own ring — where the despot stood. */
export const sonarRipple = (reading: ManhuntReading, rules: GameRules): ISOCountryCode[][] => {
  if (reading.distance === null) return []
  const rings: ISOCountryCode[][] = Array.from({ length: reading.distance + 1 }, () => [])
  for (const isoCode of playableCountries(rules)) {
    const distance = sonarDistance(reading.isoCode, isoCode, rules)
    if (distance !== null && distance <= reading.distance) rings[distance]!.push(isoCode)
  }
  return rings
}

export const readingAdmits = (
  reading: ManhuntReading,
  isoCode: ISOCountryCode,
  rules: GameRules
): boolean => sonarDistance(reading.isoCode, isoCode, rules) === reading.distance

// --- The candidate engine ---------------------------------------------------

/** The announced move's image: where a despot anywhere in `set` could now be. */
export const stepManhuntCandidates = (
  set: ISOCountryCode[],
  kind: ManhuntMoveKind,
  rules: GameRules
): ISOCountryCode[] => {
  const stepped = new Set<ISOCountryCode>()
  for (const isoCode of set) {
    if (kind === 'favour') {
      stepped.add(isoCode)
      for (const destination of seaMovesOf(isoCode, rules)) stepped.add(destination)
    } else {
      for (const destination of strideOf(isoCode, rules)) stepped.add(destination)
    }
  }
  return [...stepped]
}

/** A dragnet's misses are confirmed "not here"s — except on a vault, where
 *  the despot may have sat sheltered, so a miss there proves nothing. */
export const pruneManhuntCandidates = (
  set: ISOCountryCode[],
  misses: ISOCountryCode[],
  vaults: ISOCountryCode[]
): ISOCountryCode[] => {
  const missed = new Set(misses.filter(isoCode => !vaults.includes(isoCode)))
  return set.filter(isoCode => !missed.has(isoCode))
}

/** A vault still holding its treasury hides the despot for the beat they
 *  empty it: no stakeout lands there until it has been looted. */
export const isSheltered = (
  isoCode: ISOCountryCode,
  vaults: ISOCountryCode[],
  looted: ISOCountryCode[]
): boolean => vaults.includes(isoCode) && !looted.includes(isoCode)

const leakCut = (state: ManhuntState, hop: number, set: ISOCountryCode[]): ISOCountryCode[] => {
  const leaks = state.clues.filter(clue => clue.hop === hop)
  return set.filter(isoCode => leaks.every(clue => clueAdmits(clue, isoCode)))
}

/** The live beat's leak applied to a replay that stopped short of it — the
 *  map once the analysts land, without replaying the whole history again. */
export const withLiveLeak = (state: ManhuntState, set: ISOCountryCode[]): ISOCountryCode[] =>
  leakCut(state, state.hop, set)

/** How many of `set` each leak would leave once the despot moves `kind` —
 *  what the despot weighs, and what the bot despot maximises. */
export const leakWidths = (
  set: ISOCountryCode[],
  kind: ManhuntMoveKind,
  options: ManhuntClue[],
  rules: GameRules
): number[] => {
  const stepped = stepManhuntCandidates(set, kind, rules)
  return options.map(clue => stepped.filter(isoCode => clueAdmits(clue, isoCode)).length)
}

/**
 * THE candidate engine: where the despot can be at the live beat, replayed
 * from the public record (leaks, stakeout misses, announced moves) plus any
 * private readings the asker holds. The server prices leaks off the public
 * replay, each detective's map paints their own, and bots hunt with theirs —
 * one replay, so no two of them can disagree. `latestLeak: false` replays up
 * to the live beat without its leak (the map before the analysts land).
 */
export const huntCandidates = (
  challenge: Pick<ManhuntChallenge, 'vaults' | 'state'>,
  rules: GameRules,
  readings: ManhuntReading[] = [],
  { latestLeak = true }: { latestLeak?: boolean } = {}
): ISOCountryCode[] => {
  const { state, vaults } = challenge
  let set = initialManhuntCandidates(rules, vaults)
  for (let hop = 1; hop <= state.hop; hop++) {
    if (hop < state.hop || latestLeak) set = leakCut(state, hop, set)
    if (hop === state.hop) break
    const dragnet = state.dragnets.find(entry => entry.hop === hop)
    set = pruneManhuntCandidates(set, Object.values(dragnet?.claims ?? {}), vaults)
    for (const reading of readings) {
      if (reading.hop === hop) set = set.filter(isoCode => readingAdmits(reading, isoCode, rules))
    }
    const move = state.moves.find(entry => entry.hop === hop + 1)
    set = stepManhuntCandidates(set, move?.kind ?? 'ground', rules)
  }
  return set
}

// --- Clues ------------------------------------------------------------------

/**
 * Threshold clues draw only from near-complete accessors — a cut over sparse
 * data quietly leaks "well-documented country". Coverage is asserted in
 * lib/manhunt.test.ts. Countries with no value are KEPT: soundness beats
 * sharpness.
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
  'people.childrenPerWoman',
]

/** THE clue predicate: whether a country is consistent with a clue. Clue
 *  dealing, candidate pruning and the bots all read it, so a clue can never
 *  say one thing and cut another. */
export const clueAdmits = (clue: ManhuntClue, isoCode: ISOCountryCode): boolean => {
  const country = getCountry(isoCode)
  if (!country) return false
  switch (clue.kind) {
    case 'region':
      return clue.subject === undefined || country.region === clue.subject
    case 'language':
      // The clue says OFFICIAL, so not lib/language-rounds' speaker union —
      // that would admit countries the printed line rules out.
      return !!clue.subject && (country.officialLanguages ?? []).includes(clue.subject)
    case 'membership':
      return (country.membership ?? []).some(member => member.id === clue.subject)
    case 'flag-colors':
      return (country.identity?.simplifiedColors ?? []).some(color => color === clue.subject)
    case 'threshold': {
      if (!clue.accessorId || clue.threshold === undefined) return true
      const amount = getValueByAccessorID(isoCode, clue.accessorId)?.amount
      if (amount === undefined) return true
      return amount >= clue.threshold === !!clue.above
    }
  }
}

export interface ManhuntCluePick {
  clue: ManhuntClue
  /** Candidates satisfying the clue — always includes the despot's country. */
  matches: ISOCountryCode[]
}

/** Three significant digits, so the line reads like intel. The predicate
 *  uses the SAME rounded value, so text and pruning can never disagree. */
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

/** A local mirror of accessorTopicLabel's output: lib/challenges imports this
 *  module for the dealer, so importing it back would cycle. */
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
  'people.childrenPerWoman': 'children per woman',
}

const accessorTopic = (accessorId: GroupChallengeAccessorId): string =>
  ACCESSOR_TOPICS[accessorId] ?? accessorId

type ChallengeSettings = Parameters<typeof isAccessorEnabled>[0]

/** Every true clue about `despotAt` not yet dealt this round. */
const truthsAbout = (
  game: ChallengeSettings,
  despotAt: ISOCountryCode,
  candidates: ISOCountryCode[],
  hop: number,
  used: ManhuntClue[]
): ManhuntClue[] => {
  const country = getCountry(despotAt)
  const usedTexts = new Set(used.map(clue => clue.text))
  const out: ManhuntClue[] = [
    {
      hop,
      kind: 'region',
      topic: 'geography',
      subject: country.region,
      text: `The despot is hiding in ${REGION_LABELS[country.region]}`,
    },
  ]

  // An eponymous language (Hungarian in Hungary) is a name leak, not a clue.
  for (const language of country.officialLanguages ?? []) {
    if (mentionsCountry(language, despotAt)) continue
    out.push({
      hop,
      kind: 'language',
      topic: 'department.communications',
      subject: language,
      text: `Official languages there include ${language}`,
    })
  }

  for (const organization of country.membership ?? []) {
    out.push({
      hop,
      kind: 'membership',
      topic: 'relations.alliance',
      subject: organization.id,
      text: `The country is a member of the ${OrganizationVector[organization.id]}`,
    })
  }

  for (const color of country.identity?.simplifiedColors ?? []) {
    out.push({
      hop,
      kind: 'flag-colors',
      topic: 'relations.embassy',
      subject: color,
      text: `The flag flying over the hideout carries ${color}`,
    })
  }

  for (const accessorId of MANHUNT_THRESHOLD_ACCESSORS) {
    if (!isAccessorEnabled(game, accessorId)) continue
    const label = accessorTopic(accessorId)
    if (used.some(clue => clue.kind === 'threshold' && clue.accessorId === accessorId)) continue
    const despotValue = getValueByAccessorID(despotAt, accessorId)
    if (!despotValue || despotValue.unit === 'year') continue

    const values = candidates
      .map(isoCode => getValueByAccessorID(isoCode, accessorId)?.amount)
      .filter((amount): amount is number => amount !== undefined)
      .sort((a, b) => a - b)
    if (values.length < 4) continue

    const threshold = roundThreshold(values[Math.floor(values.length / 2)])
    const above = despotValue.amount >= threshold
    out.push({
      hop,
      kind: 'threshold',
      accessorId,
      threshold,
      above,
      text: `Its ${label} is ${above ? 'at least' : 'below'} ${formatThreshold(
        threshold,
        despotValue.unit
      )}`,
    })
  }

  return out.filter(clue => !usedTexts.has(clue.text))
}

/**
 * Each forced hop re-inflates the candidate set by its neighbourhood, so a
 * leak aims at roughly a third of the live set — the noose tightens without
 * a giveaway. It never cuts below the floor: the dragnet stakes out a fixed
 * number of countries a beat, and the floor is what keeps any one beat a
 * long shot rather than a coin flip.
 */
const CLUE_TARGET_FRACTION = 0.35

/** How many countries the board can hide the despot among per stakeout. */
const POOL_PER_CLAIM = 12

/** Stakeouts per beat: one per detective, capped by what the board can hide
 *  — a small board seats the fast claimers and the rest sit the beat out. */
export const manhuntClaimsPerBeat = (detectives: number, poolSize: number): number =>
  Math.max(1, Math.min(detectives, Math.max(2, Math.floor(poolSize / POOL_PER_CLAIM))))

export const manhuntFloor = (claimsPerBeat: number, difficulty: GameDifficulty): number =>
  claimsPerBeat * MANHUNT_TUNING[difficulty].floorPerClaim

const isSoundCut = (pick: ManhuntCluePick, setSize: number, floor: number): boolean =>
  pick.matches.length < setSize && pick.matches.length >= Math.min(floor, setSize)

const rankLeaks = (pool: ManhuntCluePick[], setSize: number, floor: number): ManhuntCluePick[] => {
  const target = Math.max(floor, setSize * CLUE_TARGET_FRACTION)
  const informative = pool.filter(pick => pick.matches.length < setSize)
  const sound = informative.filter(pick => isSoundCut(pick, setSize, floor))
  if (sound.length) {
    return shuffleArray(sound).sort(
      (a, b) => Math.abs(a.matches.length - target) - Math.abs(b.matches.length - target)
    )
  }
  if (informative.length) {
    return shuffleArray(informative).sort((a, b) => b.matches.length - a.matches.length)
  }
  return shuffleArray(pool)
}

/** Two choices read as a choice only when they say different kinds of thing. */
const pickPair = (ranked: ManhuntCluePick[]): ManhuntCluePick[] => {
  const [first, ...rest] = ranked
  if (!first) return []
  const contrast = rest
    .slice(0, 6)
    .find(
      pick =>
        pick.clue.kind !== first.clue.kind ||
        (pick.clue.kind === 'threshold' && pick.clue.accessorId !== first.clue.accessorId)
    )
  const second = contrast ?? rest[0]
  return second ? [first, second] : [first]
}

/**
 * The leaks the despot may choose between for `despotAt`: the engine's two
 * best honest cuts, in contrasting registers. A subpoena scopes them to its
 * topic and leaves exactly one — the despot gets no say that turn.
 */
export const manhuntLeakOptions = (
  game: ChallengeSettings & { difficulty: GameDifficulty },
  despotAt: ISOCountryCode,
  candidates: ISOCountryCode[],
  hop: number,
  used: ManhuntClue[],
  claimsPerBeat: number,
  topicId?: ManhuntSubpoenaTopicId
): ManhuntCluePick[] => {
  const floor = manhuntFloor(claimsPerBeat, game.difficulty)
  const pool = truthsAbout(game, despotAt, candidates, hop, used).map(clue => ({
    clue,
    matches: candidates.filter(isoCode => clueAdmits(clue, isoCode)),
  }))
  const topic = MANHUNT_SUBPOENA_TOPICS.find(entry => entry.id === topicId)
  const picks = topic
    ? (() => {
        // A topic holding only sharper truths falls back to the engine's own
        // sound cut — a subpoena buys a topic, never a giveaway.
        const scoped = pool.filter(
          pick => inTopic(topic, pick.clue) && isSoundCut(pick, candidates.length, floor)
        )
        return rankLeaks(scoped.length ? scoped : pool, candidates.length, floor).slice(0, 1)
      })()
    : pickPair(rankLeaks(pool, candidates.length, floor))
  for (const pick of picks) if (!pick.matches.includes(despotAt)) pick.matches.push(despotAt)
  return picks.length
    ? picks
    : [{ clue: { hop, kind: 'region', text: 'The trail has gone cold' }, matches: [...candidates] }]
}

// --- Subpoenas ---------------------------------------------------------------

interface SubpoenaTopicIcon {
  accessor?: GroupChallengeAccessorId
  topic?: string
}
const subpoenaIcon = (icon: SubpoenaTopicIcon): SubpoenaTopicIcon => icon

/** What a detective may subpoena: each scopes the next leak to one register,
 *  curated so every topic has near-complete data behind it. */
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
    kinds: ['region'] as ManhuntClue['kind'][],
  },
  {
    id: 'culture',
    label: 'Language & flag',
    icon: subpoenaIcon({ topic: 'department.communications' }),
    accessors: [] as GroupChallengeAccessorId[],
    kinds: ['language', 'flag-colors'] as ManhuntClue['kind'][],
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

/** Whether a detective may serve a subpoena now: a token in hand, none
 *  already pending, and a leak still left to bind — none follows the last
 *  beat, nor the second-to-last once its leak is locked. */
export const canServeSubpoena = (challenge: ManhuntChallenge, playerId: string): boolean => {
  const { state, turnCount } = challenge
  if (state.briefing || state.finished || state.subpoena) return false
  if (!state.detectives.includes(playerId) || (state.subpoenasLeft[playerId] ?? 0) < 1) return false
  if (state.hop >= turnCount) return false
  return !(state.hop === turnCount - 1 && state.despotReady)
}

export const subpoenaTopic = (topicId: string | undefined) =>
  MANHUNT_SUBPOENA_TOPICS.find(topic => topic.id === topicId)

const inTopic = (topic: (typeof MANHUNT_SUBPOENA_TOPICS)[number], clue: ManhuntClue): boolean =>
  (!!clue.accessorId &&
    (topic.accessors as readonly GroupChallengeAccessorId[]).includes(clue.accessorId)) ||
  (topic.kinds as readonly ManhuntClue['kind'][]).includes(clue.kind)

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

// --- Beats ------------------------------------------------------------------

/** Every detective has acted and the despot has locked their move — nothing
 *  left to wait for. On the last hop the despot has nothing to plan. */
export const manhuntBeatSettled = (challenge: ManhuntChallenge): boolean => {
  const { state } = challenge
  const despotDone = state.despotReady || state.hop >= challenge.turnCount
  return despotDone && state.detectives.every(playerId => hasActed(state, playerId))
}

/** A round saved before pings and vaults existed (live across a deploy):
 *  nothing here can play it, so the engine winds it down unscored. */
export const isPreSonarRound = (challenge: ManhuntChallenge): boolean =>
  !Array.isArray((challenge as Partial<ManhuntChallenge>).vaults) ||
  !(challenge.state as Partial<ManhuntState>).pings

/** Every detective does ONE thing a beat: a ping or a stakeout. */
export const hasActed = (state: ManhuntState, playerId: string): boolean =>
  state.claims[playerId] !== undefined || state.pings[playerId] !== undefined

/** Who holds a country this beat, if anyone — claims are one per country. */
export const claimantOf = (state: ManhuntState, isoCode: ISOCountryCode): string | undefined =>
  Object.entries(state.claims).find(([, claimed]) => claimed === isoCode)?.[0]

// --- Scoring ----------------------------------------------------------------

/** The despot banks a share per beat survived and per vault carried away;
 *  the chase pot splits by how close each detective's final marker landed. */
const SURVIVAL_SHARE = 0.7
const LOOT_SHARE = 0.12
const CHASE_SHARE = 0.75
const CAPTURER_BONUS = 0.25
const CONSOLATION_SHARE = 0.25

export const despotShare = (survived: number, turnCount: number, looted: number): number =>
  clamp01(SURVIVAL_SHARE * (survived / turnCount) + LOOT_SHARE * looted)

export const scoreManhunt = (
  challenge: ManhuntChallenge
): { [playerId: string]: { scored: number; maximum: number } } => {
  const { state, maximumPoints, turnCount, despotId } = challenge
  const outcome = state.outcome
  const scores: { [playerId: string]: { scored: number; maximum: number } } = {}
  if (!outcome) return scores

  const captured = outcome.kind === 'captured'
  const last = state.dragnets[state.dragnets.length - 1]
  const finalClaims = { ...last?.pings, ...last?.claims }
  const distances = distancesFrom(outcome.country, pursuitNeighboursOf)

  const weights = state.detectives.map(playerId => {
    const claim = finalClaims[playerId]
    const distance = claim !== undefined ? distances.get(claim) : undefined
    return { playerId, weight: distance === undefined ? 0 : 1 / (1 + distance) }
  })
  const totalWeight = weights.reduce((sum, { weight }) => sum + weight, 0)
  const pot = (captured ? CHASE_SHARE : CONSOLATION_SHARE) * maximumPoints
  const capturerId = captured ? outcome.capturerId : undefined

  for (const { playerId, weight } of weights) {
    const share = totalWeight > 0 ? (pot * weight) / totalWeight : 0
    const bonus = playerId === capturerId ? CAPTURER_BONUS * maximumPoints : 0
    scores[playerId] = {
      scored: clampScore(Math.round(share + bonus), maximumPoints),
      maximum: maximumPoints,
    }
  }

  const survived = captured ? Math.max(0, outcome.hop - 1) : turnCount
  scores[despotId] = {
    scored: Math.round(maximumPoints * despotShare(survived, turnCount, outcome.looted.length)),
    maximum: maximumPoints,
  }
  return scores
}

// --- Tuning -----------------------------------------------------------------

export const MANHUNT_TUNING: {
  [difficulty in GameDifficulty]: {
    turnCount: number
    beatSeconds: number
    favours: number
    /** Subpoena tokens per detective for the whole round. */
    subpoenas: number
    /** Fraction of a beat before the leak's cut paints the map; detectives
     *  who can apply it themselves claim first. */
    analysisDelay: number
    floorPerClaim: number
  }
} = {
  easy: {
    turnCount: 6,
    beatSeconds: 35,
    favours: 2,
    subpoenas: 2,
    analysisDelay: 0,
    floorPerClaim: 10,
  },
  normal: {
    turnCount: 7,
    beatSeconds: 30,
    favours: 2,
    subpoenas: 1,
    analysisDelay: 0.4,
    floorPerClaim: 10,
  },
  hard: {
    turnCount: 8,
    beatSeconds: 25,
    favours: 2,
    subpoenas: 1,
    analysisDelay: 1,
    floorPerClaim: 10,
  },
}
