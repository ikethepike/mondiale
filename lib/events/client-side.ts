import { releaseAllMapBerths } from '~~/lib/map-berth'
import { resolveAccessorPath } from '~~/lib/values'
import { useGameStore } from '~~/store/game.store'
import {
  type ClientEventAck,
  type ClientEventData,
  isCriticalClientEvent,
  isValidClientEventTarget,
} from '~~/types/events.types'
import type { PlayerMove } from '~~/types/game.types'

const ACK_TIMEOUT_MS = 5000
const ACK_ATTEMPTS = 3
const RETRY_BACKOFF_MS = 750
/** Pause before a caller re-runs a whole failed `update` batch (all attempts
 *  spent). Answer submits ride this — see useGroupChallenge's deliverAnswer. */
export const REDELIVER_PAUSE_MS = 4000
/** Redelivery is for a disconnect straddling the buzzer, not for a handler
 *  that will never succeed (e.g. a wiped room) — cap the batches so a
 *  permanently failing submit doesn't re-run every few seconds for the life
 *  of the tab. ~15 batches ≈ five minutes; past that, the rejoin heals own
 *  recovery (a refresh re-enters the round or re-banks the seat). */
export const REDELIVER_MAX_BATCHES = 15

/** The only events a booth watcher may emit: their own (re)admission and the
 *  sanctioned crowd cheer. Everything else a mounted read-only view attempts
 *  is swallowed by update()'s watch gate.
 *
 *  THE CONTAINMENT INVARIANT (both layers are input-shaped): `inert` blocks
 *  what a USER triggers, this gate blocks what a view EMITS — neither stops
 *  a mounted view's self-firing effects (setTimeout/setInterval/watch/
 *  onMounted) from mutating local, store or module state. Every such effect
 *  needs an explicit watch-mode verdict, one of: RUN AS AMBIENCE (the group
 *  clock, gate reveal races — what the racer sees, the watcher sees), SKIP
 *  (submitOnce/announce/submitAnswer), SKIP AND CLEAR (movement-request),
 *  or REPLACE WITH SNAPSHOT TRUTH (buzz resolve). The composables record
 *  verdicts for views built on them; a view on neither composable —
 *  ViewIndividualChallenge is the standing example — owns every verdict
 *  itself, including the invisible ones (its interstitial ref, its timers). */
export const WATCH_SAFE_EVENTS: ClientEventData['event'][] = ['join', 'player-cheering']

export const useClientEvents = () => {
  const router = useRouter()
  const gameStore = useGameStore()
  const game = toRef(gameStore, 'game')
  const route = toRef(router, 'currentRoute')
  const socket = toRef(gameStore, 'socket')
  const playerId = toRef(gameStore, 'playerId')
  const currentRound = toRef(gameStore, 'currentRound')

  // The SEAT this UI renders as: the booth's followed racer, or self. Views
  // read `player`/`currentMove` and never notice the difference — the booth
  // sets `spectateSeatId`, everyone else resolves to their own record.
  const currentMoves = computed<PlayerMove[]>(() => {
    if (!game.value) return []
    if (!gameStore.seatId) return []
    return game.value.players[gameStore.seatId]?.moves ?? []
  })

  const currentMove = computed<PlayerMove | undefined>(() => {
    return currentMoves.value[0]
  })

  const player = computed(() => {
    if (!gameStore.game) return undefined
    return gameStore.game.players[gameStore.seatId]
  })

  /** The RAW own record — routing truth. `player` follows the booth's seat,
   *  so the room page must branch on `self`: a latecomer watcher has no self
   *  record even while `player` resolves to the racer they follow. */
  const self = computed(() => {
    if (!gameStore.game) return undefined
    return gameStore.game.players[playerId.value]
  })

  // Host affordances key off the REAL identity — a watcher following the
  // host must not light host-only controls.
  const hostPlayer = computed(() => {
    if (!gameStore.game) return undefined
    return Object.values(gameStore.game.players).find(player => player.id === game.value?.host)
  })

  const isPlayerHost = computed<boolean>(() => {
    if (!self.value) return false
    return self.value.id === game.value?.host
  })

  const currentFinalChallenge = computed(() => {
    if (currentMove.value?.challenge?._type !== 'final-challenge') return undefined
    return [...currentMove.value.challenge.challenges].shift()
  })

  const clearBoard = (options: { preserveLiveGuesses?: boolean } = {}) => {
    // The one home of the ticker-preserving reset: a mid-round repaint (the
    // booth's focus shifts, a mounted view's own clear) must not wipe
    // in-flight guess chips. Call-site snapshot/restore used to do this by
    // accident of shared array identity — the option is the contract.
    const guesses = options.preserveLiveGuesses ? gameStore.map.liveGuesses : []
    gameStore.map.highlighted.clear()
    gameStore.map.reveal = undefined
    gameStore.map.revealStat = undefined
    gameStore.map.status = undefined
    gameStore.map.solo = false
    gameStore.map.landmass = false
    gameStore.map.labels = false
    // Drop the claims too, or a released slot would be re-applied by the
    // next claimant's recompute from stale owners.
    releaseAllMapBerths()
    gameStore.map.berth = undefined
    gameStore.map.focus = []
    gameStore.map.focusContext = []
    gameStore.map.framePad = undefined
    gameStore.map.tints = {}
    gameStore.map.pin = undefined
    gameStore.map.pinAnswer = undefined
    gameStore.map.countryGroupings = undefined
    gameStore.map.seaLinks = []
    gameStore.map.ringed = []
    gameStore.map.landRoutes = []
    gameStore.map.seaGlow = []
    gameStore.map.staggered = false
    gameStore.map.dimmed = []
    gameStore.map.pulsing = []
    gameStore.map.atlasMode = false
    gameStore.map.zoomOut = undefined
    gameStore.map.feature = undefined
    gameStore.map.inset = undefined
    gameStore.map.liveGuesses = guesses
  }

  return {
    _instance: socket,
    game,
    route,
    player,
    self,
    playerId,
    gameStore,
    clearBoard,
    hostPlayer,
    currentMove,
    currentMoves,
    isPlayerHost,
    currentRound,
    currentFinalChallenge,
    async update(eventData: ClientEventData): Promise<boolean> {
      // The booth's central write gate: mounted views run their full logic
      // read-only, so any submit/heal/movement emit they attempt dies HERE,
      // not by per-view discipline. The server guard (socket.server.ts
      // dispatch binding) remains the suspender under this belt. Returning
      // false honors the existing "was it delivered" contract.
      if (gameStore.watching && !WATCH_SAFE_EVENTS.includes(eventData.event)) {
        console.info(`Watch mode swallowed ${eventData.event}`)
        return false
      }

      console.log('Sending event', eventData)
      if (!socket.value) {
        throw new EvalError(`Socket not initialized`)
      }

      const gameId = game.value?.id || route.value.params.roomId || ''
      if (!gameId) {
        throw ReferenceError('Game id not found')
      }

      if (!playerId.value) {
        throw ReferenceError('PlayerId not set')
      }

      const eventTarget = {
        gameId,
        playerId: playerId.value,
      }

      if (!isValidClientEventTarget(eventTarget)) {
        throw new EvalError('Invalid client event target')
      }

      // Verify that key exists for index updates
      if (eventData.event === 'update-by-index' && game.value) {
        const { found } = resolveAccessorPath(game.value, eventData.accessorPattern)
        if (!found) {
          console.warn('Unable to send, invalid accessor pattern', eventData.accessorPattern)
          return false
        }
      }

      if (!isCriticalClientEvent(eventData.event)) {
        socket.value.emit(eventData.event, eventData, eventTarget)
        return true
      }

      // Critical events advance the game's state machine — one lost in a
      // reconnect gap wedges the whole room. Send with an ack and retry until
      // the server confirms it ran; the handlers' duplicate guards make
      // retries safe.
      for (let attempt = 1; attempt <= ACK_ATTEMPTS; attempt++) {
        try {
          const receipt: ClientEventAck = await socket.value
            .timeout(ACK_TIMEOUT_MS)
            .emitWithAck(eventData.event, eventData, eventTarget)
          if (receipt.ok) return true

          // The socket lost its player binding (a reconnect raced the
          // re-join): join binds it back, and is idempotent server-side.
          if (receipt.reason === 'unbound' && game.value) {
            socket.value.emit(
              'join',
              {
                event: 'join',
                variant: game.value.variant,
                ...(gameStore.joinAsSpectator ? { asSpectator: true } : {}),
              },
              eventTarget
            )
          }
          // 'error' means the handler THREW — a deterministic failure that
          // will fail identically on every retry, burning the attempt budget
          // in seconds and then giving up silently. The seat is stranded
          // either way, so stop early and let the caller surface it rather
          // than spending three round-trips proving the same thing.
          if (receipt.reason === 'error') {
            console.error(`${eventData.event} rejected by the server (handler threw)`)
            return false
          }

          console.warn(`${eventData.event} not accepted (${receipt.reason}), retrying`)
        } catch {
          console.warn(`No ack for ${eventData.event} (attempt ${attempt}/${ACK_ATTEMPTS})`)
        }

        if (attempt < ACK_ATTEMPTS) {
          await new Promise(resolve => setTimeout(resolve, RETRY_BACKOFF_MS * attempt))
        }
      }

      console.error(`Failed to deliver ${eventData.event} after ${ACK_ATTEMPTS} attempts`)
      return false
    },
  }
}
