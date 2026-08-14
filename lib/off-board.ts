/**
 * "Right about the world, wrong about this round."
 *
 * Several dealers narrow an answer key to what the table is actually playing:
 * `playableCountries` drops countries off a continental board, and
 * `isCountryInPlay` benches micro-nations below hard mode. The narrowing is
 * correct — a Europe board should ask about Europe, and a benched country can't
 * be a required answer. What was wrong is what happened to the player who named
 * one anyway: they were scored as if they'd got the geography wrong.
 *
 * San Marino really is surrounded by Italy. Monaco really is on the
 * Mediterranean. Telling a player otherwise, and charging them for it, punishes
 * the knowledge the game exists to reward.
 *
 * These predicates answer one question — "is this guess true of the world but
 * absent from the key?" — so the views can bounce it free instead. They are
 * deliberately GENEROUS: the cost of a wrong veto is a guess that scores
 * nothing, the cost of a wrong miss is a point and a lie.
 *
 * TODAY these are belt-and-braces for the typed modes: `CountryGuessInput`
 * already refuses to suggest a benched micro-nation, so San Marino cannot be
 * entered in the first place, and the micro-nation gate is the ONLY axis that
 * narrows a neighbour or shore key (measured across every board). They earn
 * their place as the guard for the day that input gate changes, a mode reads a
 * key narrowed some other way, or a non-typed surface (a map tap) reaches the
 * same handler — not as a fix for a live scoring bug.
 *
 * The language rounds have their own home (`lib/language-rounds.ts`) because
 * their copy is bound up with the same scope; the shape of the test is the same.
 */
import { BORDERS } from '~~/data/borders.gen'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * Does this country really border the subject, while sitting outside the
 * round's answer key? True only for a genuine neighbour the deal benched —
 * `BORDERS` is the unfiltered truth the dealer narrowed.
 */
export const bordersButOffKey = (
  subject: ISOCountryCode | undefined,
  answerKey: readonly ISOCountryCode[],
  guess: ISOCountryCode
): boolean => {
  if (!subject || guess === subject) return false
  if (answerKey.includes(guess)) return false
  return (BORDERS[subject] ?? []).includes(guess)
}

/**
 * Does this country really touch the feature, while sitting outside the
 * round's answer key? The caller supplies the feature's unfiltered shore list
 * (the view already loads the geometry for its own map work).
 */
export const touchesButOffKey = (
  allShores: readonly ISOCountryCode[] | undefined,
  answerKey: readonly ISOCountryCode[],
  guess: ISOCountryCode
): boolean => {
  if (!allShores?.length) return false
  if (answerKey.includes(guess)) return false
  return allShores.includes(guess)
}
