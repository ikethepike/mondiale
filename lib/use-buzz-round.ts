import { buzzScore } from './scoring'
import { useGroupChallenge, type TypedRoundChallenge } from './useGroupChallenge'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * The shared body of every buzz round — Silhouette, Opening Ceremony, Mother
 * Tongue. Each presents a mystery, takes one typed country guess and pays on
 * the clock, with a wrong buzz costing a lockout; they differ in prompt copy,
 * in what counts as correct (`isCorrect`) and in their reveal choreography
 * (`onResolve`), so those are arguments and everything else lives here rather
 * than in three views.
 */

/** Where each hint lands, as the fraction of the clock ALREADY SPENT. Late
 *  enough that the ear gets first refusal, early enough to still be worth
 *  something once they arrive. */
export const HINT_UNLOCK_AT = {
  region: 0.4,
  /** The lyric wall: the anthem's own words, masked where they name the
   *  country. Lands between the region and the palette — it is a big hint, but
   *  a foreign script rewards knowing something rather than guessing. */
  lyrics: 0.5,
  swatches: 0.65,
  initial: 0.85,
  /** The last stretch: the wall drops its masks on the ORIGINAL verse only.
   *  By now the clock has nearly run out, so the words that name the country
   *  are worth more as a last chance than as a secret. The English column
   *  stays masked until the round actually resolves. */
  lyricsUnmask: 0.9,
} as const

/** A wrong buzz costs a beat — long enough to matter, short enough to re-enter
 *  the same round. Shared so the two views can't drift apart. */
export const BUZZ_LOCKOUT_MS = 3000

/**
 * How long the answer stays on screen before the scorecard takes over.
 *
 * Generous because the anthem round spends the first 1.6s of it lifting masks
 * and turning the verse to English — at 4s that left barely two seconds to
 * read the translation, which is the beat the whole wall builds toward.
 */
export const BUZZ_REVEAL_HOLD_MS = 7000

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
    /** Runs when a lockout expires — the moment to hand focus back to the
     *  guess input. Owned here because the lockout timer is owned here: a
     *  view-side refocus timer re-declares the lockout length and drifts the
     *  moment it is tuned. */
    onLockoutEnd?: () => void
    /** Each second of the running clock (the silhouette's border draw). */
    onTick?: (secondsLeft: number) => void
    /** Blank the world map for the round. The audio rounds keep it (their
     *  colour field covers it); the silhouette blanks it — the outline IS the
     *  question. */
    solo?: boolean
    /** How long the answer holds before the scorecard. Defaults to the audio
     *  rounds' generous beat; the silhouette shortens it — it has no verse to
     *  translate, so four seconds of framed map is the whole reveal. */
    revealHoldMs?: number
  }
) => {
  const round = useGroupChallenge(typeName, { solo: options.solo ?? false })
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
    lyrics: started.value && elapsedFraction.value >= HINT_UNLOCK_AT.lyrics,
    swatches: started.value && elapsedFraction.value >= HINT_UNLOCK_AT.swatches,
    initial: started.value && elapsedFraction.value >= HINT_UNLOCK_AT.initial,
    lyricsUnmask: started.value && elapsedFraction.value >= HINT_UNLOCK_AT.lyricsUnmask,
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
    }, options.revealHoldMs ?? BUZZ_REVEAL_HOLD_MS)
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
    beginRound({ onTick: options.onTick, onTimeout: () => resolve(undefined, 0) })
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
    lockoutTimer = setTimeout(() => {
      lockedOut.value = false
      options.onLockoutEnd?.()
    }, BUZZ_LOCKOUT_MS)
    return 'wrong'
  }

  return { ...round, resolved, lockedOut, unlocked, revealStage, begin, guess, resolve }
}
