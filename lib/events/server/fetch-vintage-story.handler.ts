import { isChallengeOfType } from '~~/lib/rounds'
import { loadVintageAnswers } from '~~/lib/vintage-answers'
import { defineGameHandler } from '../server-side'

/**
 * A Vintage round's story — its years — answered on the requesting socket
 * only, and only once that seat can no longer use it: its own answer is
 * graded, the round is behind the table, or it holds no seat at all.
 */
export const fetchVintageStoryHandler = defineGameHandler(
  'fetch-vintage-story',
  async ({ game, eventData, eventTarget, socket }) => {
    const index = eventData.round
    const round = Number.isInteger(index) ? game.rounds[index] : undefined
    if (!round || !isChallengeOfType(round.groupChallenge, 'vintage-challenge')) return
    const live = index === game.rounds.length - 1
    const seated = !!game.players[eventTarget.playerId]
    if (live && seated && !round.groupAnswers[eventTarget.playerId]) return

    const answers = await loadVintageAnswers()
    if (!answers) return
    socket.emit(
      'vintage-story',
      {
        event: 'vintage-story',
        round: index,
        story: answers.vintageStory(round.groupChallenge, game.difficulty),
      },
      eventTarget
    )
  }
)
