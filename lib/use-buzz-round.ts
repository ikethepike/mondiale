import { buzzScore } from './scoring'
import { roundSettled } from './spectate'
import { useLockoutBeat } from './use-lockout-beat'
import { useGroupChallenge, type TypedRoundChallenge } from './useGroupChallenge'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * The shared body of every buzz round — Silhouette, Opening Ceremony,
 * Tongues. Each presents a mystery, takes one typed country guess and pays on
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

export const useBuzzRound = <T extends TypedRoundChallenge['_type']>(
  typeName: T,
  options: {
    /** Whether this guess wins the round. Anthem: one country. Tongues: any of
     *  a set — through the same predicate the server verifies with. */
    isCorrect: (
      challenge: Extract<TypedRoundChallenge, { _type: T }>,
      guess: ISOCountryCode
    ) => boolean
    /** The pot, off the narrowed challenge. */
    maximumPoints: (challenge: Extract<TypedRoundChallenge, { _type: T }>) => number
    /** Copy for a wrong buzz; the country is already named for the guesser. */
    lockoutHint: (guessName: string) => string
    /**
     * Pre-buzz veto: return a hint to refuse the guess WITHOUT a lockout.
     *
     * For a buzz that is right about the world and wrong only about this round
     * — a country off the board whose answer set was scoped to it. A lockout
     * costs 15% of a 20-second clock and broadcasts a named miss to the room,
     * so charging one for a correct answer is the harshest version of the
     * mistake `reject` exists to prevent.
     */
    reject?: (
      challenge: Extract<TypedRoundChallenge, { _type: T }>,
      guess: ISOCountryCode
    ) => string | undefined
    /** Runs once the round resolves, before the reveal hold. */
    onResolve?: (guess: ISOCountryCode | undefined) => void
    /** Runs when a lockout expires, after the DOM patch that re-enables the
     *  console — the moment to hand focus back to the guess input (bare
     *  `focus()`, no nextTick needed). The timer itself is `useLockoutBeat`. */
    onLockoutEnd?: () => void
    /** Each second of the running clock (the silhouette's border draw). */
    onTick?: (secondsLeft: number) => void
    /** Blank the world map for the round. The audio rounds keep it (their
     *  colour field covers it); the silhouette blanks it — the outline IS the
     *  question. */
    solo?: boolean
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
  } = round

  const resolved = ref(false)
  const { lockedOut, lockOut } = useLockoutBeat({ onEnd: options.onLockoutEnd })
  /** Held for the reveal: what the player buzzed, and when. */
  const buzzedAt = ref<number | undefined>()

  const unlocked = computed(() => ({
    region: started.value && elapsedFraction.value >= HINT_UNLOCK_AT.region,
    lyrics: started.value && elapsedFraction.value >= HINT_UNLOCK_AT.lyrics,
    swatches: started.value && elapsedFraction.value >= HINT_UNLOCK_AT.swatches,
    initial: started.value && elapsedFraction.value >= HINT_UNLOCK_AT.initial,
    lyricsUnmask: started.value && elapsedFraction.value >= HINT_UNLOCK_AT.lyricsUnmask,
  }))

  const resolve = (guess: ISOCountryCode | undefined, clientScore: number) => {
    if (resolved.value) return
    resolved.value = true
    stopCountdown()
    options.onResolve?.(guess)

    // Submit at the resolve — the reveal (mask lifts, the translated verse)
    // is pure display, and the server's flip (the kind's reveal hold in
    // ROUND_BEATS) ends the beat.
    submitOnce(guess ? [guess] : [], clientScore, buzzedAt.value)
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

  // Watch mode: the followed seat's banked answer IS the resolve — their
  // buzz reaches the snapshot after their own reveal hold, and the booth
  // plays the same reveal choreography off it. Hide-spoilers defers the
  // moment until the whole table is out of the answering window: the reveal
  // paints the shared map, which sits outside the mount's veil.
  const round2 = round.gameStore
  if (round2.watching) {
    const revealableAnswer = computed(() => {
      const liveRound = round.currentRound.value?.round
      const answer = liveRound?.groupAnswers[round2.seatId]
      if (!answer) return undefined
      if (!round2.spectateHideSpoilers) return answer
      const players = Object.values(round2.game?.players ?? {})
      return roundSettled(players, liveRound?.groupAnswers ?? {}) ? answer : undefined
    })
    watch(
      revealableAnswer,
      answer => {
        if (!answer || resolved.value) return
        resolved.value = true
        stopCountdown()
        options.onResolve?.(answer.submitted[0])
      },
      { immediate: true }
    )
  }

  const guess = (isoCode: ISOCountryCode, guessName: string): 'correct' | 'wrong' | 'ignored' => {
    const active = challenge.value
    if (!active || submitted.value || resolved.value || lockedOut.value || !started.value) {
      return 'ignored'
    }

    // Before the verdict: a guess the round refuses to judge at all. It spends
    // no lockout and tells the room nothing — the buzzer keeps their clock.
    const veto = options.reject?.(active, isoCode)
    if (veto) {
      announce({ hint: veto })
      return 'ignored'
    }

    if (options.isCorrect(active, isoCode)) {
      buzzedAt.value = remainingFraction.value
      resolve(isoCode, buzzScore(options.maximumPoints(active), remainingFraction.value))
      return 'correct'
    }

    // The wrong guess travels WITH its name; the policy home decides who sees
    // it. Tongues is `label` — dozens of countries share the language, so a
    // named miss is colour, and seeing "Poland ✗" is what teaches the room the
    // multi-answer rule. Anthem and silhouette are `presence` — one shared
    // hidden answer, so the name is stripped before the wire. A CORRECT buzz
    // announces nothing: naming it would hand the answer to everyone still
    // racing the clock.
    announce({
      kind: 'locked',
      hint: options.lockoutHint(guessName),
      isoCode,
      label: guessName,
      tone: 'alert',
    })
    lockOut()
    return 'wrong'
  }

  return { ...round, resolved, lockedOut, unlocked, revealStage, begin, guess, resolve }
}
