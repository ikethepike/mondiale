/**
 * Mother Tongue's board scope — the one place the round works out which
 * board it is asking about, and what that means for a guess.
 *
 * A regional board deals only the speakers standing on it, so "Who speaks
 * French?" on a Europe board means five countries, not thirty. The dealer
 * stamps that scope onto the challenge; everything a player reads (the
 * interstitial, the prompt, the scorecard) and the off-board veto resolve it
 * through here, so the question asked and the recap printed can never drift.
 */
import { COUNTRIES } from '~~/data/countries.gen'
import type { MotherTongueChallenge } from '~~/types/challenges/group-modes.type'
import type { ISOCountryCode } from '~~/types/geography.types'
import { REGION_LABELS } from './variant'

/**
 * The board in words, ready to follow a question: "in Europe", "in the world".
 * `REGION_LABELS` carries its own article where one is needed ("the Middle
 * East"), so the phrase takes a bare `in`.
 */
export const motherTongueScope = (challenge: Pick<MotherTongueChallenge, 'scope'>): string =>
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
  return `${challenge.countries.length} countries${where} have ${challenge.language} as an official language — name as many as you can in ${challenge.durationSeconds} seconds. Wrong guesses cost points.`
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
  challenge: Pick<MotherTongueChallenge, 'language' | 'scope' | 'countries'> | undefined,
  isoCode: ISOCountryCode
): boolean => {
  if (!challenge?.scope) return false
  if (challenge.countries.includes(isoCode)) return false
  const country = COUNTRIES[isoCode]
  // Generous on purpose, and deliberately wider than the set the round DEALS:
  // the dealer is strict about officiality, but a player who names a country
  // that speaks the language in any sense has not earned a penalty.
  return (
    (country?.officialLanguages ?? []).includes(challenge.language) ||
    (country?.languages ?? []).includes(challenge.language)
  )
}
