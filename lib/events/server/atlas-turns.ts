import { drawLabel, recordedDraw } from './draws'
import {
  ATLAS_TABLE_SEED_OPTIONS,
  atlasLiveMoves,
  atlasTrapBounty,
  atlasTrapProof,
  atlasTurnSeconds,
  atlasWalked,
  pickAtlasSeed,
} from '~~/lib/atlas-chain'
import { chainHead, scoreChainRound } from '~~/lib/chain'
import { playableWorldCountries } from '~~/lib/game-rules'
import { isChallengeOfType, latestChallengeOfType } from '~~/lib/rounds'
import type { AtlasChallenge } from '~~/types/challenges/group-modes.type'
import type { Game } from '~~/types/game.types'
import { createChainEngine, type ChainEngine } from './chain-engine'

/**
 * Atlas's slice of the turn-chain engine (chain-engine.ts): the link rule
 * from lib/atlas-chain is the link rule, an exhausted head is the dead-end
 * proof, and the rhythm is Border Chain's shared core.
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

/** The mode's legal extensions — shared with the bot brain so a bot's options
 *  and the engine's verdicts can never drift. */
export const atlasOpenMoves = (challenge: AtlasChallenge, game: Game) =>
  atlasLiveMoves(challenge.state, game)

/** Lazy for the same cycle reason as chain-turns — see its note. */
let instance: ChainEngine<AtlasChallenge> | undefined
const engine = (): ChainEngine<AtlasChallenge> =>
  (instance ??= createChainEngine<AtlasChallenge>({
    current: currentAtlasChain,
    openMoves: atlasOpenMoves,
    turnSeconds: atlasTurnSeconds,
    buildTrap: (challenge, game, trappedId, byPlayerId) => {
      const head = chainHead(challenge.state)!
      const proof = atlasTrapProof(head, atlasWalked(challenge.state), playableWorldCountries(game))
      return { playerId: trappedId, head, byPlayerId, ...proof }
    },
    reseed: (challenge, game) =>
      recordedDraw(
        game,
        drawLabel.chainSeed(),
        () =>
          pickAtlasSeed(game, {
            minOptions: ATLAS_TABLE_SEED_OPTIONS,
            exclude: new Set(atlasWalked(challenge.state)),
          }) ?? pickAtlasSeed(game, { minOptions: ATLAS_TABLE_SEED_OPTIONS })
      ),
    scores: challenge =>
      scoreChainRound(
        challenge,
        challenge.placementOnly ? 1 : undefined,
        atlasTrapBounty(challenge.state)
      ),
  }))

type Engine = ChainEngine<AtlasChallenge>
export const startAtlasClock: Engine['startClock'] = challenge => engine().startClock(challenge)
export const scheduleAtlasTimeout: Engine['scheduleTimeout'] = (ctx, challenge) =>
  engine().scheduleTimeout(ctx, challenge)
export const handleAtlasChainMove: Engine['handleMove'] = (ctx, game, eventData, playerId) =>
  engine().handleMove(ctx, game, eventData, playerId)
export const handleAtlasChainReady: Engine['handleReady'] = (ctx, game, playerId) =>
  engine().handleReady(ctx, game, playerId)
export const handleAtlasRipCord: Engine['handleRipCord'] = (ctx, game, eventData, playerId) =>
  engine().handleRipCord(ctx, game, eventData, playerId)
export const applyAtlasMove: Engine['applyMove'] = (ctx, game, challenge, isoCode) =>
  engine().applyMove(ctx, game, challenge, isoCode)
export const rearmAtlasChain: Engine['rearm'] = (ctx, game, options) =>
  engine().rearm(ctx, game, options)
