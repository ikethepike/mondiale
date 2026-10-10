import { finalClockDeadline } from '~~/lib/final-timing'
import { gateClockDeadline } from '~~/lib/gate-timing'
import { seatWindowMsFor } from '~~/lib/round-beats'
import { latestRound } from '~~/lib/rounds'
import type { Game } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'
import { defineGameHandler } from '../server-side'
import { advanceSeat } from './seat-cursor'
import { commitSeat } from './seat-exits'

/** Where the seat's clock ends if it starts now, on the step it is on. */
const releasedDeadline = (game: Game, player: Player, now: number): number | undefined => {
  const challenge = player.moves[0]?.challenge
  switch (player.cursor.step) {
    case 'round': {
      const round = latestRound(game)
      const windowMs = seatWindowMsFor(round?.groupChallenge)
      // The seat's window never outlives the round: the settle backstop runs
      // off the round's own close, and a seat still counting down past it would
      // be swept to a zero mid-clock.
      const closesAt = round?.deadline ?? Infinity
      if (!windowMs || now >= closesAt) return undefined
      return Math.min(now + windowMs, closesAt)
    }
    case 'gate':
      return challenge?._type === 'individual-challenge'
        ? gateClockDeadline(challenge, now)
        : undefined
    case 'final':
      return challenge?._type === 'final-challenge'
        ? finalClockDeadline(challenge.challenges[0], game.difficulty, now)
        : undefined
    default:
      return undefined
  }
}

/**
 * A seat started its own clock — an audio round's play tap (iOS refuses
 * autoplay), Empire's buzz into its tap beat, or a gate's or the gauntlet's
 * opening card dismissed early. The stamp only ever moves EARLIER: an unstamped
 * window opens, a full-card deadline is pulled in to the tap, and a repeat
 * (or a redelivery) computes a later end and changes nothing.
 */
export const roundPlayHandler = defineGameHandler(
  'round-play',
  async ({ game, player, server, eventData, eventTarget }) => {
    const { cursor } = player
    if (eventData.subject !== cursor.subject) {
      return server.emit({ event: 'update', game }, eventTarget)
    }
    const deadline = releasedDeadline(game, player, Date.now())
    if (deadline === undefined) return
    if (cursor.deadline !== undefined && deadline >= cursor.deadline) return
    advanceSeat(
      game,
      player,
      { step: cursor.step, subject: cursor.subject, deadline },
      'event:round-play'
    )
    await commitSeat(server, game, player)
  }
)
