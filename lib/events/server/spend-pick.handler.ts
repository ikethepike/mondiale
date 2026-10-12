import { attemptBoardOf } from '~~/lib/attempt-boards'
import { seatClockEndsAt, TIMEOUT_SLACK_MS } from '~~/lib/round-beats'
import { latestRound } from '~~/lib/rounds'
import { defineGameHandler } from '../server-side'
import { advanceSeat } from './seat-cursor'
import { commitSeat } from './seat-exits'

/**
 * An option-board pick on the seat's live round, recorded before the view
 * judges it — right and wrong alike, once per option, up to the board's cap,
 * on the cursor itself. The grade prices the attempt off that record, so a
 * reload cannot hand the guesses back. It never says whether the pick was right.
 * A pick that left the player after the seat's clock ran out is never recorded:
 * the view has already shown that seat its timeout.
 */
export const spendPickHandler = defineGameHandler(
  'spend-pick',
  async ({ game, player, server, eventData, eventTarget, receivedAt }) => {
    const { cursor } = player
    if (eventData.subject !== cursor.subject) {
      return server.emit({ event: 'update', game }, eventTarget)
    }
    if (cursor.step !== 'round') return
    const round = latestRound(game)
    const board = attemptBoardOf(round?.groupChallenge)
    const spent = cursor.spent ?? []
    if (!round || !board || !board.options.includes(eventData.pick)) return
    if (spent.includes(eventData.pick) || spent.length >= board.maximumGuesses) return
    const endsAt = seatClockEndsAt(round, cursor.deadline)
    if (endsAt !== undefined && receivedAt - TIMEOUT_SLACK_MS > endsAt) return
    advanceSeat(
      game,
      player,
      {
        step: cursor.step,
        subject: cursor.subject,
        deadline: cursor.deadline,
        spent: [...spent, eventData.pick],
      },
      'event:spend-pick'
    )
    await commitSeat(server, game, player)
  }
)
