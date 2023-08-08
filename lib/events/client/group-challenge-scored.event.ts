import { ClientSideEventHandler } from '~~/plugins/socket.client'

export const groupChallengeScoredEvent: ClientSideEventHandler = async ({
  gameStore,
  payload,
  eventTarget,
}) => {
  if (payload.event === 'index-update') return

  console.info(`Processing: ${payload.event}`)

  const { playerId } = eventTarget

  const { game } = payload
  if (!gameStore.game) {
    throw new ReferenceError('Game is not defined in player update event')
  }

  gameStore.game.players[playerId] = game.players[playerId]
  const roundIndex = gameStore.game.rounds.length - 1

  // ! Refactor this
  gameStore.game.rounds[roundIndex].groupAnswers[playerId] =
    game.rounds[roundIndex].groupAnswers[playerId]
  gameStore.game.rounds[roundIndex].playerTurns[playerId] =
    game.rounds[roundIndex].playerTurns[playerId]
}
