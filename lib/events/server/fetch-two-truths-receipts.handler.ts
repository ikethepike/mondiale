import { roundHintsOnSale } from '~~/lib/hints'
import { isChallengeOfType } from '~~/lib/rounds'
import { revealedCardIndex } from '~~/lib/two-truths'
import { defineGameHandler } from '../server-side'
import { twoTruthsReceipts } from './two-truths-deck'

/**
 * A Two Truths round's receipts, answered on the requesting socket only: every
 * card once that seat can no longer use them (its sheet is graded, the round
 * is behind the table, or it holds no seat), and before that only the one card
 * a bought reveal checks.
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
    const sealed = live && !!seat && !round.groupAnswers[eventTarget.playerId]

    let indices: number[] | undefined
    if (sealed) {
      const bought =
        seat.cursor.step === 'round' &&
        (seat.cursor.hints ?? []).some(hint => roundHintsOnSale(challenge).includes(hint))
      if (!bought) return
      indices = [revealedCardIndex(`${game.id}:${index}:${seat.id}`, challenge.cards.length)]
    }

    socket.emit(
      'two-truths-receipts',
      {
        event: 'two-truths-receipts',
        round: index,
        receipts: twoTruthsReceipts(challenge, indices),
      },
      eventTarget
    )
  }
)
