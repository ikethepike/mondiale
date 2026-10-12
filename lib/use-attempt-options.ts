import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { capitalGuessScore } from '~~/lib/challenges'
import { countryName } from '~~/lib/country'
import { buzzScore } from '~~/lib/scoring'
import type { HintTone } from '~~/types/events.types'
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

/** A pick that is not itself a country — a city on Ground Plan's table. It is
 *  graded, spent and announced by its own name, so two cities of one country
 *  stay two different picks. */
interface NamedPick {
  name: string
  correct: boolean
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
  announce: (entry: {
    kind: 'wrong'
    isoCode: ISOCountryCode
    hint: string
    tone?: HintTone
  }) => void
  /** Bank the round; 0 means failed out. */
  submitRound: (score: number) => void
}) => {
  /** Options already picked and wrong — greyed out, and counted against the cap. */
  const spent = ref<string[]>([])
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

  const onGuess = (country: Country, named?: NamedPick) => {
    const active = challenge.value
    if (!active || submitted.value || !started.value) return

    // The winning guess is never broadcast — it would hand opponents the answer.
    const correct = named ? named.correct : country.isoCode === answerOf(active)
    if (correct) return submitRound(scoreFor(active))

    const key = named?.name ?? country.isoCode
    if (active.maximumGuesses) {
      if (spent.value.includes(key)) return
      spent.value = [...spent.value, key]
      if (attemptsLeft.value <= 0) {
        announce({ kind: 'wrong', isoCode: country.isoCode, hint: 'Out of guesses', tone: 'alert' })
        return submitRound(0)
      }
    }

    const left = attemptsLeft.value
    announce({
      kind: 'wrong',
      isoCode: country.isoCode,
      hint: Number.isFinite(left)
        ? `${named?.name ?? countryName(country)} — ${left} ${left === 1 ? 'guess' : 'guesses'} left`
        : `${named?.name ?? countryName(country)} — not it`,
      tone: 'alert',
    })
  }

  return { spent, attemptsUsed, attemptsLeft, onGuess }
}
