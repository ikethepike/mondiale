import { defineGameHandler } from '../server-side'
import { applyChainReady, currentBorderChain } from './chain-turns'

export const chainReadyHandler = defineGameHandler(
  'chain-ready',
  async ({ game, eventTarget, io, redis, socket }) => {
    const challenge = currentBorderChain(game)
    if (!challenge || challenge.state.finished) return

    await applyChainReady({ io, redis, socket, eventTarget }, game, challenge, eventTarget.playerId)
  }
)
