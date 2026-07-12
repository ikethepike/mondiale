import {
  activePlayerId,
  chainHead,
  liveChain,
  openMoves,
  pickChainSeed,
  scoreBorderChain,
  standingPlayers,
} from '~~/lib/chain'
import type { BorderChainChallenge, BorderChainOutcome } from '~~/types/challenges/group-modes.type'
import type { Game } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'
import {
  enqueueGameTask,
  useServerSideEvents,
  type GameServer,
  type GameSocket,
} from '../server-side'
import { movesForScoredPoints } from './moves'
import type { ClientEventTarget } from '~~/types/events.types'
import type { Redis } from '@upstash/redis'

/**
 * Border Chain's turn engine. The game's only turn-based round: state lives on
 * the challenge payload inside the current round, every mutation runs inside
 * the per-game queue, and the per-turn shot clock follows the codebase's
 * timer-outside-the-queue pattern (enter-movement-phase) — a setTimeout holds
 * no lock, and the state's `turn` counter is the token that makes a stale
 * timeout a no-op.
 */

/** Post-round basking time before scores, matching the challenge handlers' 5s. */
const REVEAL_HOLD_MS = 6000
/** Buzzer grace so an on-the-wire move beats its own turn's timeout. */
const TIMEOUT_SLACK_MS = 350

export interface ChainContext {
  io: GameServer
  redis: Redis
  socket: GameSocket
  eventTarget: ClientEventTarget
}

export const isBorderChainChallenge = (
  challenge: unknown
): challenge is BorderChainChallenge =>
  !!challenge &&
  typeof challenge === 'object' &&
  '_type' in challenge &&
  challenge._type === 'border-chain-challenge'

/** The live round's chain challenge, when the live round is one. */
export const currentBorderChain = (game: Game): BorderChainChallenge | undefined => {
  const challenge = game.rounds[game.rounds.length - 1]?.groupChallenge
  return isBorderChainChallenge(challenge) ? challenge : undefined
}

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

/** Extra opening-turn time — the first player's clock starts behind the
 *  round interstitial, which everyone watches for a few seconds. */
const FIRST_TURN_GRACE_MS = 4000

/**
 * Kick off the revealed round: stamp the first deadline (call BEFORE the
 * caller saves/emits so clients see a live clock) …
 */
export const startChainClock = (challenge: BorderChainChallenge) => {
  stampDeadline(challenge)
  challenge.state.deadline += FIRST_TURN_GRACE_MS
}

/** … then arm the shot clock (call AFTER the save — it re-reads fresh state). */
export const scheduleChainTimeout = (ctx: ChainContext, challenge: BorderChainChallenge) => {
  const { turn, deadline } = challenge.state
  const delay = Math.max(0, deadline - Date.now()) + TIMEOUT_SLACK_MS
  setTimeout(() => {
    enqueueGameTask(ctx.eventTarget.gameId, async () => {
      const server = useServerSideEvents(ctx)
      const game = await server.fetchGame(ctx.eventTarget.gameId)
      if (!game) return
      const current = currentBorderChain(game)
      // A move, strike, or finish advanced the state — this timeout is stale.
      if (!current || current.state.finished || current.state.turn !== turn) return
      await resolveChainMiss(ctx, game, current, 'timeout')
    })
  }, delay)
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

  while (openMoves(state, game.variant).length === 0) {
    const trappedId = activePlayerId(state)
    eliminate(challenge, trappedId, 'trapped', [])
    if (state.lastMoverId && state.lastMoverId !== trappedId) {
      ;(state.trappedBy ??= {})[trappedId] = state.lastMoverId
    }

    if (standingPlayers(state).length <= 1) {
      return finishChainRound(ctx, game, challenge)
    }

    // Fresh ground for the survivors — never a country already walked.
    const walked = new Set(state.chains.flat())
    const seed = pickChainSeed(game.variant, walked) ?? pickChainSeed(game.variant)
    if (!seed) return finishChainRound(ctx, game, challenge)
    state.chains.push([seed])
    advanceTurn(challenge)
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
    eliminate(challenge, missedId, kind, openMoves(state, game.variant))
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
const finishChainRound = async (
  ctx: ChainContext,
  game: Game,
  challenge: BorderChainChallenge
) => {
  const { state } = challenge
  const server = useServerSideEvents(ctx)

  const winnerId = standingPlayers(state)[0]
  if (winnerId) state.outcomes[winnerId] = 'won'
  state.finished = true

  await server.updateGameState(game)
  server.emit({ event: 'chain-updated', game }, ctx.eventTarget)

  setTimeout(() => {
    enqueueGameTask(ctx.eventTarget.gameId, async () => {
      const fresh = await server.fetchGame(ctx.eventTarget.gameId)
      if (!fresh) return
      const current = currentBorderChain(fresh)
      if (!current?.state.finished) return

      const round = fresh.rounds[fresh.rounds.length - 1]
      // The reveal follow-up fires exactly once: scoring marks the round.
      if (Object.keys(round.groupAnswers).length) return

      const scores = scoreBorderChain(current)
      for (const playerId of current.state.order) {
        const player = fresh.players[playerId]
        const scoring = scores[playerId] ?? { scored: 0, maximum: current.maximumPoints }
        round.groupAnswers[playerId] = {
          submitted: current.state.named[playerId] ?? [],
          correct: current.state.named[playerId] ?? [],
        }
        round.playerTurns[playerId] = { points: scoring }
        if (player && player.phase === 'group-challenge') {
          player.phase = 'group-scores'
          player.moves = movesForScoredPoints({ game: fresh, player, scored: scoring.scored })
        }
      }

      await server.updateGameState(fresh)
      // Not 'group-challenge-scored': its client handler applies only the
      // target player's slice, and this scoring lands for the whole table.
      server.emit({ event: 'chain-updated', game: fresh }, ctx.eventTarget)
    })
  }, REVEAL_HOLD_MS)
}

/** Reveal-path entry (enter-movement-phase): sanity-recheck the opening head. */
export const chainHasOpenStart = (challenge: BorderChainChallenge, game: Game): boolean =>
  !!chainHead(challenge.state) && openMoves(challenge.state, game.variant).length > 0
