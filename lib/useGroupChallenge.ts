import { computed, onBeforeUnmount, ref } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { useClientEvents } from '~~/lib/events/client-side'
import { guessPolicyFor } from '~~/lib/live-guess-policy'
import { DWELL } from '~~/lib/motion'
import type { GuessTickerEntry } from '~~/store/game.store'
import type { RoundChallenge } from '~~/types/challenges/traversal-challenge.type'
import type { GuessKind } from '~~/types/events.types'
import type { ISOCountryCode } from '~~/types/geography.types'

/** Every round challenge that carries a `_type` discriminant. The legacy
 *  ranking `GroupChallenge` has none, so `Extract` drops it automatically. */
type TypedRoundChallenge = Extract<RoundChallenge, { _type: string }>

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

  // Blank the world map by default — most modes ARE the whole question.
  clearBoard()
  if (options.solo !== false) gameStore.map.solo = true

  const showInterstitial = ref(true)
  const started = ref(false)
  const submitted = ref(false)

  // Optional countdown, driven by a `durationSeconds` on the challenge.
  const duration = computed(() =>
    challenge.value && 'durationSeconds' in challenge.value
      ? (challenge.value.durationSeconds as number)
      : undefined
  )
  const secondsLeft = ref(duration.value ?? 0)
  let countdown: ReturnType<typeof setInterval> | undefined
  const cleanups: (() => void)[] = []

  /** Submit exactly once; later calls (e.g. timeout after a manual answer) no-op. */
  const submitOnce = (ranking: ISOCountryCode[], clientScore?: number) => {
    if (submitted.value) return
    submitted.value = true
    update({ event: 'submit-group-challenge-answers', ranking, clientScore })
  }

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
      { entryId: uuidv4(), playerId: gameStore.playerId, kind, ...named, at: Date.now() },
    ]
    update({ event: 'player-guessing', kind, ...named })
  }

  /** Opponents' chips plus our own, oldest first, each expiring on its own. */
  const entries = computed(() =>
    [...gameStore.map.liveGuesses, ...ownGuesses.value].sort((a, b) => a.at - b.at)
  )

  // One pruner for both lists — entries carry their own timestamp, so expiry is
  // a filter rather than a timer per chip.
  const pruner = setInterval(() => {
    const cutoff = Date.now() - DWELL.hint
    if (ownGuesses.value.some(entry => entry.at <= cutoff)) {
      ownGuesses.value = ownGuesses.value.filter(entry => entry.at > cutoff)
    }
    if (gameStore.map.liveGuesses.some(entry => entry.at <= cutoff)) {
      gameStore.map.liveGuesses = gameStore.map.liveGuesses.filter(entry => entry.at > cutoff)
    }
  }, PRUNE_INTERVAL_MS)

  cleanups.push(() => hintTimer && clearTimeout(hintTimer))
  cleanups.push(() => clearInterval(pruner))

  /**
   * Leave the interstitial and start the round. `onTimeout` (if a countdown
   * exists) fires once when the clock hits zero — typically a fail-submit.
   * `onTick` runs each second for mode-specific reveals.
   */
  const begin = (
    hooks: { onTimeout?: () => void; onTick?: (secondsLeft: number) => void } = {}
  ) => {
    showInterstitial.value = false
    started.value = true
    if (duration.value) {
      secondsLeft.value = duration.value
      countdown = setInterval(() => {
        secondsLeft.value--
        hooks.onTick?.(secondsLeft.value)
        if (secondsLeft.value <= 0) {
          if (countdown) clearInterval(countdown)
          countdown = undefined
          hooks.onTimeout?.()
        }
      }, 1000)
    }
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

  onBeforeUnmount(() => {
    clearBoard()
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
