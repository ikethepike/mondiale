import { chainHead, closedDoors, openMoves, pickChainSeed, scoreChainRound } from '~~/lib/chain'
import { isChallengeOfType, latestChallengeOfType } from '~~/lib/rounds'
import type { BorderChainChallenge } from '~~/types/challenges/group-modes.type'
import type { Game } from '~~/types/game.types'
import { createChainEngine, type ChainEngine } from './chain-engine'

/**
 * Border Chain's slice of the turn-chain engine (chain-engine.ts): the border
 * graph is the link rule, the closed-door ledger is the dead-end proof, and
 * everything rhythmic — turns, strikes, traps, settle — is the shared core
 * Atlas rides too.
 */

export type { ChainContext } from './chain-engine'

export const isBorderChainChallenge = (challenge: unknown): challenge is BorderChainChallenge =>
  isChallengeOfType(challenge, 'border-chain-challenge')

/** The live round's chain challenge, when the live round is one. */
export const currentBorderChain = (game: Game): BorderChainChallenge | undefined =>
  latestChallengeOfType(game, 'border-chain-challenge')

/**
 * Lazy: the import graph carries a cycle (chain-engine → seat-exits →
 * close-tutorial → the engines), which is harmless as bindings but fatal as
 * an eval-time call — a module mid-cycle would invoke createChainEngine
 * before it exists. First use is always long after every module settled.
 */
let instance: ChainEngine<BorderChainChallenge> | undefined
const engine = (): ChainEngine<BorderChainChallenge> =>
  (instance ??= createChainEngine<BorderChainChallenge>({
    current: currentBorderChain,
    openMoves: (challenge, game) => openMoves(challenge.state, game),
    buildTrap: (challenge, game, trappedId, byPlayerId) => ({
      playerId: trappedId,
      head: chainHead(challenge.state)!,
      byPlayerId,
      doors: closedDoors(challenge.state, game),
    }),
    // Fresh ground for the survivors — never a country already walked.
    reseed: (challenge, game) =>
      pickChainSeed(game, new Set(challenge.state.chains.flat())) ?? pickChainSeed(game),
    scores: scoreChainRound,
  }))

type Engine = ChainEngine<BorderChainChallenge>
export const startChainClock: Engine['startClock'] = challenge => engine().startClock(challenge)
export const scheduleChainTimeout: Engine['scheduleTimeout'] = (ctx, challenge) =>
  engine().scheduleTimeout(ctx, challenge)
export const handleBorderChainMove: Engine['handleMove'] = (ctx, game, eventData, playerId) =>
  engine().handleMove(ctx, game, eventData, playerId)
export const handleBorderChainReady: Engine['handleReady'] = (ctx, game, playerId) =>
  engine().handleReady(ctx, game, playerId)
export const applyChainMove: Engine['applyMove'] = (ctx, game, challenge, isoCode) =>
  engine().applyMove(ctx, game, challenge, isoCode)
export const resolveChainMiss: Engine['resolveMiss'] = (ctx, game, challenge, kind) =>
  engine().resolveMiss(ctx, game, challenge, kind)
export const rearmBorderChain: Engine['rearm'] = (ctx, game, options) =>
  engine().rearm(ctx, game, options)
