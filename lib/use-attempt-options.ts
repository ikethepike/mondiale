import { computed, shallowRef, type ComputedRef, type Ref } from 'vue'
import { attemptPicksScore } from '~~/lib/challenges'
import { countryName } from '~~/lib/country'
import { buzzScore } from '~~/lib/scoring'
import type { HintTone } from '~~/types/events.types'
import type { Country, ISOCountryCode } from '~~/types/geography.types'

/** The challenge shape the attempt machine needs — capital-guess, flashpoint. */
interface AttemptChallenge {
  /** The round's subject: the country the prompt is about. */
  country: ISOCountryCode
  maximumGuesses?: number
  maximumPoints: number
}

/**
 * The two-guess option state machine shared by the recognition modes that
 * deal a small option table outside hard mode (capital-guess, flashpoint):
 * wrong picks grey out and spend the cap, the right pick pays by attempt —
 * or, free-typed on hard, by the clock. One home so the cap arithmetic,
 * the wrong-pick hints and the never-broadcast-the-answer rule can't drift.
 */
export const useAttemptOptions = <Pick extends string = ISOCountryCode>({
  challenge,
  submitted,
  started,
  remainingFraction,
  announce,
  namesAnswer,
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
  /**
   * Named boards only (Ground Plan's cities): every pick is passed to
   * `onGuess` by name and graded, spent and priced by this, so two cities of
   * one country stay two picks. Country boards leave it unset and grade on
   * the ISO code against `country`.
   */
  namesAnswer?: (pick: Pick) => boolean
  /** Bank the round; 0 means failed out. `picks` is the attempt sequence the
   *  server prices option variants from. */
  submitRound: (score: number, picks: Pick[]) => void
}) => {
  /** Options already picked and wrong — greyed out, and counted against the cap. */
  const spent = shallowRef<Pick[]>([])
  const attemptsUsed = computed(() => spent.value.length)
  const attemptsLeft = computed(() =>
    challenge.value?.maximumGuesses
      ? challenge.value.maximumGuesses - attemptsUsed.value
      : Number.POSITIVE_INFINITY
  )

  const isAnswer = (active: AttemptChallenge) =>
    namesAnswer ?? ((pick: Pick) => pick === active.country)

  /** Option variants pay by attempt; hard mode free-types against the clock. */
  const scoreFor = (active: AttemptChallenge, picks: Pick[]) =>
    active.maximumGuesses
      ? attemptPicksScore(picks, isAnswer(active), active.maximumGuesses, active.maximumPoints)
      : buzzScore(active.maximumPoints, remainingFraction.value)

  const onGuess = (country: Country, name?: Pick) => {
    const active = challenge.value
    if (!active || submitted.value || !started.value) return
    const pick = name ?? (country.isoCode as Pick)

    // The winning guess is never broadcast — it would hand opponents the answer.
    if (isAnswer(active)(pick)) {
      const picks = [...spent.value, pick]
      return submitRound(scoreFor(active, picks), picks)
    }

    if (active.maximumGuesses) {
      if (spent.value.includes(pick)) return
      spent.value = [...spent.value, pick]
      if (attemptsLeft.value <= 0) {
        announce({ kind: 'wrong', isoCode: country.isoCode, hint: 'Out of guesses', tone: 'alert' })
        return submitRound(0, spent.value)
      }
    }

    const left = attemptsLeft.value
    announce({
      kind: 'wrong',
      isoCode: country.isoCode,
      hint: Number.isFinite(left)
        ? `${name ?? countryName(country)} — ${left} ${left === 1 ? 'guess' : 'guesses'} left`
        : `${name ?? countryName(country)} — not it`,
      tone: 'alert',
    })
  }

  return { spent, attemptsUsed, attemptsLeft, onGuess }
}
