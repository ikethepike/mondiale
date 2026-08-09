import {
  ATLAS_TABLE_SEED_OPTIONS,
  atlasContinuations,
  atlasTailLetter,
  pickAtlasSeed,
} from '~~/lib/atlas-chain'
import { chainHead, scoreChainRound } from '~~/lib/chain'
import { playableWorldCountries } from '~~/lib/game-rules'
import { isChallengeOfType, latestChallengeOfType } from '~~/lib/rounds'
import type { AtlasChallenge } from '~~/types/challenges/group-modes.type'
import type { Game } from '~~/types/game.types'
import { createChainEngine, type ChainEngine } from './chain-engine'

/**
 * Atlas's slice of the turn-chain engine (chain-engine.ts): the letter rule
 * from lib/atlas-chain is the link rule, an exhausted opening letter is the
 * dead-end proof, and the rhythm is Border Chain's shared core.
 *
 * Unlike the border graph, the classic game forbids repeats for the WHOLE
 * round — `used` spans every chain walked, not just the live one — and the
 * board is always the world pool: the letters game is global by nature.
 */

export const isAtlasChallenge = (challenge: unknown): challenge is AtlasChallenge =>
  isChallengeOfType(challenge, 'atlas-challenge')

/** The live round's atlas challenge, when the live round is one. */
export const currentAtlasChain = (game: Game): AtlasChallenge | undefined =>
  latestChallengeOfType(game, 'atlas-challenge')

const usedOf = (challenge: AtlasChallenge) => challenge.state.chains.flat()
const rule = (challenge: AtlasChallenge) => ({ overlaps: challenge.overlaps })

/** Lazy for the same cycle reason as chain-turns — see its note. */
let instance: ChainEngine<AtlasChallenge> | undefined
const engine = (): ChainEngine<AtlasChallenge> =>
  (instance ??= createChainEngine<AtlasChallenge>({
    current: currentAtlasChain,
    openMoves: (challenge, game) => {
      const head = chainHead(challenge.state)
      if (!head) return []
      return atlasContinuations(
        head,
        usedOf(challenge),
        playableWorldCountries(game),
        rule(challenge)
      )
    },
    buildTrap: (challenge, game, trappedId, byPlayerId) => {
      const head = chainHead(challenge.state)!
      const used = new Set(usedOf(challenge))
      // The proof: every country that chains from the head is already walked.
      const spent = atlasContinuations(
        head,
        [],
        playableWorldCountries(game),
        rule(challenge)
      ).filter(isoCode => used.has(isoCode))
      return { playerId: trappedId, head, byPlayerId, letter: atlasTailLetter(head), spent }
    },
    reseed: (challenge, game) =>
      pickAtlasSeed(game, {
        minOptions: ATLAS_TABLE_SEED_OPTIONS,
        exclude: new Set(usedOf(challenge)),
      }) ?? pickAtlasSeed(game, { minOptions: ATLAS_TABLE_SEED_OPTIONS }),
    // Sheer elimination on hard: placement is everything, no link consolation —
    // the same difficulty flag that widens the rule narrows the payout.
    scores: challenge => scoreChainRound(challenge, challenge.overlaps ? 1 : undefined),
  }))

type Engine = ChainEngine<AtlasChallenge>
export const startAtlasClock: Engine['startClock'] = challenge => engine().startClock(challenge)
export const scheduleAtlasTimeout: Engine['scheduleTimeout'] = (ctx, challenge) =>
  engine().scheduleTimeout(ctx, challenge)
export const handleAtlasChainMove: Engine['handleMove'] = (ctx, game, eventData, playerId) =>
  engine().handleMove(ctx, game, eventData, playerId)
export const handleAtlasChainReady: Engine['handleReady'] = (ctx, game, playerId) =>
  engine().handleReady(ctx, game, playerId)
export const rearmAtlasChain: Engine['rearm'] = (ctx, game, options) =>
  engine().rearm(ctx, game, options)
