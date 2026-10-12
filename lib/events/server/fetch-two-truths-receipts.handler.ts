import { roundHintsOnSale } from '~~/lib/hints'
import { isChallengeOfType } from '~~/lib/rounds'
import { roundSettled } from '~~/lib/spectate'
import { revealedCardIndex } from '~~/lib/two-truths'
import type { TwoTruthsSheet } from '~~/types/two-truths.types'
import { defineGameHandler } from '../server-side'
import { twoTruthsReceipts } from './two-truths-deck'

/**
 * A Two Truths round's receipts and the table's banked sheets, answered on the
 * requesting socket only. A seat sees every card once its own sheet is graded
 * and, before that, only the one card a bought reveal checks. A seat with no
 * answer to give (a finished player in the booth) waits until no seat is still
 * stamping, or it would be a cheat sheet for the rest of the table.
 */
export const fetchTwoTruthsReceiptsHandler = defineGameHandler(
  'fetch-two-truths-receipts',
  async ({ game, eventData, eventTarget, socket }) => {
    const index = eventData.round
    const round = Number.isInteger(index) ? game.rounds[index] : undefined
    if (!round || !isChallengeOfType(round.groupChallenge, 'two-truths-challenge')) return
    const challenge = round.groupChallenge
    const live = index === game.rounds.length - 1
    const seat = game.players[eventTarget.playerId]
    const answered = !!round.groupAnswers[eventTarget.playerId]

    let indices: number[] | undefined
    if (live && !answered) {
      if (seat?.cursor.step === 'round') {
        const bought = (seat.cursor.hints ?? []).some(hint =>
          roundHintsOnSale(challenge).includes(hint)
        )
        if (!bought) return
        indices = [revealedCardIndex(`${game.id}:${index}:${seat.id}`, challenge.cards.length)]
      } else if (!roundSettled(Object.values(game.players))) {
        return
      }
    }

    const sheets: Record<string, TwoTruthsSheet> = indices
      ? {}
      : Object.fromEntries(
          Object.entries(round.groupAnswers).flatMap(([id, answer]) =>
            answer.sheet ? [[id, answer.sheet]] : []
          )
        )
    socket.emit(
      'two-truths-receipts',
      {
        event: 'two-truths-receipts',
        round: index,
        receipts: twoTruthsReceipts(challenge, indices),
        sheets,
      },
      eventTarget
    )
  }
)
