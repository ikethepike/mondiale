import { computed, onBeforeUnmount, ref } from 'vue'
import {
  REDELIVER_MAX_BATCHES,
  REDELIVER_PAUSE_MS,
  useClientEvents,
} from '~~/lib/events/client-side'
import { guessPolicyFor } from '~~/lib/live-guess-policy'
import { DWELL } from '~~/lib/motion'
import { clamp01 } from '~~/lib/number'
import { roundBeats } from '~~/lib/round-beats'
import { secondsOnDeadline } from '~~/lib/use-deadline-clock'
import type { GuessTickerEntry } from '~~/store/game.store'
import type { RoundChallenge } from '~~/types/challenges/traversal-challenge.type'
import type { ClientEventData, GuessKind } from '~~/types/events.types'
import type { ISOCountryCode } from '~~/types/geography.types'

/** Every round challenge that carries a `_type` discriminant. The legacy
 *  ranking `GroupChallenge` has none, so `Extract` drops it automatically. */
export type TypedRoundChallenge = Extract<RoundChallenge, { _type: string }>

/** Mode-specific fields a submit may carry beyond the ranking/score/buzz trio.
 *  Derived from the wire contract, so a new field is available here the moment
 *  the event declares it — and can never drift from what the server reads. */
export type SubmitExtras = Omit<
  Extract<ClientEventData, { event: 'submit-group-challenge-answers' }>,
  'event' | 'ranking' | 'clientScore' | 'buzzAt'
>

/** Our own chips are capped separately from the store's incoming cap. */
const MAX_OWN_ENTRIES = 6
const PRUNE_INTERVAL_MS = 250

/**
 * Shared scaffolding every group-mode View repeats: narrow the round's
 * challenge to a specific `_type`, blank the board to shapes-only, run the
 * Interstitial, an optional per-round countdown that auto-submits at zero, a
 * single-shot submit guard, and cleanup on unmount. Views built on this only
 * write their prompt + interaction UI.
 *
 *   const { challenge, showInterstitial, begin, secondsLeft, submitOnce } =
 *     useGroupChallenge('two-truths-challenge')
 */
export const useGroupChallenge = <T extends TypedRoundChallenge['_type']>(
  typeName: T,
  options: { solo?: boolean } = {}
) => {
  const { gameStore, update, currentRound, clearBoard } = useClientEvents()

  type Challenge = Extract<TypedRoundChallenge, { _type: T }>
  const challenge = computed<Challenge | undefined>(() => {
    const roundChallenge = currentRound.value?.round.groupChallenge
    return roundChallenge && '_type' in roundChallenge && roundChallenge._type === typeName
      ? (roundChallenge as Challenge)
      : undefined
  })

  // Blank the world map by default — most modes ARE the whole question. In
  // the booth the reset keeps the ticker: a director cut mid-round must not
  // wipe in-flight guess chips.
  clearBoard({ preserveLiveGuesses: gameStore.watching })
  if (options.solo !== false) gameStore.map.solo = true

  // Watch mode (the booth mounting this view read-only): no interstitial —
  // every director cut would replay the 2.4s beat — and the round counts as
  // started, since the racers are already in it.
  const showInterstitial = ref(!gameStore.watching)
  const started = ref(gameStore.watching)

  // The submit latch. For a racer it's local state; in watch mode the
  // followed SEAT's banked answer joins it — snapshot truth drives the
  // reveal, while local writes (views latch `submitted.value = true` as a
  // re-entrancy guard) still stick. The OR matters: a getter that ignored
  // the local side would silently break every such guard in the booth.
  const submittedLocal = ref(false)
  const submitted = computed({
    get: () =>
      submittedLocal.value ||
      (gameStore.watching && !!currentRound.value?.round.groupAnswers[gameStore.seatId]),
    set: value => {
      submittedLocal.value = value
    },
  })

  // Optional countdown, driven by a `durationSeconds` on the challenge.
  const duration = computed(() =>
    challenge.value && 'durationSeconds' in challenge.value
      ? (challenge.value.durationSeconds as number)
      : undefined
  )
  const secondsLeft = ref(duration.value ?? 0)
  let countdown: ReturnType<typeof setInterval> | undefined
  const cleanups: (() => void)[] = []

  // Until the round starts, the clock is FULL, not expired. The challenge
  // usually arrives after this composable mounts, so without this sync the
  // idle stage read secondsLeft 0 → elapsedFraction 1 — and anything staged
  // off elapsed time (the audio field's colour drift) fired before play.
  watch(duration, value => {
    if (!started.value) secondsLeft.value = value ?? 0
  })

  /** Clock left as a 0..1 fraction — what buzz scoring and staged reveals key
   *  off. The one place the division lives; views must not re-derive it. */
  const remainingFraction = computed(() =>
    duration.value ? clamp01(secondsLeft.value / duration.value) : 0
  )
  /** 1 − remaining, for reveals that unlock as time passes. */
  const elapsedFraction = computed(() => (duration.value ? 1 - remainingFraction.value : 0))

  /** Submit exactly once; later calls (e.g. timeout after a manual answer) no-op.
   *  `extras` carries mode-specific payload the server re-checks (the named
   *  water feature, say) — a claimed `clientScore` alone never proves an answer. */
  const submitOnce = (
    ranking: ISOCountryCode[],
    clientScore?: number,
    buzzAt?: number,
    extras?: SubmitExtras
  ) => {
    // Watchers hold no answer: the gate here also keeps the redelivery loop
    // from ever arming (update() would swallow the emit and retry forever).
    if (gameStore.watching) return
    if (submitted.value) return
    submitted.value = true
    void deliverAnswer(ranking, clientScore, buzzAt, extras)
  }

  /**
   * `update` already acks-and-retries critical events, but a submit that
   * exhausts that batch (a disconnect straddling the buzzer) must not die:
   * an unbanked answer strands the seat in 'group-challenge' and one such
   * seat freezes the whole table. Keep the answer alive on a timer until the
   * server confirms — the handler's duplicate guard and stranded-submitter
   * heal make every re-send safe, and the `submitted` latch stays up so the
   * view never offers a second answer.
   */
  let disposed = false
  let resubmitTimer: ReturnType<typeof setTimeout> | undefined
  let deliveryBatches = 0
  const deliverAnswer = async (
    ranking: ISOCountryCode[],
    clientScore?: number,
    buzzAt?: number,
    extras?: SubmitExtras
  ) => {
    deliveryBatches++
    const delivered = await update({
      event: 'submit-group-challenge-answers',
      ranking,
      clientScore,
      buzzAt,
      ...extras,
    }).catch(() => false)
    if (delivered || disposed) return
    if (deliveryBatches >= REDELIVER_MAX_BATCHES) {
      return console.error('Giving up on answer delivery — a rejoin heals the seat from here')
    }
    resubmitTimer = setTimeout(
      () => deliverAnswer(ranking, clientScore, buzzAt, extras),
      REDELIVER_PAUSE_MS
    )
  }
  cleanups.push(() => {
    disposed = true
    if (resubmitTimer) clearTimeout(resubmitTimer)
  })

  /**
   * A wrong guess, a duplicate, a name that matched nothing. `hint` renders
   * over the map and clears itself; a `kind` also sends the guess to the room.
   * One call per event, so views never notify twice.
   *
   * The policy decides how much travels: `label` names the country, `presence`
   * says only that someone guessed, `none` sends nothing. The server re-derives
   * it, so this is a courtesy rather than the guard.
   */
  const hint = ref('')
  let hintTimer: ReturnType<typeof setTimeout> | undefined
  /** The player's own chips. The room broadcast echoes back but is filtered as
   *  a self-echo, so they never arrive through the store. */
  const ownGuesses = ref<GuessTickerEntry[]>([])

  const announce = ({
    hint: text,
    kind,
    isoCode,
    label,
  }: {
    hint?: string
    kind?: GuessKind
    isoCode?: ISOCountryCode
    label?: string
  }) => {
    // A watcher fabricates no guess chips and sends nothing to the room
    if (gameStore.watching) return
    if (text !== undefined) {
      hint.value = text
      if (hintTimer) clearTimeout(hintTimer)
      hintTimer = setTimeout(() => (hint.value = ''), DWELL.hint)
    }

    if (!kind) return
    const policy = guessPolicyFor(gameStore.game, currentRound.value?.round.groupChallenge)
    if (policy === 'none') return
    const named = policy === 'label' ? { isoCode, label } : {}

    ownGuesses.value = [
      ...ownGuesses.value.slice(-(MAX_OWN_ENTRIES - 1)),
      {
        entryId: crypto.randomUUID(),
        playerId: gameStore.playerId,
        kind,
        ...named,
        at: Date.now(),
      },
    ]
    // A probe carries its country to the server even under presence: the server
    // measures the distance to the hidden target and broadcasts that alone,
    // never echoing the isoCode. The room sees a radius, not a bearing.
    const wire = policy !== 'label' && kind === 'probe' ? { isoCode } : named
    update({ event: 'player-guessing', kind, ...wire })
  }

  /** Opponents' chips plus our own, oldest first, each expiring on its own. */
  const entries = computed(() =>
    [...gameStore.map.liveGuesses, ...ownGuesses.value].sort((a, b) => a.at - b.at)
  )

  // One pruner for both lists — entries carry their own timestamp, so expiry is
  // a filter rather than a timer per chip. Dwell is per kind: a taunt is a
  // sentence and outstays a verdict chip.
  const dwellFor = (entry: GuessTickerEntry) => (entry.kind === 'taunt' ? DWELL.taunt : DWELL.hint)
  const expired = (entry: GuessTickerEntry, now: number) => entry.at + dwellFor(entry) <= now
  const pruner = setInterval(() => {
    const now = Date.now()
    if (ownGuesses.value.some(entry => expired(entry, now))) {
      ownGuesses.value = ownGuesses.value.filter(entry => !expired(entry, now))
    }
    if (gameStore.map.liveGuesses.some(entry => expired(entry, now))) {
      gameStore.map.liveGuesses = gameStore.map.liveGuesses.filter(entry => !expired(entry, now))
    }
  }, PRUNE_INTERVAL_MS)

  cleanups.push(() => hintTimer && clearTimeout(hintTimer))
  cleanups.push(() => clearInterval(pruner))

  /**
   * Leave the interstitial and start the round. `onTimeout` (if a countdown
   * exists) fires once when the clock hits zero — typically a fail-submit.
   * `onTick` runs on each new second for mode-specific reveals.
   *
   * The clock's truth is the server-stamped `round.deadline` when one rides
   * the snapshot: every repaint re-derives from the wall clock, so a
   * backgrounded tab whose intervals were throttled snaps to the true time
   * the moment it wakes — the round can no longer silently outlive its
   * window in browser memory. Rounds without a stamp (older snapshots,
   * booth ambience) keep the local decrement as a fallback.
   */
  const begin = (
    hooks: { onTimeout?: () => void; onTick?: (secondsLeft: number) => void } = {}
  ) => {
    showInterstitial.value = false
    started.value = true
    if (!duration.value) return
    // Re-entrant callers (the watch-mode round-boundary restart) must
    // replace the clock, never stack a second interval beside it
    if (countdown) clearInterval(countdown)
    const total = duration.value
    // The stamped deadline drives the clock ONLY when it measures this very
    // countdown — a kind with a derived multi-beat budget (empire) stamps
    // the WHOLE round's window, and pinning beat 1's clock to it would
    // freeze the display at full for the later beats' share. Those kinds
    // keep the local decrement; the server settle still backstops them.
    const deadline =
      roundBeats(challenge.value).playSeconds === undefined
        ? currentRound.value?.round.deadline
        : undefined
    if (deadline) {
      secondsLeft.value = Math.min(total, secondsOnDeadline(deadline))
      // Already expired at begin() (a rejoin landing after the window): the
      // dedupe guard below would swallow every tick, so fire the timeout now.
      if (secondsLeft.value <= 0) return hooks.onTimeout?.()
    } else {
      secondsLeft.value = total
    }
    countdown = setInterval(() => {
      // Deadline-driven: re-derive from the wall clock every tick, so a
      // throttled tab snaps to true time the moment it wakes. (The stamp
      // includes the opening grace, so the clock holds FULL while it burns.)
      const next = deadline ? Math.min(total, secondsOnDeadline(deadline)) : secondsLeft.value - 1
      if (next === secondsLeft.value) return
      secondsLeft.value = next
      hooks.onTick?.(next)
      if (next <= 0) {
        if (countdown) clearInterval(countdown)
        countdown = undefined
        hooks.onTimeout?.()
      }
    }, 1000)
  }

  /**
   * Stop the clock early. Buzz-in modes (silhouette, stat-detective) resolve
   * before zero and must not keep ticking through their reveal hold — the
   * countdown drives on-screen reveals, not just the timeout.
   */
  const stopCountdown = () => {
    if (countdown) clearInterval(countdown)
    countdown = undefined
  }

  /** Register a view-specific teardown (extra timers, listeners). */
  const registerCleanup = (fn: () => void) => cleanups.push(fn)

  // Watch mode: run the round clock as AMBIENCE on the spectator's own time —
  // hint unlocks and staged reveals key off elapsedFraction and would stay
  // frozen otherwise. Keyed on the ROUND NUMBER, not the duration: two
  // same-kind rounds in a row swap the challenge under a live component (the
  // mount is keyed on subject and kind) with an identical duration value, and
  // the clock must still restart. No hooks: the resolve truth arrives from
  // the snapshot (use-buzz-round's watch path), never a local timeout.
  if (gameStore.watching) {
    watch(
      () => (duration.value ? currentRound.value?.number : undefined),
      roundNumber => {
        if (roundNumber !== undefined) begin()
      },
      { immediate: true }
    )
  }

  onBeforeUnmount(() => {
    clearBoard({ preserveLiveGuesses: gameStore.watching })
    if (countdown) clearInterval(countdown)
    for (const fn of cleanups) fn()
  })

  return {
    challenge,
    currentRound,
    showInterstitial,
    started,
    submitted,
    secondsLeft,
    remainingFraction,
    elapsedFraction,
    begin,
    hint,
    announce,
    entries,
    submitOnce,
    stopCountdown,
    registerCleanup,
    gameStore,
    update,
    clearBoard,
  }
}
