import { COUNTRIES } from '~~/data/countries.gen'
import type { AtlasTrap, ChainTurnState } from '~~/types/challenges/group-modes.type'
import type { GameDifficulty, GameRules } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'
import { sample, shuffleArray, weightedPick } from './arrays'
import { normalizeCountryName } from './country'
import { playableWorldCountries } from './game-rules'

/**
 * Atlas — the country name chain. Each link must start where the previous one
 * ended, and three ties count: the last letter (Nepal → Laos), the consonant
 * under a trailing vowel run (Albania → Nigeria, Germany → Norway), or any
 * longer shared ending (Japan → Panama). This module is the one home for the
 * rule: validation, credit, seeds, hints and the trap proof all read it, on
 * both sides of the wire.
 *
 * Shared endings alone do not break the A-spiral — nothing starts "Ia", which
 * is how most A-enders end. The consonant tie is what does.
 *
 * A country is judged by the name it was PLAYED under: the data's own English
 * name, or one of its `ATLAS_SPELLINGS` when the player typed that instead
 * (Myanmar opens on R, Burma on A). A round records the exceptions in
 * `state.spellings`; everything here takes that record so the next opener
 * follows what the player wrote.
 */

/** How credit is paid, never which links are legal — one rule for every
 *  difficulty. The hard gate pays a shared ending's full length. */
export interface AtlasCreditOptions {
  payOverlaps?: boolean
}

/** The names a round played that differ from the data's own. */
export type AtlasSpellings = NonNullable<ChainTurnState<unknown>['spellings']>

/**
 * Other names a country is judged under when the player types them — the
 * exonyms people actually write. No initialisms (USA would open on A) and no
 * endonyms (the letters game is played in English). Every entry must resolve
 * through the console to its own country (pinned in atlas-chain.test.ts).
 */
export const ATLAS_SPELLINGS: Partial<Record<ISOCountryCode, readonly string[]>> = {
  MM: ['Myanmar'],
  CZ: ['Czech Republic'],
  CV: ['Cape Verde'],
  SZ: ['Swaziland'],
  CI: ['Ivory Coast'],
  TL: ['East Timor'],
  VA: ['Vatican City'],
  MK: ['Macedonia'],
  FM: ['Micronesia'],
  TR: ['Türkiye'],
}

/**
 * The one key for letters, overlap and displayed fragments. Space-stripped on
 * top of `normalizeCountryName` so multi-letter overlaps are well-defined
 * across word boundaries; for single letters stripping changes nothing.
 */
const keyCache = new Map<string, string>()
const nameKey = (name: string): string => {
  const cached = keyCache.get(name)
  if (cached !== undefined) return cached
  const key = normalizeCountryName(name).replaceAll(' ', '')
  keyCache.set(name, key)
  return key
}

/** The name a country was played under — what the rail and narration print. */
export const atlasPlayedName = (isoCode: ISOCountryCode, spellings?: AtlasSpellings): string =>
  spellings?.[isoCode] ?? COUNTRIES[isoCode].name.english

export const atlasKey = (isoCode: ISOCountryCode, spellings?: AtlasSpellings): string =>
  nameKey(atlasPlayedName(isoCode, spellings))

/** Every name a country may be played under, the data's own first. */
const namesOf = (isoCode: ISOCountryCode): readonly string[] => [
  COUNTRIES[isoCode].name.english,
  ...(ATLAS_SPELLINGS[isoCode] ?? []),
]

export const atlasHeadLetter = (isoCode: ISOCountryCode, spellings?: AtlasSpellings): string =>
  atlasKey(isoCode, spellings)[0] ?? ''

export const atlasTailLetter = (isoCode: ISOCountryCode, spellings?: AtlasSpellings): string =>
  atlasKey(isoCode, spellings).at(-1) ?? ''

/** Y counts as a vowel here, so Germany offers N and Norway offers W. */
const TRAILING_VOWELS = /[aeiouy]+$/

const keyConsonant = (key: string): string | undefined => {
  const stripped = key.replace(TRAILING_VOWELS, '')
  return stripped.length && stripped.length < key.length ? stripped.at(-1) : undefined
}

/** The consonant a trailing vowel run sits on (Albania → n), or undefined
 *  when the name already ends in a consonant. */
export const atlasConsonant = (
  isoCode: ISOCountryCode,
  spellings?: AtlasSpellings
): string | undefined => keyConsonant(atlasKey(isoCode, spellings))

/** The single letters a follower may open with: the tail, then the
 *  consonant under a trailing vowel run. A longer shared ending can open on
 *  an earlier letter still — copy built on this says so. */
export const atlasOpeners = (isoCode: ISOCountryCode, spellings?: AtlasSpellings): string[] => {
  const consonant = atlasConsonant(isoCode, spellings)
  const tail = atlasTailLetter(isoCode, spellings)
  return consonant ? [tail, consonant] : [tail]
}

/** "A or N" — the openers as every surface prints them. */
export const atlasOpenersLabel = (isoCode: ISOCountryCode, spellings?: AtlasSpellings): string =>
  atlasOpeners(isoCode, spellings)
    .map(letter => letter.toUpperCase())
    .join(' or ')

/** The whole opening rule in words — "A or N, or a shared ending" — so no
 *  surface can print the letters as if they were the only way in. */
export const atlasNeedsLabel = (isoCode: ISOCountryCode, spellings?: AtlasSpellings): string =>
  `${atlasOpenersLabel(isoCode, spellings)}, or a shared ending`

const keyOverlap = (a: string, b: string): number => {
  for (let k = Math.min(a.length, b.length); k >= 1; k--) {
    if (a.endsWith(b.slice(0, k))) return k
  }
  return 0
}

/**
 * The longest k where `prev`'s k-suffix equals `next`'s k-prefix; 0 means the
 * names share no ending. Niger → Nigeria is 5.
 */
export const atlasLinkOverlap = (
  prev: ISOCountryCode,
  next: ISOCountryCode,
  spellings?: AtlasSpellings
): number => keyOverlap(atlasKey(prev, spellings), atlasKey(next, spellings))

export type AtlasTieKind = 'letter' | 'consonant' | 'overlap'

/** What joins two names: the kind of tie, the fragment both share, and its
 *  length (a consonant tie shares one letter but no ending). */
export interface AtlasTie {
  kind: AtlasTieKind
  fragment: string
  overlap: number
}

const keyTie = (prevKey: string, nextKey: string): AtlasTie | undefined => {
  const overlap = keyOverlap(prevKey, nextKey)
  if (overlap >= 1) {
    return {
      kind: overlap > 1 ? 'overlap' : 'letter',
      fragment: nextKey.slice(0, overlap),
      overlap,
    }
  }
  const consonant = keyConsonant(prevKey)
  if (consonant && nextKey[0] === consonant) {
    return { kind: 'consonant', fragment: consonant, overlap: 0 }
  }
  return undefined
}

/** The tie between two PLAYED names, or undefined when they do not chain. A
 *  longer shared ending outranks the single letter, which outranks the
 *  consonant. */
export const atlasLinkTie = (
  prev: ISOCountryCode,
  next: ISOCountryCode,
  spellings?: AtlasSpellings
): AtlasTie | undefined => keyTie(atlasKey(prev, spellings), atlasKey(next, spellings))

export const isAtlasLink = (
  prev: ISOCountryCode,
  next: ISOCountryCode,
  spellings?: AtlasSpellings
): boolean => !!atlasLinkTie(prev, next, spellings)

/**
 * The name an UNPLAYED country would join the chain under, or undefined when
 * none of its names chain from `prev`. A typed spelling wins when it chains
 * (the player's own word); otherwise the data's name, then the other
 * spellings. `{ spelling: undefined }` means the data's own name.
 */
export const atlasFollowSpelling = (
  prev: ISOCountryCode,
  next: ISOCountryCode,
  spellings?: AtlasSpellings,
  typed?: string
): { spelling: string | undefined } | undefined => {
  const prevKey = atlasKey(prev, spellings)
  const [canonical, ...others] = namesOf(next)
  const chosen = typed !== undefined ? atlasSpellingFor(next, typed) : undefined
  const order = chosen ? [chosen, canonical, ...others] : [canonical, ...others]
  const name = order.find(candidate => keyTie(prevKey, nameKey(candidate)))
  if (!name) return undefined
  return { spelling: name === canonical ? undefined : name }
}

const MAX_TYPED_LENGTH = 64

/**
 * Which of a country's other names the player typed, or undefined for the
 * data's own. A prefix counts when it can only be heading for that spelling,
 * so easy mode's dropdown (picked after a few letters) keeps the player's
 * intent. Anything that is not one of the country's names is ignored — the
 * server re-runs this, so a client cannot invent a spelling.
 */
export const atlasSpellingFor = (isoCode: ISOCountryCode, typed: string): string | undefined => {
  // Typed text comes off the wire: uncached, and no longer than a name can be.
  if (typed.length > MAX_TYPED_LENGTH) return undefined
  const key = normalizeCountryName(typed).replaceAll(' ', '')
  if (!key) return undefined
  const canonicalKey = nameKey(COUNTRIES[isoCode].name.english)
  if (canonicalKey.startsWith(key)) return undefined
  return ATLAS_SPELLINGS[isoCode]?.find(spelling => nameKey(spelling).startsWith(key))
}

/** Every country (in the whole data, any name) that can follow a played key —
 *  the link relation, computed once per head name and reused by every scan. */
const followerCache = new Map<string, ISOCountryCode[]>()
const followersOf = (prevKey: string): ISOCountryCode[] => {
  const cached = followerCache.get(prevKey)
  if (cached) return cached
  const followers = (Object.keys(COUNTRIES) as ISOCountryCode[]).filter(isoCode =>
    namesOf(isoCode).some(name => keyTie(prevKey, nameKey(name)))
  )
  followerCache.set(prevKey, followers)
  return followers
}

const poolSets = new WeakMap<readonly ISOCountryCode[], Set<ISOCountryCode>>()
const poolSet = (pool: readonly ISOCountryCode[]): Set<ISOCountryCode> => {
  let set = poolSets.get(pool)
  if (!set) poolSets.set(pool, (set = new Set(pool)))
  return set
}

const asSet = (used: ReadonlySet<ISOCountryCode> | readonly ISOCountryCode[]) =>
  used instanceof Set ? used : new Set(used)

/**
 * Legal extensions of a chain: chain off `prev` under any of their names,
 * unused, in the pool. The server's move validation and the client's courtesy
 * check both call this.
 */
export const atlasContinuations = (
  prev: ISOCountryCode,
  used: ReadonlySet<ISOCountryCode> | readonly ISOCountryCode[],
  pool: readonly ISOCountryCode[],
  spellings?: AtlasSpellings
): ISOCountryCode[] => {
  const spent = asSet(used)
  const inPool = poolSet(pool)
  return followersOf(atlasKey(prev, spellings)).filter(
    isoCode => isoCode !== prev && !spent.has(isoCode) && inPool.has(isoCode)
  )
}

/** A legal move is about to join the live chain: record the name it was
 *  typed under when that is not the data's own. The engine and the preview
 *  harness both call this before the move lands. */
export const atlasRecordSpelling = (
  state: ChainTurnState<unknown>,
  isoCode: ISOCountryCode,
  typed: string | undefined
): void => {
  const head = state.chains.at(-1)?.at(-1)
  if (!head) return
  const spelling = atlasFollowSpelling(head, isoCode, state.spellings, typed)?.spelling
  if (spelling) (state.spellings ??= {})[isoCode] = spelling
}

/** Every country walked this round — the classic game forbids repeats across
 *  every chain, not just the live one. */
export const atlasWalked = (state: ChainTurnState<unknown>): ISOCountryCode[] => state.chains.flat()

const atlasHead = (state: ChainTurnState<unknown>): ISOCountryCode | undefined =>
  state.chains.at(-1)?.at(-1)

/** The live head's legal moves — the engine grades with it, the bot brain
 *  plays from it and the view counts it, so none of them can drift. */
export const atlasLiveMoves = (
  state: ChainTurnState<unknown>,
  rules: GameRules
): ISOCountryCode[] => {
  const head = atlasHead(state)
  if (!head) return []
  return atlasContinuations(
    head,
    atlasWalked(state),
    playableWorldCountries(rules),
    state.spellings
  )
}

/** A dead head's proof: the letters it offered, and every country that would
 *  have chained — all already walked. */
export const atlasTrapProof = (
  head: ISOCountryCode,
  used: readonly ISOCountryCode[],
  pool: readonly ISOCountryCode[],
  spellings?: AtlasSpellings
): { openers: string[]; spent: ISOCountryCode[] } => {
  const walked = new Set(used)
  return {
    openers: atlasOpeners(head, spellings),
    spent: atlasContinuations(head, [], pool, spellings).filter(isoCode => walked.has(isoCode)),
  }
}

/** The dead-end hold's payload, built once for the engine and the preview
 *  harness alike. */
export const atlasBuildTrap = (
  state: ChainTurnState<unknown>,
  rules: GameRules,
  trappedId: string,
  byPlayerId: string | undefined
): AtlasTrap => {
  const head = atlasHead(state)!
  const proof = atlasTrapProof(
    head,
    atlasWalked(state),
    playableWorldCountries(rules),
    state.spellings
  )
  return { playerId: trappedId, head, byPlayerId, ...proof }
}

const linkCredit = (
  prev: ISOCountryCode,
  next: ISOCountryCode,
  options: AtlasCreditOptions,
  spellings?: AtlasSpellings
): number => (options.payOverlaps ? Math.max(1, atlasLinkOverlap(prev, next, spellings)) : 1)

/**
 * Links banked by a chain — derived from the chain itself, never stored, so
 * the dealt rule and the paid reward agree by construction. One per junction;
 * with `payOverlaps`, a shared ending pays its length. A junction that does
 * not chain pays nothing.
 */
export const atlasChainCredit = (
  chain: readonly ISOCountryCode[],
  options: AtlasCreditOptions = {},
  spellings?: AtlasSpellings
): number => {
  let credit = 0
  for (let index = 1; index < chain.length; index++) {
    if (!isAtlasLink(chain[index - 1], chain[index], spellings)) continue
    credit += linkCredit(chain[index - 1], chain[index], options, spellings)
  }
  return credit
}

/** Links a gate chain must bank. Hard's 6 expects paid overlaps to carry
 *  some of it — two sharp overlaps clear it, six plain letters grind it out. */
export const ATLAS_TARGET_LINKS: Record<GameDifficulty, number> = {
  easy: 3,
  normal: 4,
  hard: 6,
}

/** A chain from `seed` (seed first) banking `target` links under the data's
 *  own names, or undefined when the pool holds none. */
export const findAtlasChain = (
  seed: ISOCountryCode,
  target: number,
  pool: readonly ISOCountryCode[],
  options: AtlasCreditOptions = {}
): ISOCountryCode[] | undefined => {
  const chain = [seed]
  const used = new Set([seed])
  const walk = (head: ISOCountryCode, banked: number): boolean => {
    if (banked >= target) return true
    for (const next of atlasContinuations(head, used, pool)) {
      if (!isAtlasLink(head, next)) continue
      used.add(next)
      chain.push(next)
      if (walk(next, banked + linkCredit(head, next, options))) return true
      chain.pop()
      used.delete(next)
    }
    return false
  }
  return walk(seed, 0) ? chain : undefined
}

/**
 * Whether a chain banking `target` links exists from `seed`. Dealers leave
 * overlaps unpaid so paid overlap play is always pure upside on top of a
 * provably solvable deal.
 */
export const hasAtlasChain = (
  seed: ISOCountryCode,
  target: number,
  pool: readonly ISOCountryCode[],
  options: AtlasCreditOptions = {}
): boolean => !!findAtlasChain(seed, target, pool, options)

/** The gate's chain travels as steps: an ISO code, or `ISO:Spelling` when the
 *  player typed one of the country's other names. */
const STEP_SPELLING = ':'

export const atlasStep = (isoCode: ISOCountryCode, spellings?: AtlasSpellings): string => {
  const spelling = spellings?.[isoCode]
  return spelling ? `${isoCode}${STEP_SPELLING}${spelling}` : isoCode
}

/** Steps back into a chain and its spellings. A spelling that is not one of
 *  the country's names is refused outright — never silently canonicalised. */
export const parseAtlasSteps = (
  steps: readonly string[],
  isValid: (value: string) => value is ISOCountryCode
): { links: ISOCountryCode[]; spellings: AtlasSpellings } | undefined => {
  const links: ISOCountryCode[] = []
  const spellings: AtlasSpellings = {}
  for (const step of steps) {
    const [isoCode, spelling] = step.split(STEP_SPELLING, 2)
    if (!isoCode || !isValid(isoCode)) return undefined
    if (spelling !== undefined) {
      if (!ATLAS_SPELLINGS[isoCode]?.includes(spelling)) return undefined
      spellings[isoCode] = spelling
    }
    links.push(isoCode)
  }
  return { links, spellings }
}

/** A gate seed must leave a hand's worth of first moves; a table seed more —
 *  the whole opening rotation plays off the same letter. */
export const ATLAS_GATE_SEED_OPTIONS = 3
export const ATLAS_TABLE_SEED_OPTIONS = 5

/** Easy mode's console assist, both formats: the suggestion dropdown returns
 *  once this many characters are typed — you still recall how a name STARTS,
 *  the list only saves the typing. Below easy the console stays pure recall. */
export const ATLAS_EASY_SUGGEST_FROM = 3

/** Easy mode's map assist: this many legal continuations wear the action ring. */
export const ATLAS_EASY_RINGS = 6

/** The table's shot clock: it opens at `start` and gives back a second every
 *  `ATLAS_CLOCK_TIGHTEN_EVERY` links walked, down to `floor` — the wider rule
 *  runs chains long, and the squeeze is what still ends them. */
export const ATLAS_CLOCK: Record<GameDifficulty, { start: number; floor: number }> = {
  easy: { start: 24, floor: 15 },
  normal: { start: 18, floor: 11 },
  hard: { start: 14, floor: 9 },
}
export const ATLAS_CLOCK_TIGHTEN_EVERY = 4

/** The live turn's length. The engine stamps the deadline with it and the
 *  view draws the dial's total from it, off the same snapshot. */
export const atlasTurnSeconds = (challenge: {
  turnSeconds: number
  turnFloorSeconds?: number
  state: Pick<ChainTurnState<unknown>, 'named'>
}): number => {
  const links = Object.values(challenge.state.named).reduce(
    (total, named) => total + named.length,
    0
  )
  const squeezed = challenge.turnSeconds - Math.floor(links / ATLAS_CLOCK_TIGHTEN_EVERY)
  return Math.max(challenge.turnFloorSeconds ?? challenge.turnSeconds, squeezed)
}

/** The tutorial's worked examples, one per tie. Pinned legal (and playable
 *  on every difficulty, and reachable in play) in atlas-chain.test.ts, so the
 *  screen that teaches the rule can never show a link the rule refuses. */
export const ATLAS_TUTORIAL_EXAMPLES: Record<AtlasTieKind, [ISOCountryCode, ISOCountryCode]> = {
  letter: ['NP', 'LA'],
  consonant: ['AL', 'NG'],
  overlap: ['BY', 'RU'],
}

/** At or below this many unwalked names the live letter reads as nearly
 *  spent — the rail's countdown turns alert. */
export const ATLAS_SCARCE_OPTIONS = 2

/** Rip cords each seat is dealt per table round. */
export const ATLAS_RIP_CORDS = 1

/** Extra links a dead end pays the player who sealed it. */
export const ATLAS_TRAP_BOUNTY_LINKS = 2

/** Each player's bounty for the dead ends they sealed. A rip cord that
 *  cushioned the trap still pays — the seal was real. */
export const atlasTrapBounty = (state: ChainTurnState<unknown>): { [playerId: string]: number } => {
  const bounty: { [playerId: string]: number } = {}
  for (const sealed of state.breaks ?? []) {
    if (sealed.kind !== 'trap' || !sealed.byPlayerId) continue
    bounty[sealed.byPlayerId] = (bounty[sealed.byPlayerId] ?? 0) + ATLAS_TRAP_BOUNTY_LINKS
  }
  return bounty
}

/**
 * How many names in the pool can lead INTO each country. Fiji, Finland and
 * France have none (nothing ends in F), so a chain only ever meets them as a
 * seed — which is why seeds lean toward the hard-to-reach.
 */
const inDegreeCache = new WeakMap<readonly ISOCountryCode[], Map<ISOCountryCode, number>>()
export const atlasInDegree = (pool: readonly ISOCountryCode[]): Map<ISOCountryCode, number> => {
  const cached = inDegreeCache.get(pool)
  if (cached) return cached
  const degree = new Map<ISOCountryCode, number>(pool.map(isoCode => [isoCode, 0]))
  for (const prev of pool) {
    for (const next of atlasContinuations(prev, [], pool)) {
      degree.set(next, (degree.get(next) ?? 0) + 1)
    }
  }
  inDegreeCache.set(pool, degree)
  return degree
}

/** A seed's draw weight: the fewer names lead in, the likelier it opens. The
 *  square root keeps the lean gentle — the unreachable few come up often
 *  enough to be met, never so often they become the usual opening. */
const seedWeight = (inDegree: number): number => 1 / Math.sqrt(1 + inDegree)

/**
 * A seed whose openers offer real play. Atlas plays on the world pool even in
 * region games: the letters game is global by nature.
 */
export const pickAtlasSeed = (
  rules: GameRules,
  {
    minOptions = ATLAS_GATE_SEED_OPTIONS,
    exclude,
  }: { minOptions?: number; exclude?: ReadonlySet<ISOCountryCode> } = {}
): ISOCountryCode | undefined => {
  const pool = playableWorldCountries(rules)
  const degree = atlasInDegree(pool)
  const candidates = pool.filter(
    isoCode =>
      !exclude?.has(isoCode) &&
      atlasContinuations(isoCode, exclude ?? [], pool).length >= minOptions
  )
  return weightedPick(candidates.map(isoCode => [isoCode, seedWeight(degree.get(isoCode) ?? 0)]))
}

/** Fresh ground mid-round (a dead end's redeal, a pulled rip cord): never a
 *  walked country, and never a seed that is itself a dead end. Prefers the
 *  table's healthy opening, settles for any live seed late in a round. */
export const pickAtlasReseed = (
  rules: GameRules,
  walked: readonly ISOCountryCode[]
): ISOCountryCode | undefined => {
  const exclude = new Set(walked)
  return (
    pickAtlasSeed(rules, { minOptions: ATLAS_TABLE_SEED_OPTIONS, exclude }) ??
    pickAtlasSeed(rules, { minOptions: 1, exclude })
  )
}

/** How many moves a continuation would leave the next player. */
const onwardCount = (
  isoCode: ISOCountryCode,
  spent: ReadonlySet<ISOCountryCode>,
  pool: readonly ISOCountryCode[]
): number =>
  atlasContinuations(isoCode, [], pool).filter(next => next !== isoCode && !spent.has(next)).length

/**
 * The buyable hint's pick: a continuation that itself continues, so the hint
 * never hands out a dead end. When overlaps pay, prefer the deepest overlap
 * on offer — the hint should also teach the rule.
 */
export const pickAtlasHint = (
  prev: ISOCountryCode,
  used: ReadonlySet<ISOCountryCode> | readonly ISOCountryCode[],
  pool: readonly ISOCountryCode[],
  options: AtlasCreditOptions = {},
  spellings?: AtlasSpellings
): ISOCountryCode | undefined => {
  const spent = asSet(used)
  const continuations = atlasContinuations(prev, spent, pool, spellings)
  const alive = continuations.filter(isoCode => onwardCount(isoCode, spent, pool) > 0)
  const candidates = alive.length ? alive : continuations
  if (!options.payOverlaps) return sample(candidates)
  const best = Math.max(0, ...candidates.map(isoCode => atlasLinkOverlap(prev, isoCode, spellings)))
  return sample(candidates.filter(isoCode => atlasLinkOverlap(prev, isoCode, spellings) === best))
}

/**
 * The reveal's teaching hand from a set of names that would have chained: the
 * ones that would have stayed alive first, varied from round to round rather
 * than the same alphabetical few.
 */
export const atlasTeachingPicks = (
  candidates: readonly ISOCountryCode[],
  used: ReadonlySet<ISOCountryCode> | readonly ISOCountryCode[],
  pool: readonly ISOCountryCode[],
  count: number
): ISOCountryCode[] => {
  const spent = asSet(used)
  const alive = (isoCode: ISOCountryCode) => (onwardCount(isoCode, spent, pool) > 0 ? 1 : 0)
  return shuffleArray([...candidates])
    .sort((one, two) => alive(two) - alive(one))
    .slice(0, count)
}

/** The settled round's facts, straight off its state so the reveal can never
 *  disagree with the rule that graded it. */
export interface AtlasRoundStats {
  links: number
  chains: number
  /** Most links one player named back to back. */
  longestRun?: { playerId: string; run: number }
  /** The longest shared ending walked. */
  deepest?: { tie: AtlasTie; to: ISOCountryCode }
  /** The letter most names opened on. */
  busiest?: { letter: string; count: number }
  /** Cords pulled, by hand or by a dead end. */
  cords: number
}

export const atlasRoundStats = (
  state: ChainTurnState<unknown>,
  moverOf: ReadonlyMap<ISOCountryCode, string>
): AtlasRoundStats => {
  const { spellings } = state
  const links = state.chains.reduce((total, walked) => total + walked.length - 1, 0)
  let longestRun: AtlasRoundStats['longestRun']
  let deepest: AtlasRoundStats['deepest']
  const openedWith = new Map<string, number>()

  for (const walked of state.chains) {
    let run = 0
    let previous: string | undefined
    for (let index = 1; index < walked.length; index++) {
      const mover = moverOf.get(walked[index])
      run = mover && mover === previous ? run + 1 : 1
      previous = mover
      if (mover && run > (longestRun?.run ?? 0)) longestRun = { playerId: mover, run }

      const letter = atlasHeadLetter(walked[index], spellings).toUpperCase()
      openedWith.set(letter, (openedWith.get(letter) ?? 0) + 1)
      const tie = atlasLinkTie(walked[index - 1], walked[index], spellings)
      if (tie && tie.overlap > Math.max(1, deepest?.tie.overlap ?? 1)) {
        deepest = { tie, to: walked[index] }
      }
    }
  }

  const [letter, count] = [...openedWith].sort((one, two) => two[1] - one[1])[0] ?? []
  return {
    links,
    chains: state.chains.length,
    longestRun,
    deepest,
    busiest: letter && count ? { letter, count } : undefined,
    cords: (state.breaks ?? []).filter(sealed => sealed.kind === 'rip-cord' || sealed.rescued)
      .length,
  }
}

/**
 * How hard a move squeezes whoever plays next: the moves it leaves them,
 * fewer being sharper. Zero is a sprung trap. The bots' trap play and the
 * preview's rival read this one measure.
 */
export const atlasSqueeze = (
  isoCode: ISOCountryCode,
  used: readonly ISOCountryCode[],
  pool: readonly ISOCountryCode[]
): number => onwardCount(isoCode, new Set([...used, isoCode]), pool)

/**
 * A move from a player who reads the table: with `cunning` odds, the one that
 * leaves the next seat the fewest names (a dead end when one is on offer);
 * otherwise any legal move. The bots and the preview's rival both play it.
 */
export const pickAtlasMove = (
  open: readonly ISOCountryCode[],
  used: readonly ISOCountryCode[],
  pool: readonly ISOCountryCode[],
  cunning: number,
  random: () => number = Math.random
): ISOCountryCode | undefined => {
  if (random() >= cunning) return sample(open, random)
  const squeezes = open.map(isoCode => [isoCode, atlasSqueeze(isoCode, used, pool)] as const)
  const tightest = Math.min(...squeezes.map(([, squeeze]) => squeeze))
  return sample(
    squeezes.filter(([, squeeze]) => squeeze === tightest).map(([isoCode]) => isoCode),
    random
  )
}
