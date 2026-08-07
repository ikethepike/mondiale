/**
 * The individual gate's shared scaffolding — `useGroupChallenge`'s sibling for
 * the solo blocking challenges.
 *
 * ViewIndividualChallenge is the shell: it owns the interstitial, the prompt,
 * the result beat and the map berth, and dispatches one `Gate*` component per
 * variant. Everything both halves need lives here, provided once by the shell
 * and injected by whichever gate is on stage.
 *
 * `gateSeq` is the reason this exists. Keying the variant component on it means
 * a back-to-back gate REMOUNTS its view, so every clock, hint and counter
 * resets by construction. The shell used to reset them by hand, one `if
 * (timer) clearInterval(timer)` per variant, and every new mode had to
 * remember to add its own.
 */
import {
  computed,
  inject,
  onBeforeUnmount,
  onScopeDispose,
  provide,
  ref,
  toRef,
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
import { REDELIVER_MAX_BATCHES, REDELIVER_PAUSE_MS, useClientEvents } from './events/client-side'
import { isEasyMode, isHardMode } from './game-rules'
import { clamp01 } from './number'

export interface GateSubmitOptions {
  /** Skip the map reveal zoom — the duel gates paint their own board first. */
  reveal?: boolean
  /** Timed gates: fraction of the clock left, which scales the leap. */
  remainingFraction?: number
  /** Hints bought, each biting `GATE_HINT_BITE_STEPS` off the leap. */
  hintsUsed?: number
}

export interface GateChallengeContext {
  challenge: Ref<IndividualChallenge | undefined>
  variant: Ref<IndividualChallengeVariant>
  /** The answer's country record — undefined only before the first deal. */
  country: Ref<Country | undefined>
  /** 'correct' | 'incorrect' once answered; the whole view reads this to
   *  switch from question to result. */
  status: Ref<'correct' | 'incorrect' | undefined>
  isHard: Ref<boolean>
  isEasy: Ref<boolean>
  submittedISOCode: Ref<ISOCountryCode | undefined>
  submittedCountry: Ref<Country | undefined>
  /** Bumped on every fresh gate — the variant component's `:key`. */
  gateSeq: Ref<number>
  showInterstitial: Ref<boolean>
  /**
   * A miss line only the variant can phrase ("Norway ranks higher"), set
   * before it submits. One seam instead of a per-variant failure ref on the
   * shell; the shell falls back to its own copy when it's unset.
   */
  missNote: Ref<string | undefined>
  /** Duel ledgers, kept because their reveals outlive the question. */
  duelOutcomes: Ref<DuelOutcome[]>
  trendDuelOutcomes: Ref<TrendDuelOutcome[]>
  submitAnswer: (isoCode: ISOCountryCode, options?: GateSubmitOptions) => void
  /** Hand the gate back when its clock expires — see `giveUp` below. */
  giveUp: (hintsUsed?: number) => void
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
 * one) and errata deals at most two culprits.
 */
const GIVE_UP_TOKENS = ['CH', 'AT', 'NZ'] as const

export const wrongTokenFor = (
  challenge: Pick<IndividualChallenge, 'id' | 'country' | 'variant' | 'errata'>
): ISOCountryCode => GIVE_UP_TOKENS.find(token => !isCorrectIndividualAnswer(challenge, token))!

/** Created ONCE, by ViewIndividualChallenge. `relatch` is the shell's alone —
 *  it is what advances `gateSeq`, and a gate view calling it would remount
 *  itself mid-answer. */
export const provideGateChallenge = (): GateChallengeContext & { relatch: () => void } => {
  const { currentMove, update, gameStore, clearBoard } = useClientEvents()

  const latched = (): IndividualChallenge | undefined =>
    currentMove.value?.challenge?._type === 'individual-challenge'
      ? currentMove.value.challenge
      : undefined

  const challenge = ref(latched())
  const variant = computed<IndividualChallengeVariant>(() => challenge.value?.variant ?? 'find')
  const country = computed(() =>
    challenge.value ? getCountry(challenge.value.country) : undefined
  )
  const status = toRef(gameStore.map, 'status')
  const submittedISOCode = ref<ISOCountryCode>()
  const submittedCountry = computed(() =>
    submittedISOCode.value ? getCountry(submittedISOCode.value) : undefined
  )
  const gateSeq = ref(0)
  const showInterstitial = ref(true)
  const missNote = ref<string>()
  const duelOutcomes = ref<DuelOutcome[]>([])
  const trendDuelOutcomes = ref<TrendDuelOutcome[]>([])

  /**
   * A gate answer is a critical event, so it rides `update`'s ack and is resent
   * until it lands — the same contract `useGroupChallenge` keeps for its own
   * submit, and the one thing the two siblings disagreed on.
   *
   * Dropping the boolean is silent and total: the view has already painted the
   * verdict and the leap by the time delivery fails, so a socket blip leaves
   * the player looking at a win the server never heard about.
   */
  let disposed = false
  // A SET, not one handle: back-to-back gates share this shell, so a second
  // answer can start retrying while the first is still in the air, and one
  // variable would leave the earlier chain running unreferenced. A late
  // delivery is harmless — the handler drops a submit whose `gateTile` is no
  // longer the head gate — but an uncancellable timer is not something to
  // leave behind on unmount.
  const resubmits = new Set<ReturnType<typeof setTimeout>>()
  const deliver = async (payload: Parameters<typeof update>[0], attempt = 1): Promise<void> => {
    const delivered = await update(payload).catch(() => false)
    if (delivered || disposed) return
    if (attempt >= REDELIVER_MAX_BATCHES) {
      return console.error('Giving up on gate answer delivery — a rejoin heals the seat from here')
    }
    const timer = setTimeout(() => {
      resubmits.delete(timer)
      void deliver(payload, attempt + 1)
    }, REDELIVER_PAUSE_MS)
    resubmits.add(timer)
  }
  onScopeDispose(() => {
    disposed = true
    resubmits.forEach(clearTimeout)
    resubmits.clear()
  })

  const submitAnswer = (isoCode: ISOCountryCode, options: GateSubmitOptions = {}) => {
    // Watch mode: the gates' own timers (outline countdown, zoom-out safety,
    // miss timer) reach here with NO user input, so inert can't block them and
    // the write gate only swallows the emit AFTER this body has mutated local
    // reveal state and the pawn display memory. Same guard as submitOnce in
    // useGroupChallenge — the booth never answers a gate.
    if (gameStore.watching) return
    if (status.value) return
    if (currentMove.value?.challenge?._type === 'final-challenge') return

    submittedISOCode.value = isoCode
    gameStore.map.highlighted.clear()
    void deliver({
      event: 'submit-individual-challenge-answer',
      isoCode,
      remainingFraction: options.remainingFraction,
      hintsUsed: options.hintsUsed,
      gateTile: currentMove.value?.endTile.position,
    })

    const active = currentMove.value?.challenge
    if (active?._type !== 'individual-challenge') return

    const correct = isCorrectIndividualAnswer(active, isoCode)
    if (options.reveal !== false) {
      // A shared-currency gate can be won on a country other than the dealt
      // subject — zoom the reveal to the country the player actually got right.
      gameStore.map.reveal = correct ? isoCode : active.country
    }
    gameStore.map.status = correct ? 'correct' : 'incorrect'
  }

  /**
   * The clock ran out. ONE path for it, because every timed gate needs the
   * same two things right and four of them had only the first: a token the
   * verdict rejects, and `remainingFraction: 0`.
   *
   * Omitting the clock is the quiet half. The server's own leap maths
   * (`gateLeapSteps`, called from submit-individual-challenge-answer.handler.ts)
   * reads a missing fraction as "untimed" and pays the pot WHOLE, so a give-up
   * token that ever turns out to be a right answer collects the largest leap in
   * the game — which is exactly the errata swap bug, one layer down. The token is
   * verified today, so this is the belt to that braces.
   */
  const giveUp = (hintsUsed?: number) => {
    const active = currentMove.value?.challenge
    if (active?._type !== 'individual-challenge') return
    submitAnswer(wrongTokenFor(active), { remainingFraction: 0, hintsUsed })
  }

  /**
   * Back-to-back gates reach a still-mounted shell (the walk between them is
   * quick). Relatch and bump `gateSeq`; the variant component remounts and its
   * own state goes with it.
   */
  const relatch = () => {
    const next = latched()
    if (!next || next === challenge.value) return
    // Never tear down a result beat in progress — the view unmounts after it.
    if (status.value) return

    challenge.value = next
    clearBoard()
    submittedISOCode.value = undefined
    missNote.value = undefined
    duelOutcomes.value = []
    trendDuelOutcomes.value = []
    gateSeq.value++
    showInterstitial.value = true
  }

  const context: GateChallengeContext = {
    challenge,
    variant,
    country,
    status,
    isHard: computed(() => isHardMode(gameStore.game)),
    isEasy: computed(() => isEasyMode(gameStore.game)),
    submittedISOCode,
    submittedCountry,
    gateSeq,
    showInterstitial,
    missNote,
    duelOutcomes,
    trendDuelOutcomes,
    submitAnswer,
    giveUp,
  }

  provide(GATE_CHALLENGE, context)
  return { ...context, relatch }
}

/**
 * A timed gate's clock: the countdown, the fractions the leap is scaled by, and
 * the interval that drives them.
 *
 * `useGroupChallenge` owns exactly this for the group side, and the rule is
 * explicit — never divide `secondsLeft / duration` in a view. Five gates were
 * each hand-rolling the ref, the interval, its teardown, the start-on-
 * interstitial-close watch, and the division, under three different names
 * (`elapsed`, `elapsedFraction`, and an inline `Math.max(0, secondsLeft) / X`
 * at every submit). This is that, once.
 *
 * The clock starts when the interstitial clears, not on mount: the player
 * cannot see the question until then, and a gate that counts behind its own
 * briefing is spending someone's clock for them. `manualStart` is for the one
 * gate that needs to wait longer still — the outline race holds its clock
 * until the geometry is armed, so it calls `start` itself.
 */
export interface GateClockOptions {
  /** The clock reached zero and nobody had answered. */
  onExpire: () => void
  /** Runs every tick, after `secondsLeft` drops — the outline draw rides it. */
  onTick?: (secondsLeft: number) => void
  /** Skip the interstitial watch; the caller decides when to start. */
  manualStart?: boolean
}

export const useGateClock = (
  seconds: number,
  options: GateClockOptions
): {
  secondsLeft: Ref<number>
  remainingFraction: ComputedRef<number>
  elapsedFraction: ComputedRef<number>
  start: () => void
  stop: () => void
} => {
  const { status, showInterstitial } = useGateChallenge()
  const secondsLeft = ref(seconds)
  const remainingFraction = computed(() => clamp01(secondsLeft.value / seconds))
  const elapsedFraction = computed(() => 1 - remainingFraction.value)

  let timer: ReturnType<typeof setInterval> | undefined
  let disposed = false
  const stop = () => {
    if (timer) clearInterval(timer)
    timer = undefined
  }
  const start = () => {
    if (timer || disposed || status.value) return
    timer = setInterval(() => {
      secondsLeft.value--
      options.onTick?.(secondsLeft.value)
      if (secondsLeft.value > 0) return
      stop()
      if (!status.value) options.onExpire()
    }, 1000)
  }
  onBeforeUnmount(() => {
    disposed = true
    stop()
  })

  if (!options.manualStart) {
    watch(showInterstitial, briefing => !briefing && start(), { immediate: true })
  }

  return { secondsLeft, remainingFraction, elapsedFraction, start, stop }
}

/** Injected by every `Gate*` view. Throws rather than silently no-op'ing: a
 *  gate rendered outside the shell would look alive and answer nothing. */
export const useGateChallenge = (): GateChallengeContext => {
  const context = inject(GATE_CHALLENGE)
  if (!context) throw new Error('useGateChallenge must be used inside ViewIndividualChallenge')
  return context
}
