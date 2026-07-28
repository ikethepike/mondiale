import { defineGameHandler } from '../server-side'
import { applyUniqueAnswer, currentUniqueOrBust } from './unique-beats'

export const submitUniqueAnswerHandler = defineGameHandler(
  'submit-unique-answer',
  async ({ game, eventData, eventTarget, io, redis, socket }) => {
    const challenge = currentUniqueOrBust(game)
    if (!challenge || challenge.state.finished) return

    await applyUniqueAnswer(
      { io, redis, socket, eventTarget },
      game,
      challenge,
      eventTarget.playerId,
      eventData.category,
      eventData.id
    )
  }
)
