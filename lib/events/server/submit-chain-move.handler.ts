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
    // No moves while the rules card is up — the clock hasn't started.
    if (state.briefing) return
    // No moves during a dead-end hold either. The trapped player still reads
    // as active with a matching turn token, and a submit slipping through
    // would advance the turn — staling the trap's own follow-up while
    // scheduleChainTimeout refuses to arm during a trap: a permanent freeze.
    if (state.trap) return

    // Only the player on the clock may act, and only for the turn they saw —
    // a retried critical event or a stale client re-send lands after the turn
    // counter moved and must die here, not as a second move.
    if (eventTarget.playerId !== activePlayerId(state)) return
    if (eventData.turn !== state.turn) return
    if (!isValidISOCode(eventData.isoCode)) return

    const ctx = { io, redis, socket, eventTarget }
    if (openMoves(state, game).includes(eventData.isoCode)) {
      await applyChainMove(ctx, game, challenge, eventData.isoCode)
    } else {
      await resolveChainMiss(ctx, game, challenge, 'wrong')
    }
  }
)
