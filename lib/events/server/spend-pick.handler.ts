import { attemptBoardOf } from '~~/lib/challenges'
import { latestRound } from '~~/lib/rounds'
import { defineGameHandler } from '../server-side'
import { advanceSeat } from './seat-cursor'
import { commitSeat } from './seat-exits'

/**
 * An option-board pick spent on the seat's live round. Recorded once per
 * option, up to the board's cap, on the cursor itself — the grade prices the
 * attempt off that record, so a reload cannot hand the guesses back. It never
 * says whether the pick was right: a correct one is banked by the submit.
 */
export const spendPickHandler = defineGameHandler(
  'spend-pick',
  async ({ game, player, server, eventData, eventTarget }) => {
    const { cursor } = player
    if (eventData.subject !== cursor.subject) {
      return server.emit({ event: 'update', game }, eventTarget)
    }
    if (cursor.step !== 'round') return
    const board = attemptBoardOf(latestRound(game)?.groupChallenge)
    const spent = cursor.spent ?? []
    if (!board || !board.options.includes(eventData.pick) || spent.includes(eventData.pick)) return
    if (spent.length >= board.maximumGuesses) return
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
