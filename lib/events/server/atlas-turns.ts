import { drawLabel, recordedDraw } from './draws'
import {
  atlasBuildTrap,
  atlasLiveMoves,
  atlasRecordSpelling,
  atlasTrapBounty,
  atlasTurnSeconds,
  atlasWalked,
  pickAtlasReseed,
} from '~~/lib/atlas-chain'
import { scoreChainRound } from '~~/lib/chain'
import { ROUND_BEATS } from '~~/lib/round-beats'
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
    briefingCapMs: ROUND_BEATS.atlas.briefingCapMs,
    buildTrap: (challenge, game, trappedId, byPlayerId) =>
      atlasBuildTrap(challenge.state, game, trappedId, byPlayerId),
    admitMove: (challenge, isoCode, typed) => atlasRecordSpelling(challenge.state, isoCode, typed),
    reseed: (challenge, game) =>
      recordedDraw(game, drawLabel.chainSeed(), () =>
        pickAtlasReseed(game, atlasWalked(challenge.state))
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
export const applyAtlasMove: Engine['applyMove'] = (ctx, game, challenge, isoCode, typed) =>
  engine().applyMove(ctx, game, challenge, isoCode, typed)
export const rearmAtlasChain: Engine['rearm'] = (ctx, game, options) =>
  engine().rearm(ctx, game, options)
