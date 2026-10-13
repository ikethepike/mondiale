import { computed, nextTick, ref, watch, type ComputedRef } from 'vue'
import {
  activePlayerId,
  type ChainBeats,
  canPullRipCord,
  chainBeats,
  chainNarration,
  chainParachute,
  liveChain,
  RETIRED_CHAIN_FILL,
  ripCordsLeft,
  walkColor,
} from './chain'
import { createGroupingsWriter, writeMapList } from './map-paint'
import { REPLAY_REDRAW_MS } from './motion'
import { seatLabel } from './player'
import { useAckOnce } from './use-ack-once'
import { useDeadlineClock } from './use-deadline-clock'
import { useFooterBerth } from './use-footer-berth'
import { useGroupChallenge } from './useGroupChallenge'
import type {
  AtlasChallenge,
  BorderChainChallenge,
  ChainTurnOutcome,
  ChainTurnState,
} from '~~/types/challenges/group-modes.type'
import type { CountryColorGrouping } from '~~/types/map.type'
import type { ISOCountryCode } from '~~/types/geography.types'

type ChainKind = 'atlas-challenge' | 'border-chain-challenge'
type ChainChallenge<T extends ChainKind> = T extends 'atlas-challenge'
  ? AtlasChallenge
  : BorderChainChallenge

/** What a turn-chain view says and draws in its own words; the rhythm is shared. */
export interface ChainViewSpec<T extends ChainKind> {
  turnSeconds: (challenge: ChainChallenge<T>) => number
  /** The elimination line's tail for a miss. */
  fate: (outcome: ChainTurnOutcome | undefined) => string
  /** The narration line for someone else's move. */
  move: (
    name: string,
    to: ISOCountryCode,
    from: ISOCountryCode,
    state: ChainChallenge<T>['state']
  ) => string
  /** The arcs every walked chain draws, by map channel. */
  links: (state: ChainChallenge<T>['state']) => { seaLinks?: string[]; hopLinks?: string[] }
  /** What the camera holds while the chain is live. */
  frame: (state: ChainChallenge<T>['state']) => ISOCountryCode[]
  /** The dead-end proof's countries, washed and framed with the sealed head. */
  trapProof: (trap: NonNullable<ChainChallenge<T>['state']['trap']>) => ISOCountryCode[]
}

/** A fresh chain a rip cord just dealt — the parachute beat's payload. */
export type ChainParachute = NonNullable<ReturnType<typeof chainParachute>>

/**
 * The turn-chain views' shared scaffolding (Atlas, Border Chain): seat and
 * turn derivations, the console's submit latch, narration diffed off
 * snapshots, the rip cord, and the map painter. In the booth nobody is "you":
 * the followed seat reads in the third person and the console stands down.
 */
export const useChainTurnView = <T extends ChainKind>(typeName: T, spec: ChainViewSpec<T>) => {
  const group = useGroupChallenge(typeName, { solo: false })
  const challenge = group.challenge as ComputedRef<ChainChallenge<T> | undefined>
  const { gameStore, update, narrate, createViewTimer } = group

  const state = computed(() => challenge.value?.state as ChainTurnState<unknown> | undefined)
  const watching = computed(() => gameStore.watching)
  /** Who "you" is — nobody in the booth. */
  const viewerId = computed(() => (gameStore.watching ? '' : gameStore.seatId))
  const seatName = (playerId: string) =>
    seatLabel(gameStore.game?.players, playerId, viewerId.value)

  const { sent: sentReady, send: sendReady } = useAckOnce(() => ({ event: 'chain-ready' }))

  const briefing = computed(() => !!state.value?.briefing)
  const finished = computed(() => !!state.value?.finished)
  const trap = computed(() => challenge.value?.state.trap)
  const chain = computed(() => (state.value ? liveChain(state.value) : []))
  const seed = computed(() => state.value?.chains[0]?.[0] as ISOCountryCode)
  const head = computed(() => chain.value.at(-1))
  const activeId = computed(() => (state.value ? activePlayerId(state.value) : undefined))
  const activePlayer = computed(() =>
    activeId.value ? gameStore.game?.players[activeId.value] : undefined
  )
  const iAmOut = computed(
    () => !!viewerId.value && !!state.value?.eliminated.includes(viewerId.value)
  )
  /** The viewer is seated and still standing: their console stays up between
   *  turns, so the footer never changes height on a handoff. */
  const consoleShown = computed(
    () =>
      !!viewerId.value &&
      !finished.value &&
      !briefing.value &&
      !iAmOut.value &&
      !!state.value?.order.includes(viewerId.value)
  )
  // Nobody is on the clock during a dead-end hold.
  const myTurn = computed(
    () => consoleShown.value && !trap.value && activeId.value === viewerId.value
  )

  const turnTotal = computed(() => (challenge.value ? spec.turnSeconds(challenge.value) : 0))
  const { secondsOnClock } = useDeadlineClock(
    () => state.value?.deadline,
    () => turnTotal.value
  )

  const turnLabel = (needs?: string) => {
    const tail = needs ? ` — needs ${needs}` : ''
    if (myTurn.value) return `Your move${tail}`
    return activeId.value ? `${seatName(activeId.value)} is on the clock${tail}` : ''
  }

  /** The table at a glance: who is up, who is out, who still holds a cord. */
  const seats = computed(() => {
    const current = state.value
    if (!current) return []
    return current.order.map(playerId => ({
      id: playerId,
      name: seatName(playerId),
      color: gameStore.game?.players[playerId]?.color,
      active: playerId === activeId.value && !current.finished && !current.trap,
      out: current.eliminated.includes(playerId),
      cords: ripCordsLeft(current, playerId),
      strikes: current.strikesLeft[playerId] ?? 0,
    }))
  })

  // --- The console --------------------------------------------------------
  const pending = ref(false)
  const guessInput = ref<{ focus: (options?: { auto?: boolean }) => void }>()
  const consoleFooter = ref<HTMLElement>()
  useFooterBerth(consoleFooter)

  const focusMyTurn = () => {
    if (!myTurn.value) return
    nextTick(() => guessInput.value?.focus({ auto: true }))
  }

  // The turn watcher never fires for the round's opener (turn stays 0), so the
  // interstitial's dismissal carries the first focus.
  const begin = () => {
    group.begin()
    focusMyTurn()
  }

  // A dead end outranks the opening sign; once it has sprung the sign is
  // stale, so it must not come back when the hold lifts.
  watch(
    trap,
    sprung => {
      if (sprung && group.showInterstitial.value) begin()
    },
    { immediate: true }
  )

  /** Send a legal move. A send the server never acknowledged unlocks the
   *  console at once instead of leaving it dead until the clock runs out. */
  const submitMove = async (isoCode: ISOCountryCode, typed?: string) => {
    const active = state.value
    if (!active || !myTurn.value || pending.value) return
    pending.value = true
    const delivered = await update({
      event: 'submit-chain-move',
      isoCode,
      turn: active.turn,
      ...(typed ? { typed } : {}),
    })
    if (!delivered && state.value?.turn === active.turn) pending.value = false
  }

  // Latched per turn rather than on `pending`: a pull the server refuses moves
  // no turn, and must not leave the guess input locked until the clock dies.
  const pulledOnTurn = ref<number>()
  const holdsCord = computed(
    () => consoleShown.value && !!state.value && ripCordsLeft(state.value, viewerId.value) > 0
  )
  const canPullCord = computed(
    () =>
      !!viewerId.value &&
      !!state.value &&
      canPullRipCord(state.value, viewerId.value) &&
      pulledOnTurn.value !== state.value.turn
  )
  const pullCord = async () => {
    const active = state.value
    if (!active || !canPullCord.value || pending.value) return
    const { turn } = active
    pulledOnTurn.value = turn
    if (!(await update({ event: 'pull-rip-cord', turn }))) pulledOnTurn.value = undefined
  }

  watch(
    () => state.value?.turn,
    () => {
      pending.value = false
      focusMyTurn()
    }
  )

  // --- Ephemeral beats ------------------------------------------------------
  // Diffed off consecutive snapshots — nothing rides the wire, nothing is
  // stored. The first snapshot has no base, so a rejoiner lands silently.
  const parachute = ref<ChainParachute>()
  let seenBeats: ChainBeats | undefined
  watch(
    () => state.value && chainBeats(state.value),
    snapshot => {
      const current = state.value
      if (!current || !snapshot) return
      const before = seenBeats
      seenBeats = snapshot
      if (!before) return
      const drop = chainParachute(current, before, snapshot)
      if (drop) parachute.value = drop
      const line = chainNarration(current, before, snapshot, {
        seatId: viewerId.value,
        seatName,
        fate: spec.fate,
        move: (name, to, from) =>
          spec.move(name, to, from, challenge.value!.state as ChainChallenge<T>['state']),
      })
      if (line) narrate(line)
    },
    { immediate: true }
  )

  // --- Painting the map -------------------------------------------------------
  const writeGroupings = createGroupingsWriter(gameStore.map)

  const paintChain = (staggered: boolean) => {
    const current = challenge.value?.state
    if (!current) return
    const groupings: CountryColorGrouping[] = []
    current.chains.forEach((walkedChain, chainIndex) => {
      const live = chainIndex === current.chains.length - 1
      walkedChain.forEach((isoCode, index) => {
        const isHead = live && !current.finished && index === walkedChain.length - 1
        groupings.push({
          color: live ? walkColor(index, walkedChain.length, isHead) : RETIRED_CHAIN_FILL,
          countries: [isoCode],
        })
      })
    })
    gameStore.map.staggered = staggered
    writeGroupings(groupings)
    const { seaLinks = [], hopLinks = [] } = spec.links(current)
    writeMapList(gameStore.map, 'seaLinks', seaLinks)
    writeMapList(gameStore.map, 'hopLinks', hopLinks)

    // During the dead-end hold the map carries the proof: the spent names take
    // the miss wash and the camera frames them with the sealed head, so the
    // overlay's claim is visibly true behind it.
    const sprung = current.trap
    if (sprung) {
      const proof = spec.trapProof(sprung as NonNullable<typeof sprung>)
      gameStore.map.tints = Object.fromEntries(proof.map(isoCode => [isoCode, 'stray' as const]))
      writeMapList(gameStore.map, 'focus', [sprung.head, ...proof])
      writeMapList(gameStore.map, 'pulsing', [sprung.head])
      return
    }
    if (Object.keys(gameStore.map.tints).length) gameStore.map.tints = {}
    const liveHead = current.finished ? undefined : liveChain(current).at(-1)
    writeMapList(gameStore.map, 'pulsing', liveHead ? [liveHead] : [])
    writeMapList(
      gameStore.map,
      'focus',
      current.finished ? current.chains.flat() : spec.frame(current)
    )
  }

  // Keyed on what the paint draws, so a ready ack or a restamped clock does
  // not repaint — and in-place mutation (the preview harness) still does.
  const paintKey = computed(() => {
    const current = challenge.value?.state
    if (!current) return ''
    return `${current.chains.map(walked => walked.join(',')).join('|')}#${current.trap?.head ?? ''}`
  })
  watch(paintKey, () => !finished.value && paintChain(false), { immediate: true })

  const scheduleReplay = createViewTimer()

  // The reveal replay: blank the path, then let it re-arrive hop by hop, with
  // the viewer's missed continuations glowing as the lesson. Immediate, so a
  // client that arrives with the round already finished still gets it.
  watch(
    finished,
    done => {
      if (!done) return
      writeGroupings(undefined)
      writeMapList(gameStore.map, 'seaLinks', [])
      writeMapList(gameStore.map, 'hopLinks', [])
      writeMapList(gameStore.map, 'pulsing', [])
      scheduleReplay(() => {
        paintChain(true)
        const outs = state.value?.missedOuts[viewerId.value] ?? []
        gameStore.map.tints = Object.fromEntries(outs.map(isoCode => [isoCode, 'optimal']))
      }, REPLAY_REDRAW_MS)
    },
    { immediate: true }
  )

  return {
    ...group,
    challenge,
    begin,
    state,
    watching,
    viewerId,
    seatName,
    sentReady,
    sendReady,
    briefing,
    finished,
    trap,
    chain,
    seed,
    head,
    activeId,
    activePlayer,
    iAmOut,
    consoleShown,
    myTurn,
    turnTotal,
    secondsOnClock,
    turnLabel,
    seats,
    pending,
    guessInput,
    consoleFooter,
    submitMove,
    holdsCord,
    canPullCord,
    pullCord,
    parachute,
  }
}
