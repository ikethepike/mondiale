import { COUNTRIES } from '~~/data/countries.gen'
import type { ChainTurnState } from '~~/types/challenges/group-modes.type'
import type { GameDifficulty, GameRules } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'
import { sample, shuffleArray } from './arrays'
import { normalizeCountryName } from './country'
import { playableWorldCountries } from './game-rules'

/**
 * Atlas — the country name chain. Each link must start where the previous one
 * ended, and three ties count: the last letter (Nepal → Laos), the consonant
 * under a trailing vowel run (Albania → Nigeria, Germany → Norway), or any
 * longer shared ending (Poland → Andorra). This module is the one home for the
 * rule: validation, credit, seeds, hints and the trap proof all read it, on
 * both sides of the wire.
 *
 * The plain last-letter rule drowned in A: 71 of 183 names end in it, 9 start
 * with it, and 7 of those 9 end in it again — every round collapsed into
 * counting the A's left. The consonant tie is the fix; overlaps alone are not
 * (nothing starts "Ia", which is how most of the A's end).
 */

/** How credit is paid, never which links are legal — one rule for every
 *  difficulty. The hard gate pays a shared ending's full length. */
export interface AtlasCreditOptions {
  payOverlaps?: boolean
}

/**
 * The one key for letters, overlap and displayed fragments — matching and
 * collision-keying share it (the unique-or-bust posture). Space-stripped on
 * top of `normalizeCountryName` so multi-letter overlaps are well-defined
 * across word boundaries; for single letters stripping changes nothing.
 */
const keyCache = new Map<ISOCountryCode, string>()
export const atlasKey = (isoCode: ISOCountryCode): string => {
  const cached = keyCache.get(isoCode)
  if (cached) return cached
  const key = normalizeCountryName(COUNTRIES[isoCode].name.english).replaceAll(' ', '')
  keyCache.set(isoCode, key)
  return key
}

export const atlasHeadLetter = (isoCode: ISOCountryCode): string => atlasKey(isoCode)[0] ?? ''

export const atlasTailLetter = (isoCode: ISOCountryCode): string => atlasKey(isoCode).at(-1) ?? ''

/** Y counts as a vowel here, so Germany offers N and Norway offers W. */
const TRAILING_VOWELS = /[aeiouy]+$/

/** The consonant a trailing vowel run sits on (Albania → n), or undefined
 *  when the name already ends in a consonant. */
export const atlasConsonant = (isoCode: ISOCountryCode): string | undefined => {
  const key = atlasKey(isoCode)
  const stripped = key.replace(TRAILING_VOWELS, '')
  return stripped.length && stripped.length < key.length ? stripped.at(-1) : undefined
}

/** Every single letter a follower may open with: the tail, then the
 *  consonant under a trailing vowel run. */
export const atlasOpeners = (isoCode: ISOCountryCode): string[] => {
  const consonant = atlasConsonant(isoCode)
  return consonant ? [atlasTailLetter(isoCode), consonant] : [atlasTailLetter(isoCode)]
}

/** "A or N" — the openers as every surface prints them. */
export const atlasOpenersLabel = (isoCode: ISOCountryCode): string =>
  atlasOpeners(isoCode)
    .map(letter => letter.toUpperCase())
    .join(' or ')

/**
 * The longest k where `prev`'s k-suffix equals `next`'s k-prefix; 0 means the
 * names share no ending. Niger → Nigeria is 5.
 */
export const atlasLinkOverlap = (prev: ISOCountryCode, next: ISOCountryCode): number => {
  const a = atlasKey(prev)
  const b = atlasKey(next)
  for (let k = Math.min(a.length, b.length); k >= 1; k--) {
    if (a.endsWith(b.slice(0, k))) return k
  }
  return 0
}

export type AtlasTieKind = 'letter' | 'consonant' | 'overlap'

/** What joins two names: the kind of tie, the fragment both share, and its
 *  length (a consonant tie shares one letter but no ending). */
export interface AtlasTie {
  kind: AtlasTieKind
  fragment: string
  overlap: number
}

/** The tie between two names, or undefined when they do not chain. A longer
 *  shared ending outranks the single letter, which outranks the consonant. */
export const atlasLinkTie = (prev: ISOCountryCode, next: ISOCountryCode): AtlasTie | undefined => {
  const overlap = atlasLinkOverlap(prev, next)
  if (overlap >= 1) {
    return {
      kind: overlap > 1 ? 'overlap' : 'letter',
      fragment: atlasKey(next).slice(0, overlap),
      overlap,
    }
  }
  const consonant = atlasConsonant(prev)
  if (consonant && atlasHeadLetter(next) === consonant) {
    return { kind: 'consonant', fragment: consonant, overlap: 0 }
  }
  return undefined
}

export const isAtlasLink = (prev: ISOCountryCode, next: ISOCountryCode): boolean =>
  !!atlasLinkTie(prev, next)

const asSet = (used: ReadonlySet<ISOCountryCode> | readonly ISOCountryCode[]) =>
  used instanceof Set ? used : new Set(used)

/**
 * Legal extensions of a chain: chain off `prev`, unused, in the pool. The
 * server's move validation and the client's courtesy check both call this.
 */
export const atlasContinuations = (
  prev: ISOCountryCode,
  used: ReadonlySet<ISOCountryCode> | readonly ISOCountryCode[],
  pool: readonly ISOCountryCode[]
): ISOCountryCode[] => {
  const spent = asSet(used)
  return pool.filter(
    isoCode => isoCode !== prev && !spent.has(isoCode) && isAtlasLink(prev, isoCode)
  )
}

/** Every country walked this round — the classic game forbids repeats across
 *  every chain, not just the live one. */
export const atlasWalked = (state: ChainTurnState<unknown>): ISOCountryCode[] => state.chains.flat()

/** The live head's legal moves — the engine grades with it, the bot brain
 *  plays from it and the view counts it, so none of them can drift. */
export const atlasLiveMoves = (
  state: ChainTurnState<unknown>,
  rules: GameRules
): ISOCountryCode[] => {
  const head = state.chains.at(-1)?.at(-1)
  if (!head) return []
  return atlasContinuations(head, atlasWalked(state), playableWorldCountries(rules))
}

/** A dead head's proof: the letters it offered, and every country that would
 *  have chained — all already walked. */
export const atlasTrapProof = (
  head: ISOCountryCode,
  used: readonly ISOCountryCode[],
  pool: readonly ISOCountryCode[]
): { openers: string[]; spent: ISOCountryCode[] } => {
  const walked = new Set(used)
  return {
    openers: atlasOpeners(head),
    spent: atlasContinuations(head, [], pool).filter(isoCode => walked.has(isoCode)),
  }
}

const linkCredit = (
  prev: ISOCountryCode,
  next: ISOCountryCode,
  options: AtlasCreditOptions
): number => (options.payOverlaps ? Math.max(1, atlasLinkOverlap(prev, next)) : 1)

/**
 * Links banked by a chain — derived from the chain itself, never stored, so
 * the dealt rule and the paid reward agree by construction. One per junction;
 * with `payOverlaps`, a shared ending pays its length.
 */
export const atlasChainCredit = (
  chain: readonly ISOCountryCode[],
  options: AtlasCreditOptions = {}
): number => {
  let credit = 0
  for (let index = 1; index < chain.length; index++) {
    if (!isAtlasLink(chain[index - 1], chain[index])) continue
    credit += linkCredit(chain[index - 1], chain[index], options)
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

/** A chain from `seed` (seed first) banking `target` links, or undefined
 *  when the pool holds none. */
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

/** A gate seed must leave a hand's worth of first moves; a table seed more —
 *  the whole opening rotation plays off the same letter. */
export const ATLAS_GATE_SEED_OPTIONS = 3
export const ATLAS_TABLE_SEED_OPTIONS = 5

/** Easy mode's console assist, both formats: the suggestion dropdown returns
 *  once this many characters are typed — you still recall how a name STARTS,
 *  the list only saves the typing. Below easy the console stays pure recall. */
export const ATLAS_EASY_SUGGEST_FROM = 3

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
 *  on every difficulty) in atlas-chain.test.ts, so the screen that teaches
 *  the rule can never show a link the rule refuses. */
export const ATLAS_TUTORIAL_EXAMPLES: Record<AtlasTieKind, [ISOCountryCode, ISOCountryCode]> = {
  letter: ['NP', 'LA'],
  consonant: ['AL', 'NG'],
  overlap: ['JP', 'PA'],
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
  return shuffleArray(pool.filter(isoCode => !exclude?.has(isoCode))).find(
    isoCode => atlasContinuations(isoCode, exclude ?? [], pool).length >= minOptions
  )
}

/**
 * The buyable hint's pick: a continuation that itself continues, so the hint
 * never hands out a dead end. When overlaps pay, prefer the deepest overlap
 * on offer — the hint should also teach the rule.
 */
export const pickAtlasHint = (
  prev: ISOCountryCode,
  used: ReadonlySet<ISOCountryCode> | readonly ISOCountryCode[],
  pool: readonly ISOCountryCode[],
  options: AtlasCreditOptions = {}
): ISOCountryCode | undefined => {
  const spent = asSet(used)
  const continuations = atlasContinuations(prev, spent, pool)
  const alive = continuations.filter(
    isoCode => atlasContinuations(isoCode, new Set([...spent, isoCode]), pool).length > 0
  )
  const candidates = alive.length ? alive : continuations
  if (!options.payOverlaps) return sample(candidates)
  const best = Math.max(0, ...candidates.map(isoCode => atlasLinkOverlap(prev, isoCode)))
  return sample(candidates.filter(isoCode => atlasLinkOverlap(prev, isoCode) === best))
}
