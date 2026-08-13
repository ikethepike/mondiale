import { activePlayerId, liveChain, standingPlayers } from '~~/lib/chain'
import { sample } from '~~/lib/arrays'
import { TRAP_HOLD_MS } from '~~/lib/round-beats'
import type { ChainTurnOutcome, ChainTurnState } from '~~/types/challenges/group-modes.type'
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

export interface ChainSimSpec<C> {
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
  ) => Record<string, unknown>
  /** Fresh ground for the survivors after a trap. */
  reseed: (challenge: C) => ISOCountryCode | undefined
  /** The seat the harness plays. */
  meId: string
}

interface Stateful {
  state: ChainTurnState<unknown> & {
    chains: ISOCountryCode[][]
    named: { [playerId: string]: ISOCountryCode[] }
    strikesLeft: { [playerId: string]: number }
    eliminated: string[]
    outcomes: { [playerId: string]: ChainTurnOutcome }
    missedOuts: { [playerId: string]: ISOCountryCode[] }
    trappedBy?: { [playerId: string]: string }
    trap?: unknown
    briefing?: boolean
    ready?: string[]
    lastMoverId?: string
    finished?: boolean
  }
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

  const advanceTurn = (challenge: C) => {
    const { state } = challenge
    const standing = new Set(standingPlayers(state))
    for (let step = 1; step <= state.order.length; step++) {
      const index = (state.activeIndex + step) % state.order.length
      if (standing.has(state.order[index]!)) {
        state.activeIndex = index
        break
      }
    }
    state.turn++
    state.deadline = Date.now() + spec.turnSeconds(challenge) * 1000
  }

  const finish = (challenge: C) => {
    const winner = standingPlayers(challenge.state)[0]
    if (winner) challenge.state.outcomes[winner] = 'won'
    challenge.state.finished = true
  }

  const eliminate = (
    challenge: C,
    playerId: string,
    outcome: ChainTurnOutcome,
    outs: ISOCountryCode[]
  ) => {
    challenge.state.eliminated.push(playerId)
    challenge.state.outcomes[playerId] = outcome
    challenge.state.missedOuts[playerId] = outs
  }

  const springTrap = (challenge: C) => {
    const { state } = challenge
    const trappedId = activePlayerId(state)
    eliminate(challenge, trappedId, 'trapped', [])
    const byPlayerId =
      state.lastMoverId && state.lastMoverId !== trappedId ? state.lastMoverId : undefined
    if (byPlayerId) (state.trappedBy ??= {})[trappedId] = byPlayerId
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
      state.chains.push([seed])
      advanceTurn(current)
      continueTurn(current)
    }, TRAP_HOLD_MS)
  }

  const applyMove = (challenge: C, isoCode: ISOCountryCode) => {
    const { state } = challenge
    const moverId = activePlayerId(state)
    liveChain(state).push(isoCode)
    ;(state.named[moverId] ??= []).push(isoCode)
    state.lastMoverId = moverId
    advanceTurn(challenge)
    if (!spec.openMoves(challenge).length) return springTrap(challenge)
    continueTurn(challenge)
  }

  const resolveMiss = (challenge: C, kind: 'wrong' | 'timeout') => {
    const { state } = challenge
    const missedId = activePlayerId(state)
    if ((state.strikesLeft[missedId] ?? 0) > 0) {
      state.strikesLeft[missedId]--
    } else {
      eliminate(challenge, missedId, kind, spec.openMoves(challenge))
      if (standingPlayers(state).length <= 1) return finish(challenge)
    }
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
      const move = sample(spec.openMoves(current))
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
      const turn = state.turn
      window.setTimeout(() => {
        const current = stillLive(challenge, turn)
        if (!current || current.state.trap) return
        if (spec.openMoves(current).includes(isoCode)) applyMove(current, isoCode)
        else resolveMiss(current, 'wrong')
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
