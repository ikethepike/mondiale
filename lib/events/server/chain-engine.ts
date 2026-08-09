import { activePlayerId, liveChain, standingPlayers } from '~~/lib/chain'
import { latestRound } from '~~/lib/rounds'
import type { ChainTurnChallenge, ChainTurnOutcome } from '~~/types/challenges/group-modes.type'
import type { Game } from '~~/types/game.types'
import { isValidISOCode, type ISOCountryCode } from '~~/types/geography.types'
import { useServerSideEvents } from '../server-side'
import {
  scheduleDeadlineTask,
  scheduleEngineTask,
  scheduleRevealTask,
  settleRoundScores,
  type EngineContext,
  type RearmOptions,
} from './round-engine'
import {
  BRIEFING_CAP_MS,
  FIRST_TURN_GRACE_MS,
  TIMEOUT_SLACK_MS,
  TRAP_HOLD_MS,
} from '~~/lib/round-beats'
import { armGroupScoresCaps } from './seat-exits'

/**
 * The turn-chain engine — the shared rhythm behind the seat-by-seat
 * elimination rounds (Border Chain, Atlas). State lives on the challenge
 * payload inside the current round, every mutation runs inside the per-game
 * queue, and the per-turn shot clock follows the timer-outside-the-queue
 * pattern (enter-movement-phase): a setTimeout holds no lock, and the state's
 * `turn` counter is the token that makes a stale timeout a no-op.
 *
 * Everything mode-specific — the link rule, the dead-end proof, the fresh
 * seed, the payout — comes in through the spec, so the two modes cannot
 * drift on the rhythm and neither copies the engine.
 */
export type ChainContext = EngineContext

export interface ChainEngineSpec<C extends ChainTurnChallenge<unknown>> {
  /** The live round's challenge of this kind, or nothing. */
  current(game: Game): C | undefined
  /** Legal extensions of the live chain under this mode's link rule. */
  openMoves(challenge: C, game: Game): ISOCountryCode[]
  /** The dead-end proof frozen into `state.trap` while the table holds. */
  buildTrap(
    challenge: C,
    game: Game,
    trappedId: string,
    byPlayerId: string | undefined
  ): NonNullable<C['state']['trap']>
  /** A fresh chain's seed after a trap; nothing dealable ends the round. */
  reseed(challenge: C, game: Game): ISOCountryCode | undefined
  /** The settled table's payout. */
  scores(challenge: C): { [playerId: string]: { scored: number; maximum: number } }
}

export interface ChainEngine<C extends ChainTurnChallenge<unknown>> {
  /** Stamp the first deadline BEFORE the reveal saves (clients see a live
   *  clock). While the briefing holds, the deadline stays 0. */
  startClock(challenge: C): void
  /** Arm the clock AFTER the save. During the briefing this is the reading
   *  cap; after it, the active player's shot clock. */
  scheduleTimeout(ctx: ChainContext, challenge: C): void
  /** The submit-chain-move wire event, fully guarded; self-selects on
   *  `spec.current` so both engines can share one handler. */
  handleMove(
    ctx: ChainContext,
    game: Game,
    eventData: { isoCode: ISOCountryCode; turn: number },
    playerId: string
  ): Promise<void>
  /** The chain-ready wire event — a dismissed briefing card. */
  handleReady(ctx: ChainContext, game: Game, playerId: string): Promise<void>
  /** A validated legal move — exported for the engine tests; the wire path
   *  goes through `handleMove`, which guards and validates first. */
  applyMove(ctx: ChainContext, game: Game, challenge: C, isoCode: ISOCountryCode): Promise<void>
  /** A wrong answer or an expired clock — burn a strike or eliminate. */
  resolveMiss(
    ctx: ChainContext,
    game: Game,
    challenge: C,
    kind: 'wrong' | 'timeout'
  ): Promise<void>
  /** Re-arm whatever follow-up the live round is waiting on (rejoin recovery). */
  rearm(ctx: ChainContext, game: Game, options?: RearmOptions): void
}

export const createChainEngine = <C extends ChainTurnChallenge<unknown>>(
  spec: ChainEngineSpec<C>
): ChainEngine<C> => {
  const stampDeadline = (challenge: C) => {
    challenge.state.deadline = Date.now() + challenge.turnSeconds * 1000
  }

  /** Pass the clock to the next standing player. */
  const advanceTurn = (challenge: C) => {
    const { state } = challenge
    const standing = new Set(standingPlayers(state))
    for (let step = 1; step <= state.order.length; step++) {
      const index = (state.activeIndex + step) % state.order.length
      if (standing.has(state.order[index])) {
        state.activeIndex = index
        break
      }
    }
    state.turn++
    stampDeadline(challenge)
  }

  const eliminate = (
    challenge: C,
    playerId: string,
    outcome: ChainTurnOutcome,
    outs: ISOCountryCode[]
  ) => {
    const { state } = challenge
    state.eliminated.push(playerId)
    state.outcomes[playerId] = outcome
    state.missedOuts[playerId] = outs
  }

  const startClock = (challenge: C) => {
    if (challenge.state.briefing) return
    stampDeadline(challenge)
    challenge.state.deadline += FIRST_TURN_GRACE_MS
  }

  const scheduleTimeout = (ctx: ChainContext, challenge: C) => {
    // A dead-end hold owns the table; the trap's own follow-up re-arms the clock.
    if (challenge.state.trap) return
    if (challenge.state.briefing) {
      scheduleEngineTask(ctx, BRIEFING_CAP_MS, async game => {
        const current = spec.current(game)
        if (!current || current.state.finished || !current.state.briefing) return
        await beginChain(ctx, game, current)
      })
      return
    }
    const { turn, deadline } = challenge.state
    scheduleDeadlineTask(ctx, deadline, async game => {
      const current = spec.current(game)
      // A move, strike, or finish advanced the state — this timeout is stale.
      if (!current || current.state.finished || current.state.turn !== turn) return
      await resolveMiss(ctx, game, current, 'timeout')
    })
  }

  /** A player dismissed their briefing card. Idempotent; the last ready (or
   *  the cap) starts the opening shot clock. */
  const applyReady = async (ctx: ChainContext, game: Game, challenge: C, playerId: string) => {
    const { state } = challenge
    if (!state.briefing || state.ready.includes(playerId)) return
    if (!state.order.includes(playerId)) return
    state.ready.push(playerId)

    if (state.order.every(id => state.ready.includes(id))) {
      return beginChain(ctx, game, challenge)
    }
    const server = useServerSideEvents(ctx)
    await server.updateGameState(game)
    server.emit({ event: 'chain-updated', game }, ctx.eventTarget)
  }

  /** Briefing over: the opening player's shot clock starts. */
  const beginChain = async (ctx: ChainContext, game: Game, challenge: C) => {
    challenge.state.briefing = false
    stampDeadline(challenge)
    challenge.state.deadline += FIRST_TURN_GRACE_MS
    const server = useServerSideEvents(ctx)
    await server.updateGameState(game)
    server.emit({ event: 'chain-updated', game }, ctx.eventTarget)
    scheduleTimeout(ctx, challenge)
  }

  /**
   * The active player named a legal country: extend the chain, then check the
   * NEXT player isn't walking into a dead end — a headless turn is a trap, the
   * trapped player is out, and (with two or more still standing) a fresh chain
   * keeps the round going.
   */
  const applyMove = async (
    ctx: ChainContext,
    game: Game,
    challenge: C,
    isoCode: ISOCountryCode
  ) => {
    const { state } = challenge
    const moverId = activePlayerId(state)

    liveChain(state).push(isoCode)
    ;(state.named[moverId] ??= []).push(isoCode)
    state.lastMoverId = moverId
    advanceTurn(challenge)

    if (spec.openMoves(challenge, game).length === 0) {
      return springTrap(ctx, game, challenge)
    }

    await commitTurn(ctx, game, challenge)
  }

  /**
   * A headless turn. The trapped player never held the clock, so nothing on
   * their screen could explain the elimination — the whole table holds on the
   * mode's proof instead, and the fresh chain waits for the hold to elapse.
   * Capturing the proof here is the point: once a new chain is pushed, the
   * dead head is no longer live and the proof is unrecoverable.
   */
  const springTrap = async (ctx: ChainContext, game: Game, challenge: C) => {
    const { state } = challenge
    const trappedId = activePlayerId(state)

    eliminate(challenge, trappedId, 'trapped', [])
    const byPlayerId =
      state.lastMoverId && state.lastMoverId !== trappedId ? state.lastMoverId : undefined
    if (byPlayerId) (state.trappedBy ??= {})[trappedId] = byPlayerId

    state.trap = spec.buildTrap(challenge, game, trappedId, byPlayerId)
    // The hold is not a shot clock; no one is on the clock during it.
    state.deadline = 0

    const server = useServerSideEvents(ctx)
    await server.updateGameState(game)
    server.emit({ event: 'chain-updated', game }, ctx.eventTarget)

    scheduleTrapResume(ctx, state.turn)
  }

  /** Arm the dead-end hold's follow-up. Idempotent: the fired task re-reads
   *  fresh state and bails once the trap cleared or the turn moved on. */
  const scheduleTrapResume = (ctx: ChainContext, heldTurn: number) => {
    scheduleEngineTask(ctx, TRAP_HOLD_MS + TIMEOUT_SLACK_MS, async fresh => {
      const current = spec.current(fresh)
      if (!current?.state.trap || current.state.finished) return
      if (current.state.turn !== heldTurn) return
      await resumeFromTrap(ctx, fresh, current)
    })
  }

  /**
   * The dead-end hold elapsed: close the round if the trap left one player,
   * else deal fresh ground. A seed guarantees real play, so a second trap here
   * is near-impossible — but the check is kept, and a chained trap simply
   * holds again rather than slipping through.
   */
  const resumeFromTrap = async (ctx: ChainContext, game: Game, challenge: C) => {
    const { state } = challenge
    state.trap = undefined

    if (standingPlayers(state).length <= 1) {
      return finishRound(ctx, game, challenge)
    }

    const seed = spec.reseed(challenge, game)
    if (!seed) return finishRound(ctx, game, challenge)
    state.chains.push([seed])
    advanceTurn(challenge)

    if (spec.openMoves(challenge, game).length === 0) {
      return springTrap(ctx, game, challenge)
    }

    await commitTurn(ctx, game, challenge)
  }

  /** A wrong answer or an expired clock — burn a strike or eliminate. */
  const resolveMiss = async (
    ctx: ChainContext,
    game: Game,
    challenge: C,
    kind: 'wrong' | 'timeout'
  ) => {
    const { state } = challenge
    const missedId = activePlayerId(state)

    if ((state.strikesLeft[missedId] ?? 0) > 0) {
      state.strikesLeft[missedId]--
    } else {
      eliminate(challenge, missedId, kind, spec.openMoves(challenge, game))
      if (standingPlayers(state).length <= 1) {
        return finishRound(ctx, game, challenge)
      }
    }

    // The chain itself is untouched by a miss, so the next player can never be
    // trapped here — the head had open moves a moment ago.
    advanceTurn(challenge)
    await commitTurn(ctx, game, challenge)
  }

  const commitTurn = async (ctx: ChainContext, game: Game, challenge: C) => {
    const server = useServerSideEvents(ctx)
    await server.updateGameState(game)
    server.emit({ event: 'chain-updated', game }, ctx.eventTarget)
    scheduleTimeout(ctx, challenge)
  }

  /**
   * One player left standing: freeze the state for the reveal beat, then score
   * everyone and hand out board moves through the same conversion the submit
   * path uses.
   */
  const finishRound = async (ctx: ChainContext, game: Game, challenge: C) => {
    const { state } = challenge
    const server = useServerSideEvents(ctx)

    const winnerId = standingPlayers(state)[0]
    if (winnerId) state.outcomes[winnerId] = 'won'
    state.finished = true

    await server.updateGameState(game)
    server.emit({ event: 'chain-updated', game }, ctx.eventTarget)

    scheduleSettle(ctx)
  }

  /** Arm the finished round's settle follow-up. Everything is re-derived from
   *  fresh state inside the task, so re-arming (rejoin recovery) is safe: the
   *  `groupAnswers` latch makes any duplicate a no-op. */
  const scheduleSettle = (ctx: ChainContext) => {
    scheduleRevealTask(ctx, async (fresh, freshServer) => {
      const current = spec.current(fresh)
      if (!current?.state.finished) return

      const round = latestRound(fresh)
      // The reveal follow-up fires exactly once: scoring marks the round.
      if (!round || Object.keys(round.groupAnswers).length) return

      const advanced = await settleRoundScores({
        game: fresh,
        round,
        order: current.state.order,
        scores: spec.scores(current),
        maximumPoints: current.maximumPoints,
        answerFor: playerId => ({
          submitted: current.state.named[playerId] ?? [],
          correct: current.state.named[playerId] ?? [],
        }),
      })

      await freshServer.updateGameState(fresh)
      // Not 'group-challenge-scored': its client handler applies only the
      // target player's slice, and this scoring lands for the whole table.
      freshServer.emit({ event: 'chain-updated', game: fresh }, ctx.eventTarget)
      // The advanced seats now owe the table a movement request only a click
      // sends — one cohort cap so a dead tab can't freeze the room here.
      armGroupScoresCaps(ctx, fresh, advanced)
    })
  }

  const handleMove: ChainEngine<C>['handleMove'] = async (ctx, game, eventData, playerId) => {
    const challenge = spec.current(game)
    if (!challenge || challenge.state.finished) return
    const { state } = challenge
    // No moves while the rules card is up — the clock hasn't started.
    if (state.briefing) return
    // No moves during a dead-end hold either. The trapped player still reads
    // as active with a matching turn token, and a submit slipping through
    // would advance the turn — staling the trap's own follow-up while
    // scheduleTimeout refuses to arm during a trap: a permanent freeze.
    if (state.trap) return

    // Only the player on the clock may act, and only for the turn they saw —
    // a retried critical event or a stale client re-send lands after the turn
    // counter moved and must die here, not as a second move.
    if (playerId !== activePlayerId(state)) return
    if (eventData.turn !== state.turn) return
    if (!isValidISOCode(eventData.isoCode)) return

    if (spec.openMoves(challenge, game).includes(eventData.isoCode)) {
      await applyMove(ctx, game, challenge, eventData.isoCode)
    } else {
      await resolveMiss(ctx, game, challenge, 'wrong')
    }
  }

  const handleReady: ChainEngine<C>['handleReady'] = async (ctx, game, playerId) => {
    const challenge = spec.current(game)
    if (!challenge || challenge.state.finished) return
    await applyReady(ctx, game, challenge, playerId)
  }

  /**
   * Re-arm whatever follow-up the live chain round is waiting on. Timers are
   * in-process, so a restart (or a save that threw after the timer was spent)
   * leaves the persisted state pointing at a beat nobody will ever advance —
   * a rejoin is the recovery moment (see rearm-round.ts). Safe to call while
   * the real timer is still alive: every armed task re-reads fresh state and
   * dies on its staleness token.
   */
  const rearm: ChainEngine<C>['rearm'] = (
    ctx,
    game,
    options: RearmOptions = { armBriefingCaps: true }
  ) => {
    const challenge = spec.current(game)
    if (!challenge) return
    // Finished but unsettled — the reveal hold died before banking the table.
    if (challenge.state.finished) return scheduleSettle(ctx)
    if (challenge.state.trap) return scheduleTrapResume(ctx, challenge.state.turn)
    // The one shape a rearm may not touch: a briefing cap while the caller says
    // rules cards are still up (round-1 seam) — close-tutorial owns that arm.
    if (challenge.state.briefing && !options.armBriefingCaps) return
    // Briefing cap or the active player's shot clock, as the state dictates.
    scheduleTimeout(ctx, challenge)
  }

  const engine: ChainEngine<C> = {
    startClock,
    scheduleTimeout,
    handleMove,
    handleReady,
    applyMove,
    resolveMiss,
    rearm,
  }
  return engine
}
