import { computed, onBeforeUnmount, ref } from 'vue'
import { createRedeliver, useClientEvents } from '~~/lib/events/client-side'
import { guessPolicyFor, probeCarriesIso } from '~~/lib/live-guess-policy'
import { DWELL } from '~~/lib/motion'
import type { LatLng } from '~~/lib/geo'
import { clamp01 } from '~~/lib/number'
import { playGateMsFor } from '~~/lib/round-beats'
import { secondsOnDeadline } from '~~/lib/use-deadline-clock'
import { useServerNow } from '~~/lib/use-server-now'
import type { GuessTickerEntry } from '~~/store/game.store'
import type { RoundChallenge } from '~~/types/challenges/traversal-challenge.type'
import type { ClientEventData, GuessKind, HintTone, SeatEcho } from '~~/types/events.types'
import type { ISOCountryCode } from '~~/types/geography.types'

/** Every round challenge that carries a `_type` discriminant. The legacy
 *  ranking `GroupChallenge` has none, so `Extract` drops it automatically. */
export type TypedRoundChallenge = Extract<RoundChallenge, { _type: string }>

/** Mode-specific fields a submit may carry beyond the ranking/score/buzz trio.
 *  Derived from the wire contract, so a new field is available here the moment
 *  the event declares it — and can never drift from what the server reads. */
export type SubmitExtras = Omit<
  Extract<ClientEventData, { event: 'submit-group-challenge-answers' }>,
  'event' | 'ranking' | 'clientScore' | 'buzzAt' | keyof SeatEcho
>

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
  const { gameStore, update, currentRound, clearBoard, seatCursor, seatEcho, previewVerdict } =
    useClientEvents()
  const { now } = useServerNow()
  // Captured once: the view is keyed on the round's subject, so this is the
  // question every send from this mount answers.
  const subject = seatCursor.value?.subject ?? ''

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

  // A remount on its verdict (a refresh mid-reveal-hold) is NOT a fresh
  // round: the seat answered and the hold is running, and replaying the
  // interstitial + an empty console would offer a question already spent.
  const answeredOnMount = seatCursor.value?.step === 'round-verdict'

  // Watch mode (the booth mounting this view read-only): no interstitial —
  // every director cut would replay the 2.4s beat — and the round counts as
  // started, since the racers are already in it. Same for a banked remount.
  const showInterstitial = ref(!gameStore.watching && !answeredOnMount)
  const started = ref(gameStore.watching || answeredOnMount)

  // The submit latch. Local state ORed with the seat's own cursor: once the
  // seat is past its question (on its verdict), a remount reads that, never
  // browser memory. The OR matters: a getter that ignored the local side would
  // silently break every re-entrancy guard.
  const submittedLocal = ref(false)
  const submitted = computed({
    get: () => submittedLocal.value || seatCursor.value?.step === 'round-verdict',
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
  const cleanups: (() => void)[] = []
  /** Views await data chunks before calling `begin`; one that unmounted
   *  meanwhile must not start anything. */
  let disposed = false

  /**
   * When this seat's countdown reaches zero, in server time: the round's own
   * play start plus the kind's duration, or — for a kind whose window opens
   * on the player's own play tap — the deadline the server stamped on the
   * seat when that tap landed. Undefined until a stamp exists; the clock
   * then reads FULL.
   */
  const clockEndsAt = computed(() => {
    const round = currentRound.value?.round
    if (!duration.value || !round) return undefined
    if (playGateMsFor(challenge.value)) return seatCursor.value?.deadline
    return round.playStartsAt ? round.playStartsAt + duration.value * 1000 : undefined
  })
  /** A stopped clock holds the reading it stopped on. */
  const frozenSeconds = ref<number>()
  const secondsLeft = computed(() => {
    if (frozenSeconds.value !== undefined) return frozenSeconds.value
    if (!duration.value) return 0
    if (clockEndsAt.value === undefined) return duration.value
    return Math.min(duration.value, secondsOnDeadline(clockEndsAt.value, now.value))
  })

  /** Clock left as a 0..1 fraction — what buzz scoring and staged reveals key
   *  off. The one place the division lives; views must not re-derive it. */
  const remainingFraction = computed(() => {
    if (!duration.value) return 0
    if (frozenSeconds.value !== undefined || clockEndsAt.value === undefined) {
      return clamp01(secondsLeft.value / duration.value)
    }
    return clamp01((clockEndsAt.value - now.value) / (duration.value * 1000))
  })
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
   * a lost answer leaves the seat to the round's settle as a zero. Keep the
   * answer alive on a timer until the server confirms — the subject echo
   * makes every re-send safe (a duplicate on the same subject is a no-op, a
   * spent subject a resync), and the `submitted` latch stays up so the view
   * never offers a second answer.
   */
  const redeliver = createRedeliver('group answer')
  const deliverAnswer = (
    ranking: ISOCountryCode[],
    clientScore?: number,
    buzzAt?: number,
    extras?: SubmitExtras
  ) => {
    // The echo names the subject this mount rendered: a buffered redelivery
    // flushing after the settle advanced the table lands on a spent subject.
    const echo = seatEcho(subject)
    return redeliver.deliver(() =>
      update({
        event: 'submit-group-challenge-answers',
        ranking,
        clientScore,
        buzzAt,
        ...extras,
        ...echo,
      })
    )
  }
  cleanups.push(() => redeliver.dispose())

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
  /**
   * How the hint READS, which is not what it says.
   *
   * Most hints are not failures: a name the typeahead couldn't resolve, a
   * duplicate, a country outside the round's scope. Alert red is for a genuine
   * miss — a guess that was wrong and cost something. It cannot be derived from
   * `kind`, because every neutral bounce passes no kind at all, so callers that
   * mean "you got this wrong" say so.
   */
  const hintTone = ref<HintTone>('neutral')
  let hintTimer: ReturnType<typeof setTimeout> | undefined

  const announce = ({
    hint: text,
    tone,
    kind,
    isoCode,
    latLng,
    label,
    placed,
  }: {
    hint?: string
    /** How the hint reads. Defaults to `neutral`: a hint is only a miss when
     *  its caller says so, because most of them aren't. */
    tone?: HintTone
    kind?: GuessKind
    isoCode?: ISOCountryCode
    latLng?: LatLng
    label?: string
    /** A progress count that survives `presence` — see the field on the wire
     *  event. Modes that name nothing can still show the room a race. */
    placed?: { seated: number; total: number }
  }) => {
    // A watcher fabricates no guess chips and sends nothing to the room
    if (gameStore.watching) return
    if (text !== undefined) {
      hint.value = text
      hintTone.value = tone ?? 'neutral'
      if (hintTimer) clearTimeout(hintTimer)
      hintTimer = setTimeout(() => (hint.value = ''), DWELL.hint)
    }

    if (!kind) return
    const roundChallenge = currentRound.value?.round.groupChallenge
    const policy = guessPolicyFor(gameStore.game, roundChallenge)
    if (policy === 'none') return
    const named = policy === 'label' ? { isoCode, label } : {}

    // A hot-cold probe carries its country to the server even under presence:
    // the server measures the distance to the hidden target and broadcasts
    // that alone, never echoing the isoCode. The room sees a radius, not a
    // bearing. Which kinds may ride is `probeCarriesIso` — the same rule the
    // server computes with, so the two ends cannot drift.
    const wire =
      policy !== 'label' && kind === 'probe' && probeCarriesIso(roundChallenge)
        ? { isoCode, ...(latLng ? { latLng } : {}) }
        : named
    update({ event: 'player-guessing', kind, ...wire, ...(placed ? { placed } : {}) })
  }

  /** Opponents' chips, oldest first — the ticker never mirrors the player's
   *  own moves; the view's own feedback surfaces carry those. */
  const entries = computed(() => gameStore.map.liveGuesses)

  // Entries carry their own timestamp, so expiry is a filter rather than a
  // timer per chip. Dwell is per kind: a taunt is a sentence and outstays a
  // verdict chip.
  const dwellFor = (entry: GuessTickerEntry) => (entry.kind === 'taunt' ? DWELL.taunt : DWELL.hint)
  const expired = (entry: GuessTickerEntry, now: number) => entry.at + dwellFor(entry) <= now
  const pruner = setInterval(() => {
    const at = Date.now()
    if (gameStore.map.liveGuesses.some(entry => expired(entry, at))) {
      gameStore.map.liveGuesses = gameStore.map.liveGuesses.filter(entry => !expired(entry, at))
    }
  }, PRUNE_INTERVAL_MS)

  cleanups.push(() => hintTimer && clearTimeout(hintTimer))
  cleanups.push(() => clearInterval(pruner))

  /**
   * Leave the interstitial and start the round. The clock itself is the
   * server's — it runs whether or not anyone called this; `begin` only lifts
   * the card and attaches the view's hooks. `onTimeout` fires once when the
   * clock reaches zero (typically a fail-submit; the server's settle is the
   * backstop either way). `onTick` runs on each new second for mode-specific
   * reveals.
   */
  let hooks: { onTimeout?: () => void; onTick?: (secondsLeft: number) => void } = {}
  let begun = false
  let timedOut = false
  const begin = (next: typeof hooks = {}) => {
    if (disposed) return
    showInterstitial.value = false
    started.value = true
    hooks = next
    begun = true
    if (duration.value && clockEndsAt.value !== undefined && secondsLeft.value <= 0) fireTimeout()
  }
  const fireTimeout = () => {
    if (timedOut || frozenSeconds.value !== undefined) return
    timedOut = true
    hooks.onTimeout?.()
  }
  watch(secondsLeft, (left, previous) => {
    if (!begun || frozenSeconds.value !== undefined || !duration.value) return
    if (left !== previous) hooks.onTick?.(left)
    if (left <= 0 && clockEndsAt.value !== undefined) fireTimeout()
  })

  /**
   * Stop the clock early. Buzz-in modes (silhouette, stat-detective) resolve
   * before zero and must not keep counting through their reveal hold — the
   * countdown drives on-screen reveals, not just the timeout.
   */
  const stopCountdown = () => {
    frozenSeconds.value = secondsLeft.value
  }

  /** Register a view-specific teardown (extra timers, listeners). */
  const registerCleanup = (fn: () => void) => cleanups.push(fn)

  /** A view timeout that dies with the view; arming it again replaces the
   *  pending one. */
  const createViewTimer = () => {
    let handle: ReturnType<typeof setTimeout> | undefined
    registerCleanup(() => clearTimeout(handle))
    return (fn: () => void, ms: number) => {
      clearTimeout(handle)
      handle = setTimeout(fn, ms)
    }
  }

  onBeforeUnmount(() => {
    disposed = true
    clearBoard({ preserveLiveGuesses: gameStore.watching })
    for (const fn of cleanups) fn()
  })

  return {
    challenge,
    subject,
    clockEndsAt,
    currentRound,
    showInterstitial,
    started,
    submitted,
    secondsLeft,
    remainingFraction,
    elapsedFraction,
    begin,
    hint,
    hintTone,
    announce,
    entries,
    submitOnce,
    stopCountdown,
    registerCleanup,
    createViewTimer,
    isDisposed: () => disposed,
    gameStore,
    update,
    seatEcho,
    previewVerdict,
    clearBoard,
  }
}
