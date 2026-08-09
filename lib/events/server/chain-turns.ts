import {
  chainHead,
  closedDoors,
  openMoves,
  pickChainSeed,
  scoreChainRound,
} from '~~/lib/chain'
import { isChallengeOfType, latestChallengeOfType } from '~~/lib/rounds'
import type { BorderChainChallenge } from '~~/types/challenges/group-modes.type'
import type { Game } from '~~/types/game.types'
import { createChainEngine } from './chain-engine'

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

const engine = createChainEngine<BorderChainChallenge>({
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
})

export const startChainClock = engine.startClock
export const scheduleChainTimeout = engine.scheduleTimeout
export const handleBorderChainMove = engine.handleMove
export const handleBorderChainReady = engine.handleReady
export const applyChainMove = engine.applyMove
export const resolveChainMiss = engine.resolveMiss
export const rearmBorderChain = engine.rearm
