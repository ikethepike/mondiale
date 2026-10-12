import { isChallengeOfType } from '~~/lib/rounds'
import { defineGameHandler } from '../server-side'
import {
  compositionBoardOf,
  compositionBoardView,
  fetchCompositionSheet,
} from './composition-board'

/**
 * A seat's own Composition board — the reload path, and the reveal once the
 * seat can no longer use the key: graded, out of moves, the round behind the
 * table, or no seat at all. Answered on the requesting socket only.
 */
export const fetchCompositionBoardHandler = defineGameHandler(
  'fetch-composition-board',
  async ({ game, eventData, eventTarget, redis, socket }) => {
    const index = eventData.round
    const round = Number.isInteger(index) ? game.rounds[index] : undefined
    const challenge = round?.groupChallenge
    if (!round || !isChallengeOfType(challenge, 'composition-challenge')) return
    const { playerId } = eventTarget
    const live = index === game.rounds.length - 1
    const seated = !!game.players[playerId]

    const sheet = await fetchCompositionSheet(redis, game.id, index)
    const { board, origins } = await compositionBoardOf(challenge)
    socket.emit(
      'composition-board',
      {
        event: 'composition-board',
        ...compositionBoardView({
          board,
          origins,
          attempts: sheet[playerId] ?? [],
          round: index,
          revealed: !live || !seated || !!round.groupAnswers[playerId],
        }),
      },
      eventTarget
    )
  },
  { player: 'optional' }
)
