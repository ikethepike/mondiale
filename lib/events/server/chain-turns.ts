import {
  activePlayerId,
  chainHead,
  closedDoors,
  liveChain,
  openMoves,
  pickChainSeed,
  scoreBorderChain,
  standingPlayers,
} from '~~/lib/chain'
import type { BorderChainChallenge, BorderChainOutcome } from '~~/types/challenges/group-modes.type'
import type { Game } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'
import { useServerSideEvents } from '../server-side'
import { BRIEFING_CAP_MS, FIRST_TURN_GRACE_MS, TIMEOUT_SLACK_MS, TRAP_HOLD_MS } from '~~/lib/round-beats'
import { isChallengeOfType, latestChallengeOfType, latestRound } from '~~/lib/rounds'
import {
  scheduleDeadlineTask,
  scheduleEngineTask,
  scheduleRevealTask,
  settleRoundScores,
  type EngineContext,
  type RearmOptions,
} from './round-engine'
import { armGroupScoresCap } from './seat-exits'

/**
 * Border Chain's turn engine. The game's only turn-based round: state lives on
 * the challenge payload inside the current round, every mutation runs inside
 * the per-game queue, and the per-turn shot clock follows the codebase's
 * timer-outside-the-queue pattern (enter-movement-phase) — a setTimeout holds
 * no lock, and the state's `turn` counter is the token that makes a stale
 * timeout a no-op.
 */

/** Alias kept for the sibling engines that import it. */
export type ChainContext = EngineContext

export const isBorderChainChallenge = (challenge: unknown): challenge is BorderChainChallenge =>
  isChallengeOfType(challenge, 'border-chain-challenge')

/** The live round's chain challenge, when the live round is one. */
export const currentBorderChain = (game: Game): BorderChainChallenge | undefined =>
  latestChallengeOfType(game, 'border-chain-challenge')

const stampDeadline = (challenge: BorderChainChallenge) => {
  challenge.state.deadline = Date.now() + challenge.turnSeconds * 1000
}

/** Pass the clock to the next standing player. */
const advanceTurn = (challenge: BorderChainChallenge) => {
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
  challenge: BorderChainChallenge,
  playerId: string,
  outcome: BorderChainOutcome,
  outs: ISOCountryCode[]
) => {
  const { state } = challenge
  state.eliminated.push(playerId)
  state.outcomes[playerId] = outcome
  state.missedOuts[playerId] = outs
}

/**
 * Kick off the revealed round: stamp the first deadline (call BEFORE the
 * caller saves/emits so clients see a live clock). While the briefing holds,
 * the deadline stays 0 — the first shot clock stamps when the table is ready.
 */
export const startChainClock = (challenge: BorderChainChallenge) => {
  if (challenge.state.briefing) return
  stampDeadline(challenge)
  challenge.state.deadline += FIRST_TURN_GRACE_MS
}

/** … then arm the clock (call AFTER the save — the fired task re-reads fresh
 *  state). During the briefing that clock is the reading cap; after it, the
 *  active player's shot clock. */
export const scheduleChainTimeout = (ctx: ChainContext, challenge: BorderChainChallenge) => {
  // A dead-end hold owns the table; the trap's own follow-up re-arms the clock.
  if (challenge.state.trap) return
  if (challenge.state.briefing) {
    scheduleEngineTask(ctx, BRIEFING_CAP_MS, async game => {
      const current = currentBorderChain(game)
      if (!current || current.state.finished || !current.state.briefing) return
      await beginChain(ctx, game, current)
    })
    return
  }
  const { turn, deadline } = challenge.state
  scheduleDeadlineTask(ctx, deadline, async game => {
    const current = currentBorderChain(game)
    // A move, strike, or finish advanced the state — this timeout is stale.
    if (!current || current.state.finished || current.state.turn !== turn) return
    await resolveChainMiss(ctx, game, current, 'timeout')
  })
}

/** A player dismissed their briefing card. Idempotent; the last ready (or
 *  the cap) starts the opening shot clock. */
export const applyChainReady = async (
  ctx: ChainContext,
  game: Game,
  challenge: BorderChainChallenge,
  playerId: string
) => {
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
const beginChain = async (ctx: ChainContext, game: Game, challenge: BorderChainChallenge) => {
  challenge.state.briefing = false
  stampDeadline(challenge)
  challenge.state.deadline += FIRST_TURN_GRACE_MS
  const server = useServerSideEvents(ctx)
  await server.updateGameState(game)
  server.emit({ event: 'chain-updated', game }, ctx.eventTarget)
  scheduleChainTimeout(ctx, challenge)
}

/**
 * The active player named a legal country: extend the chain, then check the
 * NEXT player isn't walking into a dead end — a headless turn is a trap, the
 * trapped player is out, and (with two or more still standing) a fresh chain
 * keeps the round going.
 */
export const applyChainMove = async (
  ctx: ChainContext,
  game: Game,
  challenge: BorderChainChallenge,
  isoCode: ISOCountryCode
) => {
  const { state } = challenge
  const moverId = activePlayerId(state)

  liveChain(state).push(isoCode)
  ;(state.named[moverId] ??= []).push(isoCode)
  state.lastMoverId = moverId
  advanceTurn(challenge)

  if (openMoves(state, game).length === 0) {
    return springTrap(ctx, game, challenge)
  }

  await commitChainTurn(ctx, game, challenge)
}

/**
 * A headless turn. The trapped player never held the clock, so nothing on their
 * screen could explain the elimination — the whole table holds on the closed
 * doors instead, and the fresh chain waits for the hold to elapse. Capturing
 * `doors` here is the point: once a new chain is pushed, the dead head is no
 * longer live and the proof is unrecoverable.
 */
const springTrap = async (ctx: ChainContext, game: Game, challenge: BorderChainChallenge) => {
  const { state } = challenge
  const trappedId = activePlayerId(state)
  const head = chainHead(state)

  eliminate(challenge, trappedId, 'trapped', [])
  const byPlayerId =
    state.lastMoverId && state.lastMoverId !== trappedId ? state.lastMoverId : undefined
  if (byPlayerId) (state.trappedBy ??= {})[trappedId] = byPlayerId

  state.trap = { playerId: trappedId, head: head!, byPlayerId, doors: closedDoors(state, game) }
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
    const current = currentBorderChain(fresh)
    if (!current?.state.trap || current.state.finished) return
    if (current.state.turn !== heldTurn) return
    await resumeFromTrap(ctx, fresh, current)
  })
}

/**
 * The dead-end hold elapsed: close the round if the trap left one player, else
 * deal fresh ground. A seed guarantees MINIMUM_SEED_MOVES outs, so a second
 * trap here is near-impossible — but the check the old inline loop provided is
 * kept, and a chained trap simply holds again rather than slipping through.
 */
const resumeFromTrap = async (ctx: ChainContext, game: Game, challenge: BorderChainChallenge) => {
  const { state } = challenge
  state.trap = undefined

  if (standingPlayers(state).length <= 1) {
    return finishChainRound(ctx, game, challenge)
  }

  // Fresh ground for the survivors — never a country already walked.
  const walked = new Set(state.chains.flat())
  const seed = pickChainSeed(game, walked) ?? pickChainSeed(game)
  if (!seed) return finishChainRound(ctx, game, challenge)
  state.chains.push([seed])
  advanceTurn(challenge)

  if (openMoves(state, game).length === 0) {
    return springTrap(ctx, game, challenge)
  }

  await commitChainTurn(ctx, game, challenge)
}

/** A wrong answer or an expired clock — burn a strike or eliminate. */
export const resolveChainMiss = async (
  ctx: ChainContext,
  game: Game,
  challenge: BorderChainChallenge,
  kind: 'wrong' | 'timeout'
) => {
  const { state } = challenge
  const missedId = activePlayerId(state)

  if ((state.strikesLeft[missedId] ?? 0) > 0) {
    state.strikesLeft[missedId]--
  } else {
    eliminate(challenge, missedId, kind, openMoves(state, game))
    if (standingPlayers(state).length <= 1) {
      return finishChainRound(ctx, game, challenge)
    }
  }

  // The chain itself is untouched by a miss, so the next player can never be
  // trapped here — the head had open moves a moment ago.
  advanceTurn(challenge)
  await commitChainTurn(ctx, game, challenge)
}

const commitChainTurn = async (ctx: ChainContext, game: Game, challenge: BorderChainChallenge) => {
  const server = useServerSideEvents(ctx)
  await server.updateGameState(game)
  server.emit({ event: 'chain-updated', game }, ctx.eventTarget)
  scheduleChainTimeout(ctx, challenge)
}

/**
 * One player left standing: freeze the state for the reveal beat, then score
 * everyone and hand out board moves through the same conversion the submit
 * path uses.
 */
const finishChainRound = async (ctx: ChainContext, game: Game, challenge: BorderChainChallenge) => {
  const { state } = challenge
  const server = useServerSideEvents(ctx)

  const winnerId = standingPlayers(state)[0]
  if (winnerId) state.outcomes[winnerId] = 'won'
  state.finished = true

  await server.updateGameState(game)
  server.emit({ event: 'chain-updated', game }, ctx.eventTarget)

  scheduleChainSettle(ctx)
}

/** Arm the finished round's settle follow-up. Everything is re-derived from
 *  fresh state inside the task, so re-arming (rejoin recovery) is safe: the
 *  `groupAnswers` latch makes any duplicate a no-op. */
const scheduleChainSettle = (ctx: ChainContext) => {
  scheduleRevealTask(ctx, async (fresh, freshServer) => {
    const current = currentBorderChain(fresh)
    if (!current?.state.finished) return

    const round = latestRound(fresh)
    // The reveal follow-up fires exactly once: scoring marks the round.
    if (!round || Object.keys(round.groupAnswers).length) return

    const advanced = await settleRoundScores({
      game: fresh,
      round,
      order: current.state.order,
      scores: scoreBorderChain(current),
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
    // Every advanced seat now owes the table a movement request only a
    // click sends — cap each so a dead tab can't freeze the room here.
    for (const playerId of advanced) {
      const seat = fresh.players[playerId]
      if (seat) armGroupScoresCap(ctx, seat)
    }
  })
}

/**
 * Re-arm whatever follow-up the live chain round is waiting on. Timers are
 * in-process, so a restart (or a save that threw after the timer was spent)
 * leaves the persisted state pointing at a beat nobody will ever advance —
 * a rejoin is the recovery moment (see rearm-round.ts). Safe to call while
 * the real timer is still alive: every armed task re-reads fresh state and
 * dies on its staleness token.
 */
export const rearmBorderChain = (
  ctx: ChainContext,
  game: Game,
  options: RearmOptions = { armBriefingCaps: true }
) => {
  const challenge = currentBorderChain(game)
  if (!challenge) return
  // Finished but unsettled — the reveal hold died before banking the table.
  if (challenge.state.finished) return scheduleChainSettle(ctx)
  if (challenge.state.trap) return scheduleTrapResume(ctx, challenge.state.turn)
  // The one shape a rearm may not touch: a briefing cap while the caller says
  // rules cards are still up (round-1 seam) — close-tutorial owns that arm.
  if (challenge.state.briefing && !options.armBriefingCaps) return
  // Briefing cap or the active player's shot clock, as the state dictates.
  scheduleChainTimeout(ctx, challenge)
}
