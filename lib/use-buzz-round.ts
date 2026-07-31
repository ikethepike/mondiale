import { buzzScore } from './scoring'
import { useGroupChallenge, type TypedRoundChallenge } from './useGroupChallenge'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * The shared body of the audio buzz rounds (Opening Ceremony, Mother Tongue).
 * Both play a clip, unlock hints as it runs, take one typed country guess and
 * pay on the clock — they differ only in prompt copy and in what counts as
 * correct, so that difference is the `isCorrect` argument and everything else
 * lives here rather than in two views.
 */

/** Where each hint lands, as the fraction of the clock ALREADY SPENT. Late
 *  enough that the ear gets first refusal, early enough to still be worth
 *  something once they arrive. */
export const HINT_UNLOCK_AT = {
  region: 0.4,
  swatches: 0.65,
  initial: 0.85,
} as const

/** A wrong buzz costs a beat — long enough to matter, short enough to re-enter
 *  the same round. Shared so the two views can't drift apart. */
export const BUZZ_LOCKOUT_MS = 3000

/** How long the answer stays on screen before the scorecard takes over. */
export const BUZZ_REVEAL_HOLD_MS = 4000

export const useBuzzRound = <T extends TypedRoundChallenge['_type']>(
  typeName: T,
  options: {
    /** Whether this guess wins the round. Anthem: one country. Tongue: any of
     *  a set — through the same predicate the server verifies with. */
    isCorrect: (challenge: Extract<TypedRoundChallenge, { _type: T }>, guess: ISOCountryCode) => boolean
    /** The pot, off the narrowed challenge. */
    maximumPoints: (challenge: Extract<TypedRoundChallenge, { _type: T }>) => number
    /** Copy for a wrong buzz; the country is already named for the guesser. */
    lockoutHint: (guessName: string) => string
    /** Runs once the round resolves, before the reveal hold. */
    onResolve?: (guess: ISOCountryCode | undefined) => void
  }
) => {
  const round = useGroupChallenge(typeName, { solo: false })
  const {
    challenge,
    showInterstitial,
    started,
    submitted,
    remainingFraction,
    elapsedFraction,
    begin: beginRound,
    announce,
    submitOnce,
    stopCountdown,
    registerCleanup,
  } = round

  const resolved = ref(false)
  const lockedOut = ref(false)
  /** Held for the reveal: what the player buzzed, and when. */
  const buzzedAt = ref<number | undefined>()

  const unlocked = computed(() => ({
    region: started.value && elapsedFraction.value >= HINT_UNLOCK_AT.region,
    swatches: started.value && elapsedFraction.value >= HINT_UNLOCK_AT.swatches,
    initial: started.value && elapsedFraction.value >= HINT_UNLOCK_AT.initial,
  }))

  let lockoutTimer: ReturnType<typeof setTimeout> | undefined
  let revealTimer: ReturnType<typeof setTimeout> | undefined
  registerCleanup(() => {
    if (lockoutTimer) clearTimeout(lockoutTimer)
    if (revealTimer) clearTimeout(revealTimer)
  })

  const resolve = (guess: ISOCountryCode | undefined, clientScore: number) => {
    if (resolved.value) return
    resolved.value = true
    stopCountdown()
    options.onResolve?.(guess)

    revealTimer = setTimeout(() => {
      submitOnce(guess ? [guess] : [], clientScore, buzzedAt.value)
    }, BUZZ_REVEAL_HOLD_MS)
  }

  /**
   * Leave the interstitial WITHOUT starting the clock. The two are one call in
   * `useGroupChallenge`, but an audio round has a beat between them: the stage
   * has to be on screen, showing its play button, while the round waits for the
   * tap that iOS requires before any sound can happen.
   */
  const revealStage = () => {
    showInterstitial.value = false
  }

  /**
   * Start the clock. Called only once the clip is genuinely playing, so nobody
   * loses buzz time to a download or to Safari withholding autoplay — on a
   * phone the round waits, silent and stopped, until the player taps Play.
   */
  const begin = (afterStart?: () => void) => {
    if (started.value) return
    beginRound({ onTimeout: () => resolve(undefined, 0) })
    afterStart?.()
  }

  const guess = (isoCode: ISOCountryCode, guessName: string): 'correct' | 'wrong' | 'ignored' => {
    const active = challenge.value
    if (!active || submitted.value || resolved.value || lockedOut.value || !started.value) {
      return 'ignored'
    }

    if (options.isCorrect(active, isoCode)) {
      buzzedAt.value = remainingFraction.value
      resolve(isoCode, buzzScore(options.maximumPoints(active), remainingFraction.value))
      return 'correct'
    }

    announce({ kind: 'locked', hint: options.lockoutHint(guessName) })
    lockedOut.value = true
    if (lockoutTimer) clearTimeout(lockoutTimer)
    lockoutTimer = setTimeout(() => (lockedOut.value = false), BUZZ_LOCKOUT_MS)
    return 'wrong'
  }

  return { ...round, resolved, lockedOut, unlocked, revealStage, begin, guess, resolve }
}
