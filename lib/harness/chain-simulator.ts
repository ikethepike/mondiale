import {
  activePlayerId,
  canPullRipCord,
  chargeMiss,
  closeChainRound,
  deadEndRescued,
  dealFreshChain,
  eliminateSeat,
  passTurn,
  pullRipCord,
  recordLink,
  sealDeadEnd,
  standingPlayers,
} from '~~/lib/chain'
import { sample } from '~~/lib/arrays'
import { TRAP_HOLD_MS } from '~~/lib/round-beats'
import type { ChainTurnState } from '~~/types/challenges/group-modes.type'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * The preview harness's stand-in for the turn-chain engine
 * (`lib/events/server/chain-engine.ts`), which needs a server runtime the
 * harness does not have.
 *
 * It mirrors that engine's rhythm — turn handoff, rival moves, strikes, the
 * dead-end trap and its reseed, settle — and takes the SAME four spec points
 * the real engine is parameterised by, so Atlas and Border Chain ride one
 * simulator here exactly as they ride one engine in production. The link rule
 * itself is never reimplemented: each spec hands back `lib/`'s own answer.
 *
 * Every timer re-reads the live challenge and dies when the scenario was
 * redealt or the turn moved on — the engine's own staleness posture.
 */

/** How long a rival "thinks" before playing its move. */
const RIVAL_BEAT_MS = 1600
/** The stubbed round-trip a submit takes before it resolves. */
const LATENCY_MS = 300
/** The shot clock is the round's own, plus a beat of slack. */
const CLOCK_SLACK_MS = 400

export interface ChainSimSpec<C extends Stateful> {
  /** The live challenge of this kind, or undefined when it is not in play. */
  current: () => C | undefined
  /** Turn length, in seconds. */
  turnSeconds: (challenge: C) => number
  /** Every country that could legally continue the chain right now. */
  openMoves: (challenge: C) => ISOCountryCode[]
  /** The mode's dead-end proof, shown while the trap holds. */
  buildTrap: (
    challenge: C,
    trappedId: string,
    byPlayerId: string | undefined
  ) => NonNullable<C['state']['trap']>
  /** Fresh ground for the survivors after a trap. */
  reseed: (challenge: C) => ISOCountryCode | undefined
  /** The engine spec's own hook, called before a legal move joins the chain. */
  admitMove?: (challenge: C, isoCode: ISOCountryCode, typed: string | undefined) => void
  /** A rival's pick when the mode plays smarter than a random legal move. */
  rivalMove?: (challenge: C) => ISOCountryCode | undefined
  /** The seat the harness plays. */
  meId: string
}

interface Stateful {
  state: ChainTurnState<unknown>
}

export const createChainSimulator = <C extends Stateful>(spec: ChainSimSpec<C>) => {
  /** A timer only fires when the challenge AND its turn are still the ones it
   *  was armed for — the engine's staleness token, kept here too. */
  const stillLive = (challenge: C, turn: number): C | undefined => {
    const current = spec.current()
    if (current !== challenge || current.state.finished) return undefined
    if (current.state.turn !== turn) return undefined
    return current
  }

  const holdTurn = (challenge: C) => {
    challenge.state.turn++
    challenge.state.deadline = Date.now() + spec.turnSeconds(challenge) * 1000
  }

  const advanceTurn = (challenge: C) => {
    passTurn(challenge.state)
    holdTurn(challenge)
  }

  const finish = (challenge: C) => closeChainRound(challenge.state)

  const springTrap = (challenge: C) => {
    const { state } = challenge
    const trappedId = activePlayerId(state)
    const byPlayerId =
      state.lastMoverId && state.lastMoverId !== trappedId ? state.lastMoverId : undefined
    if (!sealDeadEnd(state, trappedId, byPlayerId)) eliminateSeat(state, trappedId, 'trapped', [])
    state.trap = spec.buildTrap(challenge, trappedId, byPlayerId)
    state.deadline = 0
    armTrapResume(challenge)
  }

  const armTrapResume = (challenge: C) => {
    const heldTurn = challenge.state.turn
    window.setTimeout(() => {
      const current = stillLive(challenge, heldTurn)
      if (!current?.state.trap) return
      const { state } = current
      state.trap = undefined
      if (standingPlayers(state).length <= 1) return finish(current)
      const seed = spec.reseed(current)
      if (!seed) return finish(current)
      dealFreshChain(state, seed)
      if (deadEndRescued(state)) holdTurn(current)
      else advanceTurn(current)
      continueTurn(current)
    }, TRAP_HOLD_MS)
  }

  const applyMove = (challenge: C, isoCode: ISOCountryCode, typed?: string) => {
    spec.admitMove?.(challenge, isoCode, typed)
    recordLink(challenge.state, isoCode)
    advanceTurn(challenge)
    if (!spec.openMoves(challenge).length) return springTrap(challenge)
    continueTurn(challenge)
  }

  const resolveMiss = (challenge: C, kind: 'wrong' | 'timeout') => {
    if (chargeMiss(challenge.state, kind, () => spec.openMoves(challenge))) return finish(challenge)
    advanceTurn(challenge)
    continueTurn(challenge)
  }

  /** After each committed turn: arm the shot clock, and let a rival act. */
  const continueTurn = (challenge: C) => {
    if (challenge.state.finished) return
    const { turn } = challenge.state

    window.setTimeout(
      () => {
        const current = stillLive(challenge, turn)
        if (!current || current.state.trap) return
        resolveMiss(current, 'timeout')
      },
      spec.turnSeconds(challenge) * 1000 + CLOCK_SLACK_MS
    )

    const activeId = activePlayerId(challenge.state)
    if (activeId === spec.meId) return
    window.setTimeout(() => {
      const current = stillLive(challenge, turn)
      if (!current || current.state.trap) return
      if (activePlayerId(current.state) !== activeId) return
      const move = spec.rivalMove?.(current) ?? sample(spec.openMoves(current))
      if (move) applyMove(current, move)
    }, RIVAL_BEAT_MS)
  }

  return {
    /** The table acks the briefing card and the first turn opens. */
    ready: () => {
      const challenge = spec.current()
      if (!challenge?.state.briefing || challenge.state.finished) return
      window.setTimeout(() => {
        const current = spec.current()
        if (current !== challenge || !current.state.briefing) return
        current.state.ready = [...current.state.order]
        current.state.briefing = false
        current.state.deadline = Date.now() + spec.turnSeconds(current) * 1000
        continueTurn(current)
      }, LATENCY_MS)
    },

    /** The player's move: taken when it is legal, a miss when it is not. */
    move: (eventData: Record<string, unknown>) => {
      const challenge = spec.current()
      if (!challenge || challenge.state.finished) return
      const { state } = challenge
      if (state.briefing || state.trap) return
      if (eventData.turn !== state.turn) return
      if (activePlayerId(state) !== spec.meId) return
      const isoCode = String(eventData.isoCode ?? '') as ISOCountryCode
      const typed = typeof eventData.typed === 'string' ? eventData.typed : undefined
      const turn = state.turn
      window.setTimeout(() => {
        const current = stillLive(challenge, turn)
        if (!current || current.state.trap) return
        if (spec.openMoves(current).includes(isoCode)) applyMove(current, isoCode, typed)
        else resolveMiss(current, 'wrong')
      }, LATENCY_MS)
    },

    /** The player's rip cord: fresh ground, and the clock stays theirs. */
    ripCord: (eventData: Record<string, unknown>) => {
      const challenge = spec.current()
      if (!challenge || !canPullRipCord(challenge.state, spec.meId)) return
      if (eventData.turn !== challenge.state.turn) return
      const turn = challenge.state.turn
      window.setTimeout(() => {
        const current = stillLive(challenge, turn)
        const seed = current && spec.reseed(current)
        if (!current || !seed || !canPullRipCord(current.state, spec.meId)) return
        pullRipCord(current.state, spec.meId, seed)
        holdTurn(current)
        continueTurn(current)
      }, LATENCY_MS)
    },

    /** A redealt scenario comes alive at once: a live turn arms its clock (and
     *  a rival's move), a parked trap arms its resume. */
    arm: () => {
      const challenge = spec.current()
      if (!challenge || challenge.state.finished || challenge.state.briefing) return
      if (challenge.state.trap) return armTrapResume(challenge)
      challenge.state.deadline = Date.now() + spec.turnSeconds(challenge) * 1000
      continueTurn(challenge)
    },
  }
}
