import { isBrowsableRound } from '~~/lib/round-beats'
import { latestRound } from '~~/lib/rounds'
import { defineGameHandler } from '../server-side'
import { commitSeat, enterScores } from './seat-exits'

/**
 * A browsable round reveal's explicit exit: end the verdict hold now instead
 * of waiting out the browse cap. Only a browsable kind's verdict on the echoed
 * subject qualifies, so a late Continue can never cut any other beat short.
 */
export const roundRevealDoneHandler = defineGameHandler(
  'round-reveal-done',
  async ({ game, player, server, eventData, eventTarget }) => {
    const { cursor } = player
    if (eventData.subject !== cursor.subject) {
      return server.emit({ event: 'update', game }, eventTarget)
    }
    if (cursor.step !== 'round-verdict') return
    if (cursor.verdict?.kind !== 'round') return
    if (!isBrowsableRound(latestRound(game)?.groupChallenge)) return
    await enterScores(game, player, cursor.verdict.scored, 'event:round-reveal-done')
    await commitSeat(server, game, player)
  }
)
