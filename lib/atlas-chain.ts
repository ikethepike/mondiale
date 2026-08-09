import { COUNTRIES } from '~~/data/countries.gen'
import type { GameDifficulty, GameRules } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'
import { sample, shuffleArray } from './arrays'
import { normalizeCountryName } from './country'
import { playableWorldCountries } from './game-rules'

/**
 * Atlas — the country name chain. Each link must start where the previous one
 * ended: Nepal → Laos → Sweden. On hard the rule widens to ANY shared ending
 * (Nepal → Palestine, overlap "pal"), and the gate pays overlap length as
 * links. This module is the one home for the letter rule: validation, credit,
 * seeds and hints all read the same key, on both sides of the wire.
 */

/** Whether links accept any k-letter ending (hard) or the single tail letter. */
export interface AtlasRuleOptions {
  overlaps?: boolean
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

/**
 * The longest k where `prev`'s k-suffix equals `next`'s k-prefix; 0 means the
 * pair does not chain at all. The base rule is k >= 1; hard accepts (and the
 * gate rewards) every k, so Niger → Nigeria banks 5.
 */
export const atlasLinkOverlap = (prev: ISOCountryCode, next: ISOCountryCode): number => {
  const a = atlasKey(prev)
  const b = atlasKey(next)
  for (let k = Math.min(a.length, b.length); k >= 1; k--) {
    if (a.endsWith(b.slice(0, k))) return k
  }
  return 0
}

const asSet = (used: ReadonlySet<ISOCountryCode> | readonly ISOCountryCode[]) =>
  used instanceof Set ? used : new Set(used)

/** Whether `next` legally extends a chain headed by `prev` under the rule. */
export const isAtlasLink = (
  prev: ISOCountryCode,
  next: ISOCountryCode,
  options: AtlasRuleOptions = {}
): boolean =>
  options.overlaps
    ? atlasLinkOverlap(prev, next) >= 1
    : atlasHeadLetter(next) === atlasTailLetter(prev)

/**
 * Legal extensions of a chain: chain off `prev`, unused, in the pool. The
 * server's move validation and the client's courtesy check both call this.
 */
export const atlasContinuations = (
  prev: ISOCountryCode,
  used: ReadonlySet<ISOCountryCode> | readonly ISOCountryCode[],
  pool: readonly ISOCountryCode[],
  options: AtlasRuleOptions = {}
): ISOCountryCode[] => {
  const spent = asSet(used)
  return pool.filter(
    isoCode => isoCode !== prev && !spent.has(isoCode) && isAtlasLink(prev, isoCode, options)
  )
}

/**
 * Links banked by a chain — derived from the chain itself, never stored, so
 * the dealt rule and the paid reward agree by construction. Plain rule: one
 * per junction. With overlaps, each junction pays its overlap length.
 */
export const atlasChainCredit = (
  chain: readonly ISOCountryCode[],
  options: AtlasRuleOptions = {}
): number => {
  let credit = 0
  for (let index = 1; index < chain.length; index++) {
    const overlap = atlasLinkOverlap(chain[index - 1], chain[index])
    if (!overlap) continue
    credit += options.overlaps ? overlap : 1
  }
  return credit
}

/** Links a gate chain must bank. Hard's 6 expects the overlap rule to carry
 *  some of it — two sharp overlaps clear it, six plain letters grind it out. */
export const ATLAS_TARGET_LINKS: Record<GameDifficulty, number> = {
  easy: 3,
  normal: 4,
  hard: 6,
}

/**
 * Whether a chain banking `target` links exists from `seed`. Credit follows
 * the active rule, but dealers pass the plain rule so overlap play is always
 * pure upside on top of a provably solvable deal.
 */
export const hasAtlasChain = (
  seed: ISOCountryCode,
  target: number,
  pool: readonly ISOCountryCode[],
  options: AtlasRuleOptions = {}
): boolean => {
  const used = new Set([seed])
  const walk = (head: ISOCountryCode, banked: number): boolean => {
    if (banked >= target) return true
    for (const next of atlasContinuations(head, used, pool, options)) {
      used.add(next)
      const paid = options.overlaps ? atlasLinkOverlap(head, next) : 1
      if (walk(next, banked + paid)) return true
      used.delete(next)
    }
    return false
  }
  return walk(seed, 0)
}

/** A gate seed must leave a hand's worth of first moves; a table seed more —
 *  the whole opening rotation plays off the same letter. */
export const ATLAS_GATE_SEED_OPTIONS = 3
export const ATLAS_TABLE_SEED_OPTIONS = 5

/** Easy mode's console assist, both formats: the suggestion dropdown returns
 *  once this many characters are typed — you still recall how a name STARTS,
 *  the list only saves the typing. Below easy the console stays pure recall. */
export const ATLAS_EASY_SUGGEST_FROM = 3

/**
 * A seed whose tail letter offers real play under the PLAIN rule (the
 * conservative guard — overlaps only widen it). Atlas plays on the world
 * pool even in region games: the letters game is global by nature.
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
 * never hands out a dead end. With overlaps, prefer the deepest overlap on
 * offer — the hint should also teach the rule.
 */
export const pickAtlasHint = (
  prev: ISOCountryCode,
  used: ReadonlySet<ISOCountryCode> | readonly ISOCountryCode[],
  pool: readonly ISOCountryCode[],
  options: AtlasRuleOptions = {}
): ISOCountryCode | undefined => {
  const spent = asSet(used)
  const continuations = atlasContinuations(prev, spent, pool, options)
  const alive = continuations.filter(
    isoCode => atlasContinuations(isoCode, new Set([...spent, isoCode]), pool, options).length > 0
  )
  const candidates = alive.length ? alive : continuations
  if (!options.overlaps) return sample(candidates)
  const best = Math.max(0, ...candidates.map(isoCode => atlasLinkOverlap(prev, isoCode)))
  return sample(candidates.filter(isoCode => atlasLinkOverlap(prev, isoCode) === best))
}
