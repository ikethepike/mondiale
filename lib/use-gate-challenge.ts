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
import { createRedeliver, useClientEvents } from './events/client-side'
import {
  GATE_RESULT_FALLBACK_MS,
  gateResultFallbackMsFor,
  isBrowsableGateVariant,
} from './round-beats'
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
  /**
   * The answer was the clock's, not the player's.
   *
   * A gate must submit SOMETHING when time runs out, and what it submits is a
   * token the grader is guaranteed to reject (`wrongTokenFor` — usually CH).
   * The verdict then read that token back as "Sorry, you pressed: Switzerland",
   * blaming the player for a country they never touched.
   */
  timedOut: Ref<boolean>
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
  /** When the result beat's fallback ends — the view's countdown clock. */
  beatDeadline: Ref<number>
  /** The browsable reveal's explicit exit: resume the walk now. */
  finishBeat: () => void
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
 * one), errata deals at most two culprits, and scriptorium's set answers are
 * non-Latin-script languages — none of which is official in any of the three.
 */
const GIVE_UP_TOKENS = ['CH', 'AT', 'NZ'] as const

export const wrongTokenFor = (
  challenge: Pick<IndividualChallenge, 'id' | 'country' | 'variant' | 'errata' | 'scriptorium'>
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
  // A gate's durable identity is the stop tile it guards — never the
  // challenge's object reference: every full snapshot rebuilds the whole
  // blob, so reference equality reads ANY mid-gate broadcast (a rejoin's
  // resync, another seat's cap settling) as a new gate and replays the
  // interstitial over a live answer.
  let latchedTile = challenge.value ? currentMove.value?.endTile.position : undefined
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
  const timedOut = ref(false)
  const duelOutcomes = ref<DuelOutcome[]>([])
  const trendDuelOutcomes = ref<TrendDuelOutcome[]>([])
  const atlasChain = ref<ISOCountryCode[]>([])
  const chronicleOrder = ref<string[]>([])

  /**
   * A gate answer is a critical event, so it rides `update`'s ack and is resent
   * until it lands — the same contract `useGroupChallenge` keeps for its own
   * submit, and the one thing the two siblings disagreed on.
   *
   * Dropping the boolean is silent and total: the view has already painted the
   * verdict and the leap by the time delivery fails, so a socket blip leaves
   * the player looking at a win the server never heard about.
   */
  // Delivery rides the ONE redeliver home; a late delivery is harmless — the
  // handler drops a submit whose `gateTile` is no longer the head gate.
  const redeliver = createRedeliver('gate answer')
  let disposed = false
  /** The result beat's fallback end — armed by the ANSWER, see `armBeatFallback`. */
  let beatTimer: ReturnType<typeof setTimeout> | undefined
  /** When the result beat's fallback ends — the browsable reveal's countdown. */
  const beatDeadline = ref(0)
  const browseReveal = computed(() => isBrowsableGateVariant(variant.value))
  const stopBeatTimer = () => {
    if (beatTimer) clearTimeout(beatTimer)
    beatTimer = undefined
  }

  /**
   * The beat's own end, armed the moment a verdict is painted.
   *
   * A beat normally ends by the view UNMOUNTING — the server holds it for
   * `GATE_RESULT_HOLD_MS`, walks the seat on, and the phase flip tears the
   * shell down. This is the fallback for every case where that never happens,
   * and it is armed from `submitAnswer` because the alternatives all depend on
   * a LATER snapshot arriving:
   *
   *   - The answered gate was the seat's last move, so `moves` empties and
   *     `currentMove` goes undefined — `relatch` bails on `!next` and used to
   *     arm nothing, leaving only the server's continuation.
   *   - The `individual-challenge-checked`/`update` broadcast is dropped or
   *     coalesced, so `watch(currentMove, relatch)` never fires at all.
   *
   * Either way the shell held its verdict for the rest of the game. Arming at
   * the answer also means the hold is ONE beat rather than two: armed on the
   * arrival instead, it started ~`GATE_RESULT_HOLD_MS` late and parked the
   * verdict for the sum of both.
   */
  const armBeatFallback = () => {
    if (beatTimer || disposed) return
    // Variant-aware: a browsable reveal (Chronicle) runs the browse cap; the
    // countdown ref lets the view's Continue label count the backstop down.
    const fallbackMs = gateResultFallbackMsFor(variant.value)
    beatDeadline.value = Date.now() + fallbackMs
    beatTimer = setTimeout(() => {
      beatTimer = undefined
      // The server resumed the walk a wire-hop ago, so anything it was going
      // to unmount is already gone: this shell is the no-walk case.
      status.value = undefined
      relatch()
    }, fallbackMs)
  }
  const deliver = (payload: Parameters<typeof update>[0]) =>
    redeliver.deliver(() => update(payload))

  /** The browsable reveal's explicit exit: ask the server to resume the walk
   *  now. Deliberately NOT one-shot — the server is idempotent (it refuses
   *  the send unless the beat's latch and stamp are up), and a permanent
   *  latch would eat the press when it raced the answer's own delivery (a
   *  refused-but-acked send is otherwise a dead button for the whole cap).
   *  On press the long browse fallback collapses to the plain bask: in the
   *  deferred-arrival shape (a leap landed on the next gate, nothing
   *  unmounts) the shell must not park the spent reveal for the rest of the
   *  45s cap while the next gate's own clock burns. */
  const finishBeat = () => {
    if (gameStore.watching || disposed) return
    if (!status.value) return
    stopBeatTimer()
    const fallbackMs = GATE_RESULT_FALLBACK_MS
    beatDeadline.value = Date.now() + fallbackMs
    beatTimer = setTimeout(() => {
      beatTimer = undefined
      status.value = undefined
      relatch()
    }, fallbackMs)
    deliver({ event: 'gate-reveal-done' })
  }

  onScopeDispose(() => {
    disposed = true
    redeliver.dispose()
    stopBeatTimer()
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

    /**
     * The verdict is about the gate ON SCREEN — the latched challenge — never
     * the live head move.
     *
     * `currentMove` can go out from under a mounted gate: a forfeit empties
     * `moves` (the gate cap's shape, a stale answer's), and a resync can land
     * mid-question. Grading off it meant this function returned BEFORE the
     * status flip, so the clock's own expiry (`giveUp`) and every typed guess
     * became silent no-ops — the gate sat there reading 0, still accepting
     * input, with nothing left to end it but the server's 90-second cap.
     * The latched gate is also what the view is rendering, so it is the only
     * thing the painted verdict can honestly be about.
     */
    const active = challenge.value
    if (!active) return

    submittedISOCode.value = isoCode
    gameStore.map.highlighted.clear()
    void deliver({
      event: 'submit-individual-challenge-answer',
      isoCode,
      remainingFraction: options.remainingFraction,
      hintsUsed: options.hintsUsed,
      // The latched gate's tile, not the head move's: they agree in the
      // ordinary case, and where they don't the server SHOULD reject this
      // answer on the echo check rather than judge it against another gate.
      gateTile: latchedTile,
    })

    const correct = isCorrectIndividualAnswer(active, isoCode)
    if (options.reveal !== false) {
      // A shared-currency gate can be won on a country other than the dealt
      // subject — zoom the reveal to the country the player actually got right.
      gameStore.map.reveal = correct ? isoCode : active.country
    }
    gameStore.map.status = correct ? 'correct' : 'incorrect'
    // The verdict is on screen: from here the shell owns its own exit, whether
    // or not another snapshot ever reaches it.
    armBeatFallback()
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
    // The latched gate, for the same reason `submitAnswer` grades off it: a
    // clock that expires against a vanished head move used to end the beat
    // NOWHERE, which is the one thing a give-up path must never do.
    const active = challenge.value
    if (!active) return
    // Flagged BEFORE the submit: the verdict renders off the same tick, and a
    // filler token read back as a press is the bug this exists to stop.
    timedOut.value = true
    submitAnswer(wrongTokenFor(active), { remainingFraction: 0, hintsUsed })
  }

  /**
   * Back-to-back gates reach a still-mounted shell (the walk between them is
   * quick). Relatch and bump `gateSeq`; the variant component remounts and its
   * own state goes with it.
   *
   * An arrival behind a live result beat is DEFERRED, never dropped: a win's
   * leap can land the pawn AT or PAST the next gate's stop tile, and then
   * there is nothing to walk — the server settles straight back into
   * 'individual-challenge', so the phase never changes and nothing unmounts.
   * `armBeatFallback` is what ends the beat in that case.
   */
  const relatch = () => {
    const next = latched()
    // No next gate: the answered one was the seat's last move. The beat's
    // fallback is already armed (the answer arms it) and must NOT be cleared
    // here — it is the only thing left that can end this beat.
    if (!next) return
    // Same gate, fresh object identity: refresh the reference quietly (never
    // mid-beat — the beat's view holds the answered gate) and re-arm nothing.
    if (challenge.value && currentMove.value?.endTile.position === latchedTile) {
      if (!status.value) challenge.value = next
      return
    }
    // Never tear down a beat in progress — take the arrival when it is spent.
    // The answer already armed the beat's end, so this is normally a no-op;
    // it stays as the belt for a status set by any path but `submitAnswer`.
    if (status.value) {
      armBeatFallback()
      return
    }
    stopBeatTimer()

    challenge.value = next
    latchedTile = currentMove.value?.endTile.position
    clearBoard()
    submittedISOCode.value = undefined
    missNote.value = undefined
    timedOut.value = false
    duelOutcomes.value = []
    trendDuelOutcomes.value = []
    atlasChain.value = []
    chronicleOrder.value = []
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
    timedOut,
    duelOutcomes,
    trendDuelOutcomes,
    atlasChain,
    chronicleOrder,
    browseReveal,
    beatDeadline,
    finishBeat,
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
  /** Terminal: every `stop` call site is an answer or an expiry, so a clock
   *  that has stopped must never re-arm — that is what lets the start watch
   *  below keep retrying without ever running a spent gate's clock twice. */
  let spent = false
  const stop = () => {
    spent = true
    if (timer) clearInterval(timer)
    timer = undefined
  }
  const start = () => {
    if (timer || disposed || spent || status.value) return
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
    // Both signals, not just the briefing's close. `start` refuses while a
    // verdict is still sitting on the store, and a watch that only ever fired
    // on the briefing would then arm nothing at all — a timed gate with no
    // clock has no expiry, and no expiry is a gate with no exit but the
    // server's 90-second cap. The `spent` latch keeps the retry harmless.
    watch(
      [showInterstitial, status],
      ([briefing, verdict]) => {
        if (!briefing && !verdict) start()
      },
      { immediate: true }
    )
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
