import { hasGame } from '~~/types/events.types'
import type { ClientSideEventHandler } from '~~/lib/events/client-registry'
import {
  adoptRevision,
  isStaleSeat,
  takeWholeAcrossRounds,
} from '~~/lib/events/client/snapshot-revision'

/**
 * Seat + that seat's round slice: the moved seat's record (its cursor), and
 * its answer and turn on the live round — a forfeit's `blocked` record and a
 * banked score travel with the move that wrote them.
 */
export const seatAdvancedEvent: ClientSideEventHandler = async ({
  gameStore,
  payload,
  eventTarget,
}) => {
  if (!hasGame(payload)) return

  const { playerId } = eventTarget
  const { game } = payload
  if (!gameStore.game) {
    throw new ReferenceError('Game is not defined in seat-advanced event')
  }
  if (isStaleSeat(gameStore.game, game, playerId)) {
    return console.warn(`Dropped a seat slice that would move ${playerId} backwards`)
  }

  if (takeWholeAcrossRounds(gameStore, game)) return

  gameStore.game.players[playerId] = game.players[playerId]
  const roundIndex = gameStore.game.rounds.length - 1
  const round = gameStore.game.rounds[roundIndex]
  const incoming = game.rounds[roundIndex]
  if (round && incoming) {
    round.groupAnswers[playerId] = incoming.groupAnswers[playerId]
    round.playerTurns[playerId] = incoming.playerTurns[playerId]
  }
  adoptRevision(gameStore.game, game)
}
