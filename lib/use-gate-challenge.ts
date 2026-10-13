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
import type { AtlasSpellings } from './atlas-chain'
import { isCorrectIndividualAnswer } from './challenges'
import { getCountry } from './country'
import { createRedeliver, useClientEvents } from './events/client-side'
import {
  gateClockFor,
  gateClockFraction,
  gateInterstitialEndsAt,
  gateVerdictLeadMs,
} from './gate-timing'
import { isBrowsableGateVariant } from './round-beats'
import { isEasyMode, isHardMode } from './game-rules'
import { seatVerdictOn } from './seat-view'
import { secondsOnDeadline } from './use-deadline-clock'
import type { GATE_HINTS, GateHint } from './hints'
import { useSeatRecord } from './use-seat-record'
import { useSeatClockStart } from './use-seat-clock'
import { useServerNow } from './use-server-now'
import { gateAnswerOnHand } from './wire-view'

/** Gates whose own reveal is the answer: the duels paint their board, atlas
 *  draws its chain, chronicle sets its record — the map's country card would
 *  land on top of it. Read by the submit AND the verdict, which every watcher
 *  of the seat receives, so neither path can bring the card back. */
const OWN_REVEAL_VARIANTS = new Set<IndividualChallengeVariant>([
  'higher-lower',
  'trend-duel',
  'atlas',
  'chronicle',
])

export interface GateChallengeContext {
  challenge: Ref<IndividualChallenge | undefined>
  variant: Ref<IndividualChallengeVariant>
  /** The answer's country record — undefined before the first deal, and
   *  while the wire withholds the answer (`gateAnswerOnHand`). */
  country: Ref<Country | undefined>
  /** 'correct' | 'incorrect' once answered: the server's verdict for this
   *  gate, or this seat's own preview of it until the verdict lands. */
  status: ComputedRef<'correct' | 'incorrect' | undefined>
  /** The result card is up: the verdict plus the variant's own lead (a wash
   *  painted on the question first), once the answer it shows is on hand. The
   *  shell swaps on this, not `status`. */
  verdictShown: ComputedRef<boolean>
  isHard: Ref<boolean>
  isEasy: Ref<boolean>
  submittedISOCode: ComputedRef<ISOCountryCode | undefined>
  submittedCountry: Ref<Country | undefined>
  subject: string
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
  /** Names in that chain played under another spelling. */
  atlasSpellings: Ref<AtlasSpellings>
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
  /** `steps` answers a step-graded gate (`isStepGraded`): the server grades
   *  them, and `isoCode` is the country its verdict names. */
  submitAnswer: (isoCode: ISOCountryCode, steps?: string[]) => void
  /** Record a bought hint with the server — what the leap is docked by. */
  recordHint: (hint: GateHint<keyof typeof GATE_HINTS>) => void
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
  const clockRanOut = ref(false)
  const timedOut = computed(() => verdict.value?.timedOut ?? clockRanOut.value)
  const verdictLeadMs = computed(() => (timedOut.value ? 0 : gateVerdictLeadMs(challenge.value)))
  const verdictShown = computed(
    () =>
      !!status.value &&
      !!challenge.value &&
      gateAnswerOnHand(challenge.value) &&
      gradedAt.value !== undefined &&
      now.value >= gradedAt.value + verdictLeadMs.value
  )
  const deadline = computed(() =>
    seatCursor.value?.subject === subject ? seatCursor.value.deadline : undefined
  )
  const holdUntil = computed(() =>
    seatCursor.value?.subject === subject && seatCursor.value.step === 'gate-verdict'
      ? seatCursor.value.holdUntil
      : undefined
  )
  // A remount on the verdict or after the clock started (a refresh) does not
  // replay the card, and the booth never plays it — every director cut would
  // restart it.
  const mountedOn = seatCursor.value
  const showInterstitial = ref(
    !gameStore.watching &&
      mountedOn?.step === 'gate' &&
      !!challenge.value &&
      now.value < gateInterstitialEndsAt(challenge.value, mountedOn)
  )
  const startSeatClock = useSeatClockStart()
  const { buyHint: buyHintOn } = useSeatRecord()
  watch(showInterstitial, shown => {
    if (!shown && gateClockFor(variant.value)) startSeatClock(subject)
  })
  const missNote = ref<string>()
  const duelOutcomes = ref<DuelOutcome[]>([])
  const trendDuelOutcomes = ref<TrendDuelOutcome[]>([])
  const atlasChain = ref<ISOCountryCode[]>([])
  const atlasSpellings = ref<AtlasSpellings>({})
  const chronicleOrder = ref<string[]>([])
  const browseReveal = computed(() => isBrowsableGateVariant(variant.value))

  // The server's verdict paints the map wash for everyone watching this seat,
  // the booth included, whether or not this tab answered. Its snapshot is the
  // first to carry a withheld answer, so the gate on stage takes it up here.
  watch(
    verdict,
    landed => {
      if (!landed || !challenge.value) return
      const head = currentMove.value?.challenge
      if (!gateAnswerOnHand(challenge.value) && head?._type === 'individual-challenge') {
        challenge.value = head
      }
      previewVerdict(landed.correct ? 'correct' : 'incorrect', subject)
      if (!gameStore.map.reveal && !OWN_REVEAL_VARIANTS.has(variant.value)) {
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

  const submitAnswer = (isoCode: ISOCountryCode, steps?: string[]) => {
    // Watch mode: the gates' own reactive clocks reach here with no user
    // input — the booth never answers a gate.
    if (gameStore.watching) return
    if (status.value || answeredISOCode.value) return
    const active = challenge.value
    if (!active) return

    answeredISOCode.value = isoCode
    gameStore.map.highlighted.clear()
    void deliver({
      event: 'submit-individual-challenge-answer',
      isoCode,
      ...(steps ? { steps } : {}),
      ...seatEcho(subject),
    })

    if (!gateAnswerOnHand(active)) return
    const correct = isCorrectIndividualAnswer(active, isoCode)
    if (!OWN_REVEAL_VARIANTS.has(variant.value)) {
      // A shared-currency gate can be won on a country other than the dealt
      // subject — zoom the reveal to the country the player actually got right.
      gameStore.map.reveal = correct ? isoCode : active.country
    }
    previewVerdict(correct ? 'correct' : 'incorrect', subject)
  }

  /**
   * The clock ran out. The deadline is the server's, and its gate cap delivers
   * the timed-out verdict on its own; the view shows the miss at once rather
   * than holding a frozen zero until then. A gate whose answer is withheld has
   * no answer to show yet, so it forfeits now and the verdict brings one.
   */
  const giveUp = () => {
    if (gameStore.watching || status.value || answeredISOCode.value || !challenge.value) return
    clockRanOut.value = true
    gameStore.map.highlighted.clear()
    previewVerdict('incorrect', subject)
    if (gateAnswerOnHand(challenge.value)) {
      gameStore.map.reveal = challenge.value.country
      return
    }
    void deliver({
      event: 'submit-individual-challenge-answer',
      timedOut: true,
      ...seatEcho(subject),
    })
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
    atlasSpellings,
    chronicleOrder,
    browseReveal,
    holdUntil,
    finishBeat,
    submitAnswer,
    recordHint: hint => {
      if (!status.value) buyHintOn(subject, hint)
    },
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
  /** The clock reached zero and nobody had answered, or the server's timeout
   *  verdict landed first — whichever comes first, once. */
  onExpire: () => void
  onTick?: (secondsLeft: number) => void
}

export const useGateClock = (
  options: GateClockOptions
): {
  secondsLeft: ComputedRef<number>
  remainingFraction: ComputedRef<number>
  elapsedFraction: ComputedRef<number>
  stop: () => void
} => {
  const { variant, deadline, status, timedOut } = useGateChallenge()
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
    if (frozen.value || status.value || left === previous) return
    options.onTick?.(left)
  })

  let expired = false
  watch(
    () =>
      timedOut.value ||
      (!frozen.value && !status.value && deadline.value !== undefined && secondsLeft.value <= 0),
    due => {
      if (!due || expired) return
      expired = true
      stop()
      options.onExpire()
    },
    { immediate: true }
  )

  return { secondsLeft, remainingFraction, elapsedFraction, stop }
}

/** Injected by every `Gate*` view. Throws rather than silently no-op'ing: a
 *  gate rendered outside the shell would look alive and answer nothing. */
export const useGateChallenge = (): GateChallengeContext => {
  const context = inject(GATE_CHALLENGE)
  if (!context) throw new Error('useGateChallenge must be used inside ViewIndividualChallenge')
  return context
}
