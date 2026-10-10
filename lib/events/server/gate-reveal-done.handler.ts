import { defineGameHandler } from '../server-side'
import { commitSeat, resolveGateVerdict } from './seat-exits'

/**
 * A browsable gate reveal's explicit exit: end the verdict hold now instead
 * of waiting out the browse cap. Only a browsable verdict on the echoed
 * subject qualifies, so a late Continue can never cut any other beat short.
 */
export const gateRevealDoneHandler = defineGameHandler(
  'gate-reveal-done',
  async ({ game, player, server, eventData, eventTarget }) => {
    const { cursor } = player
    if (eventData.subject !== cursor.subject) {
      return server.emit({ event: 'update', game }, eventTarget)
    }
    if (cursor.step !== 'gate-verdict') return
    if (cursor.verdict?.kind !== 'gate' || !cursor.verdict.browsable) return
    resolveGateVerdict(game, player, 'event:gate-reveal-done')
    await commitSeat(server, game, player)
  }
)
