import { defineGameHandler } from '../server-side'
import { applyTerraReady, currentTerraIncognita } from './terra-beats'

export const terraReadyHandler = defineGameHandler(
  'terra-ready',
  async ({ game, eventTarget, io, redis, socket }) => {
    const challenge = currentTerraIncognita(game)
    if (!challenge) return

    await applyTerraReady({ io, redis, socket, eventTarget }, game, challenge, eventTarget.playerId)
  }
)
