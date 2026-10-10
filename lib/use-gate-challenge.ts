/**
 * The individual gate's shared scaffolding — `useGroupChallenge`'s sibling for
 * the solo blocking challenges.
 *
 * ViewIndividualChallenge is the shell: it owns the interstitial, the prompt,
 * the result beat and the map berth, and dispatches one `Gate*` component per
 * variant. Everything both halves need lives here, provided once by the shell
 * and injected by whichever gate is on stage. The shell is keyed on the gate's
 * subject, so a new gate is a new mount: every clock, hint and counter resets
 * by construction.
 */
import {
  computed,
  inject,
  onScopeDispose,
  provide,
  ref,
  watch,
  type ComputedRef,
  type InjectionKey,
  type Ref,
} from 'vue'
import type {
  DuelOutcome,
  IndividualChallenge,
  IndividualChallengeVariant,
  TrendDuelOutcome,
} from '~~/types/challenges/individual-challenge.type'
import type { Country, ISOCountryCode } from '~~/types/geography.types'
import { isCorrectIndividualAnswer } from './challenges'
import { getCountry } from './country'
import { createRedeliver, useClientEvents } from './events/client-side'
import { gateClockFor, gateClockFraction, gateVerdictLeadMs } from './gate-timing'
import { isBrowsableGateVariant } from './round-beats'
import { isEasyMode, isHardMode } from './game-rules'
import { seatVerdictOn } from './seat-view'
import { secondsOnDeadline } from './use-deadline-clock'
import { useServerNow } from './use-server-now'

export interface GateSubmitOptions {
  /** Skip the map reveal zoom — the duel gates paint their own board first. */
  reveal?: boolean
  /** Hints bought, each biting `GATE_HINT_BITE_STEPS` off the leap. */
  hintsUsed?: number
}

export interface GateChallengeContext {
  challenge: Ref<IndividualChallenge | undefined>
  variant: Ref<IndividualChallengeVariant>
  /** The answer's country record — undefined only before the first deal. */
  country: Ref<Country | undefined>
  /** 'correct' | 'incorrect' once answered: the server's verdict for this
   *  gate, or this seat's own preview of it until the verdict lands. */
  status: ComputedRef<'correct' | 'incorrect' | undefined>
  /** The result card is up: the verdict plus the variant's own lead (a wash
   *  painted on the question first). The shell swaps on this, not `status`. */
  verdictShown: ComputedRef<boolean>
  isHard: Ref<boolean>
  isEasy: Ref<boolean>
  submittedISOCode: ComputedRef<ISOCountryCode | undefined>
  submittedCountry: Ref<Country | undefined>
  /** The gate's subject — what every send from this mount answers. */
  subject: string
  /** Server time the gate's clock runs out, if it has one. */
  deadline: ComputedRef<number | undefined>
  showInterstitial: Ref<boolean>
  /**
   * A miss line only the variant can phrase ("Norway ranks higher"), set
   * before it submits. One seam instead of a per-variant failure ref on the
   * shell; the shell falls back to its own copy when it's unset.
   */
  missNote: Ref<string | undefined>
  /**
   * The answer was the clock's, not the player's.
   *
   * A gate must submit SOMETHING when time runs out, and what it submits is a
   * token the grader is guaranteed to reject (`wrongTokenFor` — usually CH).
   * The verdict then read that token back as "Sorry, you pressed: Switzerland",
   * blaming the player for a country they never touched.
   */
  timedOut: ComputedRef<boolean>
  /** Duel ledgers, kept because their reveals outlive the question. */
  duelOutcomes: Ref<DuelOutcome[]>
  trendDuelOutcomes: Ref<TrendDuelOutcome[]>
  /** The atlas gate's chain (seed first), kept for the same reason. */
  atlasChain: Ref<ISOCountryCode[]>
  /** The chronicle gate's submitted order (event slugs), kept for the same
   *  reason — the reveal ghosts where each card had been placed. */
  chronicleOrder: Ref<string[]>
  /** The variant's reveal is browsable (round-beats' one home decides): the
   *  result beat runs the browse cap and the view offers `finishBeat`. */
  browseReveal: Ref<boolean>
  /** When the verdict's hold ends — the server's stamp, the view's countdown. */
  holdUntil: ComputedRef<number | undefined>
  /** The browsable reveal's explicit exit: end the hold now. */
  finishBeat: () => void
  submitAnswer: (isoCode: ISOCountryCode, options?: GateSubmitOptions) => void
  /** The clock ran out — see `giveUp` below. */
  giveUp: () => void
}

const GATE_CHALLENGE: InjectionKey<GateChallengeContext> = Symbol('gate-challenge')

/**
 * A can't-match token: the ISO a gate submits when its clock runs out.
 *
 * Verified through `isCorrectIndividualAnswer` rather than merely differing
 * from `challenge.country`, because a variant can have more than one right
 * answer. Errata's hard swap accepts EITHER culprit, and its two culprits
 * border each other — so a `{CH, AT}` swap turned "dodge the answer" into
 * "submit the other one", and letting the clock expire won the gate at the
 * full pot.
 *
 * Three candidates is always enough to find a loser: they spend three
 * different currencies (so the shared-currency carve-out can clear at most
 * one), errata deals at most two culprits, and scriptorium's set answers are
 * non-Latin-script languages — none of which is official in any of the three.
 */
const GIVE_UP_TOKENS = ['CH', 'AT', 'NZ'] as const

export const wrongTokenFor = (
  challenge: Pick<IndividualChallenge, 'id' | 'country' | 'variant' | 'errata' | 'scriptorium'>
): ISOCountryCode => GIVE_UP_TOKENS.find(token => !isCorrectIndividualAnswer(challenge, token))!

/** Created ONCE per gate, by ViewIndividualChallenge. */
export const provideGateChallenge = (): GateChallengeContext => {
  const { currentMove, update, gameStore, seatCursor, seatEcho, previewVerdict } = useClientEvents()

  // The shell is keyed on the gate's subject: the gate on stage is the head
  // move at mount, and it stays the head through its verdict — the server
  // only shifts it once the hold ends.
  const subject = seatCursor.value?.subject ?? ''
  const head = currentMove.value?.challenge
  const challenge = ref(head?._type === 'individual-challenge' ? head : undefined)
  const variant = computed<IndividualChallengeVariant>(() => challenge.value?.variant ?? 'find')
  const country = computed(() =>
    challenge.value ? getCountry(challenge.value.country) : undefined
  )

  /** The server's verdict on THIS gate, once it lands. */
  const verdict = computed(() => seatVerdictOn(seatCursor.value, 'gate', subject))
  const status = computed<'correct' | 'incorrect' | undefined>(() => {
    if (verdict.value) return verdict.value.correct ? 'correct' : 'incorrect'
    return gameStore.previewStatus
  })
  const answeredISOCode = ref<ISOCountryCode>()
  const submittedISOCode = computed(() => verdict.value?.submitted ?? answeredISOCode.value)
  const submittedCountry = computed(() =>
    submittedISOCode.value ? getCountry(submittedISOCode.value) : undefined
  )
  const { now } = useServerNow()
  /** When this gate was first graded, in server time — the verdict lead
   *  counts from here: this tab's own answer, or the server's verdict step. */
  const gradedAt = ref<number>()
  watch(
    () => !!status.value,
    graded => {
      if (!graded || gradedAt.value !== undefined) return
      const cursor = seatCursor.value
      gradedAt.value =
        verdict.value && !answeredISOCode.value && cursor ? cursor.enteredAt : now.value
    },
    { immediate: true }
  )
  const verdictShown = computed(
    () =>
      !!status.value &&
      gradedAt.value !== undefined &&
      now.value >= gradedAt.value + gateVerdictLeadMs(variant.value)
  )
  const clockRanOut = ref(false)
  const timedOut = computed(() => verdict.value?.timedOut ?? clockRanOut.value)
  const deadline = computed(() =>
    seatCursor.value?.subject === subject ? seatCursor.value.deadline : undefined
  )
  const holdUntil = computed(() =>
    seatCursor.value?.subject === subject && seatCursor.value.step === 'gate-verdict'
      ? seatCursor.value.holdUntil
      : undefined
  )
  // A remount on the verdict (a refresh mid-hold) does not replay the card,
  // and the booth never plays it — every director cut would restart it.
  const showInterstitial = ref(!gameStore.watching && seatCursor.value?.step === 'gate')
  const missNote = ref<string>()
  const duelOutcomes = ref<DuelOutcome[]>([])
  const trendDuelOutcomes = ref<TrendDuelOutcome[]>([])
  const atlasChain = ref<ISOCountryCode[]>([])
  const chronicleOrder = ref<string[]>([])
  const browseReveal = computed(() => isBrowsableGateVariant(variant.value))

  // The server's verdict paints the map wash for everyone watching this seat,
  // the booth included, whether or not this tab answered.
  watch(
    verdict,
    landed => {
      if (!landed || !challenge.value) return
      previewVerdict(landed.correct ? 'correct' : 'incorrect')
      if (!gameStore.map.reveal) {
        gameStore.map.reveal =
          landed.correct && landed.submitted ? landed.submitted : challenge.value.country
      }
    },
    { immediate: true }
  )

  // A gate answer is critical: it rides `update`'s ack and the ONE redeliver
  // home until it lands. A late delivery names this gate's subject, so it can
  // only ever land on a spent gate as a no-op.
  const redeliver = createRedeliver('gate answer')
  onScopeDispose(() => redeliver.dispose())
  const deliver = (payload: Parameters<typeof update>[0]) =>
    redeliver.deliver(() => update(payload))

  /** The browsable reveal's explicit exit. The server ends the hold only for
   *  a browsable verdict on this subject, so a repeat press is harmless. */
  const finishBeat = () => {
    if (gameStore.watching || !verdict.value) return
    void deliver({ event: 'gate-reveal-done', ...seatEcho(subject) })
  }

  const submitAnswer = (isoCode: ISOCountryCode, options: GateSubmitOptions = {}) => {
    // Watch mode: the gates' own reactive clocks reach here with no user
    // input — the booth never answers a gate.
    if (gameStore.watching) return
    if (status.value) return
    const active = challenge.value
    if (!active) return

    answeredISOCode.value = isoCode
    gameStore.map.highlighted.clear()
    void deliver({
      event: 'submit-individual-challenge-answer',
      isoCode,
      hintsUsed: options.hintsUsed,
      ...seatEcho(subject),
    })

    const correct = isCorrectIndividualAnswer(active, isoCode)
    if (options.reveal !== false) {
      // A shared-currency gate can be won on a country other than the dealt
      // subject — zoom the reveal to the country the player actually got right.
      gameStore.map.reveal = correct ? isoCode : active.country
    }
    previewVerdict(correct ? 'correct' : 'incorrect')
  }

  /**
   * The clock ran out. Nothing is sent: the deadline is the server's, and its
   * gate cap delivers the timed-out verdict on its own. The view shows the
   * miss at once rather than holding a frozen zero until that verdict lands.
   */
  const giveUp = () => {
    if (gameStore.watching || status.value || !challenge.value) return
    clockRanOut.value = true
    gameStore.map.highlighted.clear()
    gameStore.map.reveal = challenge.value.country
    previewVerdict('incorrect')
  }

  const context: GateChallengeContext = {
    challenge,
    variant,
    country,
    status,
    verdictShown,
    isHard: computed(() => isHardMode(gameStore.game)),
    isEasy: computed(() => isEasyMode(gameStore.game)),
    submittedISOCode,
    submittedCountry,
    subject,
    deadline,
    showInterstitial,
    missNote,
    timedOut,
    duelOutcomes,
    trendDuelOutcomes,
    atlasChain,
    chronicleOrder,
    browseReveal,
    holdUntil,
    finishBeat,
    submitAnswer,
    giveUp,
  }

  provide(GATE_CHALLENGE, context)
  return context
}

/**
 * A timed gate's clock: the countdown and the fractions the leap is scaled by,
 * read off the deadline the server stamped when the seat landed — so the clock
 * a player sees is the one the server forfeits them on, and the leap the view
 * promises is the one the server pays.
 *
 * `useGroupChallenge` owns exactly this for the group side, and the rule is
 * explicit — never divide `secondsLeft / duration` in a view. The deadline
 * already covers the interstitial (and any variant lead), so the clock reads
 * FULL until the question is actually on screen.
 */
export interface GateClockOptions {
  /** The clock reached zero and nobody had answered. */
  onExpire: () => void
  /** Runs on each new second — the outline draw rides it. */
  onTick?: (secondsLeft: number) => void
}

export const useGateClock = (
  options: GateClockOptions
): {
  secondsLeft: ComputedRef<number>
  remainingFraction: ComputedRef<number>
  elapsedFraction: ComputedRef<number>
  /** Hold the reading it stopped on (an answer, an expiry). */
  stop: () => void
} => {
  const { variant, deadline, status } = useGateChallenge()
  const { now } = useServerNow()
  const seconds = computed(() => gateClockFor(variant.value)?.seconds ?? 0)
  const frozen = ref<{ seconds: number; fraction: number }>()

  const secondsLeft = computed(() => {
    if (frozen.value) return frozen.value.seconds
    if (deadline.value === undefined) return seconds.value
    return Math.min(seconds.value, secondsOnDeadline(deadline.value, now.value))
  })
  const remainingFraction = computed(
    () =>
      frozen.value?.fraction ??
      gateClockFraction({ variant: variant.value }, deadline.value, now.value)
  )
  const elapsedFraction = computed(() => 1 - remainingFraction.value)

  const stop = () => {
    frozen.value ??= { seconds: secondsLeft.value, fraction: remainingFraction.value }
  }

  watch(secondsLeft, (left, previous) => {
    if (frozen.value || status.value) return
    if (left !== previous) options.onTick?.(left)
    if (left <= 0 && deadline.value !== undefined) {
      stop()
      options.onExpire()
    }
  })

  return { secondsLeft, remainingFraction, elapsedFraction, stop }
}

/** Injected by every `Gate*` view. Throws rather than silently no-op'ing: a
 *  gate rendered outside the shell would look alive and answer nothing. */
export const useGateChallenge = (): GateChallengeContext => {
  const context = inject(GATE_CHALLENGE)
  if (!context) throw new Error('useGateChallenge must be used inside ViewIndividualChallenge')
  return context
}
