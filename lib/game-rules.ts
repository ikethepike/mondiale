import { COUNTRIES } from '~~/data/countries.gen'
import { ISOCountryCodes } from '~~/data/iso-codes.gen'
import type { GameDifficulty, GameRules } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'
import { countryInVariant } from './variant'

/**
 * The single home for core game-rule configuration: what the difficulty
 * hands each dealer, and which countries a given game plays with. Every
 * dealer, mover validator and selection surface resolves through here —
 * never re-derive a pool or a gate locally.
 */

/** The hard-mode gate: hints and helper labels stay off when this is true. */
export const isHardMode = (game?: { difficulty: GameDifficulty }): boolean =>
  game?.difficulty === 'hard'

/** The easy-mode gate: the strongest hints (a leader's face) show only here. */
export const isEasyMode = (game?: { difficulty: GameDifficulty }): boolean =>
  game?.difficulty === 'easy'

export const DIFFICULTY_CONFIGURATION: {
  [difficulty in GameDifficulty]: {
    rankingChallengeCountries: number
    chainTurnSeconds: number
    /** Whether micro-nations deal and select when the host leaves it on auto. */
    microNations: boolean
  }
} = {
  easy: {
    rankingChallengeCountries: 4,
    chainTurnSeconds: 20,
    microNations: false,
  },
  normal: {
    rankingChallengeCountries: 5,
    chainTurnSeconds: 14,
    microNations: false,
  },
  hard: {
    rankingChallengeCountries: 7,
    chainTurnSeconds: 10,
    microNations: true,
  },
}

/**
 * Below this population a state is a micro-nation. ~100k is the classic
 * microstate line: it keeps the Vatican, Monaco, San Marino, Liechtenstein,
 * Nauru & co out of easy/normal games, where their tiny stat pools distort
 * per-capita rankings, while leaving small-but-real countries (Malta,
 * Barbados, the Maldives) in play.
 */
export const MICRO_NATION_POPULATION_CEILING = 100_000

// Derived from the dataset rather than hand-listed so a data regeneration
// can never drift the roster out from under the rule.
let microNations: ReadonlySet<ISOCountryCode> | undefined
export const getMicroNations = (): ReadonlySet<ISOCountryCode> => {
  microNations ??= new Set(
    ISOCountryCodes.filter(isoCode => {
      const population = COUNTRIES[isoCode]?.people?.population?.amount
      return !!population && population < MICRO_NATION_POPULATION_CEILING
    })
  )
  return microNations
}

export const isMicroNation = (isoCode: ISOCountryCode): boolean => getMicroNations().has(isoCode)

/** Resolve the tri-state: an explicit host override wins, auto follows the
 *  difficulty gate. Pre-setting games carry no key and resolve as auto. */
export const microNationsIncluded = (
  rules: Pick<GameRules, 'difficulty' | 'includeMicroNations'>
): boolean => rules.includeMicroNations ?? DIFFICULTY_CONFIGURATION[rules.difficulty].microNations

/**
 * The micro-nation gate alone, variant-agnostic: may this country appear in
 * this game at all — as an answer, a decoy, a neighbour, a chain link?
 * (Variants never restrict answers — a border doesn't stop at the board's
 * edge — so selection surfaces gate on this, not on isCountryPlayable.)
 */
export const isCountryInPlay = (rules: GameRules, isoCode: ISOCountryCode): boolean =>
  microNationsIncluded(rules) || !isMicroNation(isoCode)

/** Board membership: on this game's variant AND in play under its rules.
 *  Dealers draw their subjects from countries that pass this. */
export const isCountryPlayable = (rules: GameRules, isoCode: ISOCountryCode): boolean =>
  countryInVariant(isoCode, rules.variant) && isCountryInPlay(rules, isoCode)

/** The pool a game deals its subjects from — the variant's countries minus
 *  any benched micro-nations. Supersedes bare variantCountries in dealers. */
export const playableCountries = (rules: GameRules): ISOCountryCode[] =>
  ISOCountryCodes.filter(isoCode => isCountryPlayable(rules, isoCode))

/** The world-wide in-play pool — what dealers widen to when a continental
 *  board can't fill a table (decoys, duels, lie sources). */
export const playableWorldCountries = (rules: GameRules): ISOCountryCode[] =>
  ISOCountryCodes.filter(isoCode => isCountryInPlay(rules, isoCode))

/** Countries this game must never let anyone select — the benched
 *  micro-nations, or nothing when they're in play. Drives the map's
 *  unselectable set and the typed-guess exclusions. */
export const excludedMicroNations = (rules: GameRules): ISOCountryCode[] =>
  microNationsIncluded(rules) ? [] : [...getMicroNations()]

/** The complement of `playableCountries` — what a board dims or greys out. */
export const unplayableCountries = (rules: GameRules): ISOCountryCode[] =>
  ISOCountryCodes.filter(isoCode => !isCountryPlayable(rules, isoCode))
