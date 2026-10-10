import { defineGameHandler } from '../server-side'
import { commitSeat, resolveGateVerdict } from './seat-exits'

/**
 * A browsable gate reveal's explicit exit: end the verdict hold now instead
 * of waiting out the browse cap. Only a browsable verdict on the echoed
 * subject qualifies, so a late Continue can never cut any other beat short.
 */
export const gateRevealDoneHandler = defineGameHandler(
  'gate-reveal-done',
  async ({ game, player, server, eventData }) => {
    const { cursor } = player
    if (cursor.step !== 'gate-verdict' || eventData.subject !== cursor.subject) return
    if (cursor.verdict?.kind !== 'gate' || !cursor.verdict.browsable) return
    resolveGateVerdict(game, player, 'event:gate-reveal-done')
    await commitSeat(server, game, player)
  }
)
