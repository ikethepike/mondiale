import { seatWindowMsFor } from '~~/lib/round-beats'
import { latestRound } from '~~/lib/rounds'
import { defineGameHandler } from '../server-side'
import { advanceSeat } from './seat-cursor'
import { commitSeat } from './seat-exits'

/**
 * A seat opened its own timed window — an audio round's play tap (iOS refuses
 * autoplay), Empire's buzz into its tap beat. The seat's deadline is stamped
 * here, once, from the moment the server hears it; the view counts that
 * stamp down.
 */
export const roundPlayHandler = defineGameHandler(
  'round-play',
  async ({ game, player, server, eventData, eventTarget }) => {
    const { cursor } = player
    if (cursor.step !== 'round' || eventData.subject !== cursor.subject) {
      return server.emit({ event: 'update', game }, eventTarget)
    }
    if (cursor.deadline !== undefined) return
    const windowMs = seatWindowMsFor(latestRound(game)?.groupChallenge)
    if (!windowMs) return
    advanceSeat(
      game,
      player,
      { step: 'round', subject: cursor.subject, deadline: Date.now() + windowMs },
      'event:round-play'
    )
    await commitSeat(server, game, player)
  }
)
