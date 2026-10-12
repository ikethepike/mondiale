import { CLAIMS } from '~~/data/claims.gen'
import { sample, sampleMany, shuffleArray } from '~~/lib/arrays'
import { playableCountries, playableWorldCountries } from '~~/lib/game-rules'
import { isChallengeOfType } from '~~/lib/rounds'
import { assembleSheet, isTrap, TWO_TRUTHS_TUNING } from '~~/lib/two-truths'
import type { TwoTruthsChallenge } from '~~/types/challenges/group-modes.type'
import { isFameDealable } from '~~/types/fame.types'
import type { Game } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'
import type { Claim, TwoTruthsReceipt } from '~~/types/two-truths.types'

/**
 * Two Truths' answer key: the stamped deck, the dealer that draws a sheet from
 * it and the verdicts the grader and the receipts read. Reached only through
 * `loadTwoTruthsAnswers`, so no verdict ships in a production client build.
 */

const BY_ID = new Map(CLAIMS.map(claim => [claim.id, claim]))

const BY_SUBJECT = CLAIMS.reduce((index, claim) => {
  index.set(claim.subject, [...(index.get(claim.subject) ?? []), claim])
  return index
}, new Map<ISOCountryCode, Claim[]>())

const dealtClaimIds = (game: Pick<Game, 'rounds'>): Set<string> =>
  new Set(
    game.rounds.flatMap(round =>
      isChallengeOfType(round.groupChallenge, 'two-truths-challenge')
        ? round.groupChallenge.cards.map(card => card.id)
        : []
    )
  )

export const pickTwoTruths = (
  game: Game,
  maximumPoints: number
): TwoTruthsChallenge | undefined => {
  const inPlay = new Set(playableWorldCountries(game))
  const dealt = dealtClaimIds(game)

  // The lie count is drawn ONCE and subjects are tried against it: redrawing
  // per subject let the harder three-lie sheets fail more often, skewing the
  // mix a player could learn to lean on. Other counts are only a fallback.
  const drawn = sample(TWO_TRUTHS_TUNING.lies) ?? 1
  const counts = [drawn, ...shuffleArray(TWO_TRUTHS_TUNING.lies.filter(lies => lies !== drawn))]
  for (const lies of counts) {
    for (const subject of sampleMany(playableCountries(game), TWO_TRUTHS_TUNING.subjectTries)) {
      const claims = (BY_SUBJECT.get(subject) ?? []).filter(
        claim =>
          isFameDealable(claim.fame, game.difficulty) &&
          claim.countries.every(isoCode => inPlay.has(isoCode)) &&
          !dealt.has(claim.id)
      )
      const sheet = assembleSheet(claims, lies)
      if (!sheet) continue
      return {
        _type: 'two-truths-challenge',
        country: subject,
        cards: sheet.map(({ id, family, text, countries }) => ({ id, family, text, countries })),
        durationSeconds: TWO_TRUTHS_TUNING.seconds,
        maximumPoints,
      }
    }
  }
  return undefined
}

const claimsOf = (challenge: Pick<TwoTruthsChallenge, 'cards'>): Claim[] =>
  challenge.cards.map(card => {
    const claim = BY_ID.get(card.id)
    if (!claim) throw new ReferenceError(`Two Truths card missing from the deck: ${card.id}`)
    return claim
  })

/** Each dealt card's verdict, in deal order. */
export const twoTruthsVerdicts = (challenge: Pick<TwoTruthsChallenge, 'cards'>): boolean[] =>
  claimsOf(challenge).map(claim => claim.truth)

/** The receipts for the cards at `indices` (every card by default). */
export const twoTruthsReceipts = (
  challenge: Pick<TwoTruthsChallenge, 'cards'>,
  indices?: readonly number[]
): TwoTruthsReceipt[] =>
  claimsOf(challenge).flatMap((claim, index) =>
    !indices || indices.includes(index)
      ? [
          {
            index,
            truth: claim.truth,
            note: claim.note,
            evidence: claim.evidence,
            trap: isTrap(claim),
          },
        ]
      : []
  )
