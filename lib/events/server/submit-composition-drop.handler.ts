import { compositionSheetKey } from '~~/lib/composition'
import { isChallengeOfType, latestRound } from '~~/lib/rounds'
import { defineGameHandler, setWithGameTtl } from '../server-side'
import {
  applyCompositionDrop,
  compositionBoardOf,
  compositionBoardView,
  fetchCompositionSheet,
} from './composition-board'

/**
 * One card dropped on one group, graded here and answered to the dropping
 * socket alone. `attempt` echoes how many attempts the seat already has, so a
 * retried send can never spend a second strike; every reply carries the
 * seat's whole board, so a lost one is healed by the next.
 */
export const submitCompositionDropHandler = defineGameHandler(
  'submit-composition-drop',
  async ({ game, player, eventData, eventTarget, redis, socket }) => {
    const round = latestRound(game)
    const challenge = round?.groupChallenge
    if (!round || !isChallengeOfType(challenge, 'composition-challenge')) return
    const { playerId } = eventTarget
    const roundIndex = game.rounds.length - 1

    const sheet = await fetchCompositionSheet(redis, game.id, roundIndex)
    const { board, origins } = await compositionBoardOf(challenge)
    const live =
      player.cursor.step === 'round' &&
      eventData.subject === player.cursor.subject &&
      !round.groupAnswers[playerId]
    const drop = { isoCode: eventData.isoCode, slot: eventData.slot }
    const next =
      live && challenge.options.includes(drop.isoCode) && Number.isInteger(drop.slot)
        ? applyCompositionDrop(board, sheet[playerId] ?? [], {
            ...drop,
            attempt: eventData.attempt,
          })
        : undefined
    if (next) {
      sheet[playerId] = next
      await setWithGameTtl(redis, compositionSheetKey(game.id, roundIndex), sheet)
    }

    socket.emit(
      'composition-board',
      {
        event: 'composition-board',
        ...compositionBoardView({
          board,
          origins,
          attempts: sheet[playerId] ?? [],
          round: roundIndex,
          revealed: !live,
          ...(next ? { drop } : {}),
        }),
      },
      eventTarget
    )
  }
)
