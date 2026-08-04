import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { capitalGuessScore } from '~~/lib/challenges'
import { countryName } from '~~/lib/country'
import { buzzScore } from '~~/lib/scoring'
import type { Country, ISOCountryCode } from '~~/types/geography.types'

/** The challenge shape the attempt machine needs — capital-guess, flashpoint. */
interface AttemptChallenge {
  /** The round's subject: the country the prompt is about. */
  country: ISOCountryCode
  /**
   * The country that scores, when the subject is not itself the answer.
   * Recognition modes name their subject, so `country` doubles as the answer
   * key; composition asks about a board and answers with one of its origins,
   * and the board is never among its own options.
   */
  answer?: ISOCountryCode
  maximumGuesses?: number
  maximumPoints: number
}

/** What a guess is graded against — the answer key, never the prompt. */
const answerOf = (challenge: AttemptChallenge): ISOCountryCode =>
  challenge.answer ?? challenge.country

/**
 * The two-guess option state machine shared by the recognition modes that
 * deal a small option table outside hard mode (capital-guess, flashpoint):
 * wrong picks grey out and spend the cap, the right pick pays by attempt —
 * or, free-typed on hard, by the clock. One home so the cap arithmetic,
 * the wrong-pick hints and the never-broadcast-the-answer rule can't drift.
 */
export const useAttemptOptions = ({
  challenge,
  submitted,
  started,
  remainingFraction,
  announce,
  submitRound,
}: {
  challenge: ComputedRef<AttemptChallenge | undefined>
  submitted: Ref<boolean>
  started: Ref<boolean>
  remainingFraction: ComputedRef<number>
  announce: (entry: { kind: 'wrong'; isoCode: ISOCountryCode; hint: string }) => void
  /** Bank the round; 0 means failed out. */
  submitRound: (score: number) => void
}) => {
  /** Options already picked and wrong — greyed out, and counted against the cap. */
  const spent = ref<ISOCountryCode[]>([])
  const attemptsUsed = computed(() => spent.value.length)
  const attemptsLeft = computed(() =>
    challenge.value?.maximumGuesses
      ? challenge.value.maximumGuesses - attemptsUsed.value
      : Number.POSITIVE_INFINITY
  )

  /** Option variants pay by attempt; hard mode free-types against the clock. */
  const scoreFor = (active: AttemptChallenge) =>
    active.maximumGuesses
      ? capitalGuessScore(attemptsUsed.value + 1, active.maximumGuesses, active.maximumPoints)
      : buzzScore(active.maximumPoints, remainingFraction.value)

  const onGuess = (country: Country) => {
    const active = challenge.value
    if (!active || submitted.value || !started.value) return

    // The winning guess is never broadcast — it would hand opponents the answer.
    if (country.isoCode === answerOf(active)) return submitRound(scoreFor(active))

    if (active.maximumGuesses) {
      if (spent.value.includes(country.isoCode)) return
      spent.value = [...spent.value, country.isoCode]
      if (attemptsLeft.value <= 0) {
        announce({ kind: 'wrong', isoCode: country.isoCode, hint: 'Out of guesses' })
        return submitRound(0)
      }
    }

    const left = attemptsLeft.value
    announce({
      kind: 'wrong',
      isoCode: country.isoCode,
      hint: Number.isFinite(left)
        ? `${countryName(country)} — ${left} ${left === 1 ? 'guess' : 'guesses'} left`
        : `${countryName(country)} — not it`,
    })
  }

  return { spent, attemptsUsed, attemptsLeft, onGuess }
}
