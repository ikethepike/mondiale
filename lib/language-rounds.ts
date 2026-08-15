/**
 * The board scope of the two language rounds — the one place they work out
 * which board they are asking about, and what that means for a guess.
 *
 * A regional board deals only the speakers standing on it, so "Who speaks
 * French?" on a Europe board means five countries, not thirty. The dealer
 * stamps that scope onto the challenge; everything a player reads (the
 * interstitial, the prompt, the scorecard) and the off-board veto resolve it
 * through here, so the question asked and the recap printed can never drift.
 *
 * Mother Tongue (type the whole set) and Tongue Buzz (buzz any one of it) sit
 * here together because they ask the SAME question of the same data and got
 * different answers for a while: Mother Tongue graded official languages while
 * Tongues graded spoken ones, under copy that promised "official" in both.
 * Both now deal and grade `boardSpeakers`, so the two rounds can only ever
 * mean the same thing by "speaks".
 */
import { COUNTRIES } from '~~/data/countries.gen'
import type {
  MotherTongueChallenge,
  TongueBuzzChallenge,
} from '~~/types/challenges/group-modes.type'
import type { ISOCountryCode } from '~~/types/geography.types'
import { REGION_LABELS } from './variant'

/** Either language round: both name a language and carry a board-scoped set. */
type LanguageRound = Pick<MotherTongueChallenge | TongueBuzzChallenge, 'language' | 'scope'> & {
  countries: ISOCountryCode[]
}

/**
 * Every language a country speaks — the UNION of the two language fields, and
 * the one derivation everything else here is built from.
 *
 * Neither field alone is the answer: officiality misses Kazakhstan's and
 * Uzbekistan's Russian and every other language the Factbook files as spoken
 * rather than official (naming one used to cost a point for knowing the
 * world), and the spoken list misses Burundi's English and Slovenia's coastal
 * Italian, which never reach it.
 */
export const spokenLanguages = (isoCode: ISOCountryCode): Set<string> => {
  const country = COUNTRIES[isoCode]
  return new Set([...(country?.officialLanguages ?? []), ...(country?.languages ?? [])])
}

/** Does this country speak the language at all? The rounds ask "Who speaks
 *  Russian?", so this is the whole question they grade. */
export const speaksLanguage = (isoCode: ISOCountryCode, language: string): boolean =>
  spokenLanguages(isoCode).has(language)

/**
 * The board's languages, each with the countries standing on it that speak
 * them — the ONE index both dealers deal from. A round's answer set, the copy
 * that counts it and the off-board veto all resolve through `spokenLanguages`,
 * so a country can never be dealt by one rule and graded by another.
 */
export const boardSpeakers = (pool: readonly ISOCountryCode[]): Map<string, ISOCountryCode[]> => {
  const speakers = new Map<string, ISOCountryCode[]>()
  for (const isoCode of pool) {
    for (const language of spokenLanguages(isoCode)) {
      speakers.set(language, [...(speakers.get(language) ?? []), isoCode])
    }
  }
  return speakers
}

/**
 * The board in words, ready to follow a question: "in Europe", "in the world".
 * `REGION_LABELS` carries its own article where one is needed ("the Middle
 * East"), so the phrase takes a bare `in`.
 */
export const motherTongueScope = (challenge: Pick<LanguageRound, 'scope'>): string =>
  challenge.scope ? `in ${REGION_LABELS[challenge.scope]}` : 'in the world'

/**
 * "Who speaks French in Europe?" — the prompt and the interstitial title.
 * A world board keeps the plain question: it was never scoped, and saying so
 * would only add words to the one case that never needed them.
 */
export const motherTongueQuestion = (
  challenge: Pick<MotherTongueChallenge, 'language' | 'scope'>
): string =>
  challenge.scope
    ? `Who speaks ${challenge.language} ${motherTongueScope(challenge)}?`
    : `Who speaks ${challenge.language}?`

/** The interstitial's stakes line — the count is only ever the board's. */
export const motherTongueStakes = (
  challenge: Pick<MotherTongueChallenge, 'language' | 'scope' | 'countries' | 'durationSeconds'>
): string => {
  // Only a regional board needs its bounds spelled out — on a world board the
  // count already means every country there is.
  const where = challenge.scope ? ` ${motherTongueScope(challenge)}` : ''
  return `${challenge.countries.length} countries${where} speak ${challenge.language} — name as many as you can in ${challenge.durationSeconds} seconds. Wrong guesses cost points.`
}

/**
 * Tongue Buzz's sub-line: what counts as a right answer, bounded by the board.
 * "Any country where it's spoken counts" is a promise the round can only keep
 * on a world board.
 */
export const tongueBuzzRule = (challenge: Pick<LanguageRound, 'scope'>): string =>
  challenge.scope
    ? `Any country ${motherTongueScope(challenge)} where it's spoken counts`
    : "Any country where it's spoken counts"

/** Tongue Buzz's reveal line: "Spoken in 5 countries in Europe". */
export const tongueBuzzTally = (challenge: Pick<LanguageRound, 'scope' | 'countries'>): string => {
  const count = challenge.countries.length
  const where = challenge.scope ? ` ${motherTongueScope(challenge)}` : ''
  return `Spoken in ${count} ${count === 1 ? 'country' : 'countries'}${where}`
}

/**
 * Does this country speak the language but stand off the board?
 *
 * Such a guess is RIGHT about the world and wrong only about the round, so it
 * is vetoed rather than scored: a veto costs nothing and never reaches the
 * submitted list. Terra Incognita refuses the same hook on purpose, because
 * there a free bounce would leak that a country is about to vanish — here it
 * leaks nothing, since the board has been fixed and visible all game.
 */
export const speaksButOffBoard = (
  challenge: LanguageRound | undefined,
  isoCode: ISOCountryCode
): boolean => {
  if (!challenge?.scope) return false
  if (challenge.countries.includes(isoCode)) return false
  // The same predicate the board was dealt with, so the veto is exactly "this
  // speaker is standing somewhere else" — never a second opinion on who speaks.
  return speaksLanguage(isoCode, challenge.language)
}
