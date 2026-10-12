import { gateHintsOnSale, roundHintsOnSale } from '~~/lib/hints'
import { latestRound } from '~~/lib/rounds'
import type { Game } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'
import { defineGameHandler } from '../server-side'
import { advanceSeat } from './seat-cursor'
import { commitSeat } from './seat-exits'

const hintsOnSale = (game: Game, player: Player): readonly string[] => {
  switch (player.cursor.step) {
    case 'round':
      return roundHintsOnSale(latestRound(game)?.groupChallenge)
    case 'gate': {
      const challenge = player.moves[0]?.challenge
      return challenge?._type === 'individual-challenge' ? gateHintsOnSale(challenge.variant) : []
    }
    default:
      return []
  }
}

/**
 * A hint bought on the seat's live subject. Recorded once (a redelivery is a
 * no-op), on the cursor itself, so the grade that later reads it can only see
 * hints bought on this very question.
 */
export const buyHintHandler = defineGameHandler(
  'buy-hint',
  async ({ game, player, server, eventData, eventTarget }) => {
    const { cursor } = player
    if (eventData.subject !== cursor.subject) {
      return server.emit({ event: 'update', game }, eventTarget)
    }
    const bought = cursor.hints ?? []
    if (bought.includes(eventData.hint)) return
    if (!hintsOnSale(game, player).includes(eventData.hint)) return
    advanceSeat(
      game,
      player,
      {
        step: cursor.step,
        subject: cursor.subject,
        deadline: cursor.deadline,
        hints: [...bought, eventData.hint],
      },
      'event:buy-hint'
    )
    await commitSeat(server, game, player)
  }
)
