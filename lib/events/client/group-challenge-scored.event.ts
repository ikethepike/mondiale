import { hasGame } from '~~/types/events.types'
import type { ClientSideEventHandler } from '~~/plugins/socket.client'

/**
 * Seat + that seat's round slice: the acting player's record, answer and
 * points. Serves every event whose server-side mutation is exactly that set
 * ('group-challenge-scored', 'individual-challenge-checked' — a gate forfeit
 * writes `playerTurns[].blocked`, which the bare seat slice used to drop, so
 * the forfeit knock never reached any client).
 */
export const groupChallengeScoredEvent: ClientSideEventHandler = async ({
  gameStore,
  payload,
  eventTarget,
}) => {
  if (!hasGame(payload)) return

  console.info(`Processing: ${payload.event}`)

  const { playerId } = eventTarget

  const { game } = payload
  if (!gameStore.game) {
    throw new ReferenceError('Game is not defined in player update event')
  }

  // The slice is only safe when both sides agree which round is live. A
  // rejoin race (local staged round the payload predates, or vice versa)
  // makes indexing one side with the other's length silent cross-round
  // corruption — the payload is the fresher authoritative state, take it
  // whole instead.
  if (gameStore.game.rounds.length !== game.rounds.length) {
    gameStore.game = game
    return
  }

  gameStore.game.players[playerId] = game.players[playerId]
  const roundIndex = gameStore.game.rounds.length - 1

  gameStore.game.rounds[roundIndex].groupAnswers[playerId] =
    game.rounds[roundIndex].groupAnswers[playerId]
  gameStore.game.rounds[roundIndex].playerTurns[playerId] =
    game.rounds[roundIndex].playerTurns[playerId]
}
