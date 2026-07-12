import { activePlayerId, openMoves } from '~~/lib/chain'
import { isValidISOCode } from '~~/types/geography.types'
import { defineGameHandler } from '../server-side'
import { applyChainMove, currentBorderChain, resolveChainMiss } from './chain-turns'

export const submitChainMoveHandler = defineGameHandler(
  'submit-chain-move',
  async ({ game, eventData, eventTarget, io, redis, socket }) => {
    const challenge = currentBorderChain(game)
    if (!challenge || challenge.state.finished) return
    const { state } = challenge

    // Only the player on the clock may act, and only for the turn they saw —
    // a retried critical event or a stale client re-send lands after the turn
    // counter moved and must die here, not as a second move.
    if (eventTarget.playerId !== activePlayerId(state)) return
    if (eventData.turn !== state.turn) return
    if (!isValidISOCode(eventData.isoCode)) return

    const ctx = { io, redis, socket, eventTarget }
    if (openMoves(state, game.variant).includes(eventData.isoCode)) {
      await applyChainMove(ctx, game, challenge, eventData.isoCode)
    } else {
      await resolveChainMiss(ctx, game, challenge, 'wrong')
    }
  }
)
