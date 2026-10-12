import { isBrainSeat } from '~~/lib/bots'
import { defineGameHandler } from '../server-side'
import { advanceSeat } from './seat-cursor'
import { commitSeat } from './seat-exits'

/**
 * A name a timed gauntlet stage took. Kept on the cursor only when it is one
 * of the stage's own and reached the server in time; a redelivery is a no-op.
 * The stage's verdict counts this record and nothing the submit carries.
 */
export const finalLightHandler = defineGameHandler(
  'final-light',
  async ({ game, player, server, socket, eventData, eventTarget, receivedAt }) => {
    const { cursor } = player
    if (eventData.subject !== cursor.subject) {
      return server.emit({ event: 'update', game }, eventTarget)
    }
    if (cursor.step !== 'final') return
    const lit = cursor.lit ?? []
    if (lit.includes(eventData.name)) return

    const gauntlet = player.moves[0]?.challenge
    const question = gauntlet?._type === 'final-challenge' ? gauntlet.challenges[0] : undefined
    if (!question) return
    // Deferred module: only loads once a game reaches the gauntlet (#110).
    const { acceptsFinalLight } = await import('~~/lib/challenges/final-challenge')
    if (
      !acceptsFinalLight(question, game.difficulty, cursor.deadline, eventData.name, receivedAt)
    ) {
      // The brain acts with no socket, and only ever lights in time.
      if (isBrainSeat(player)) return
      socket.emit(
        'final-light-refused',
        { event: 'final-light-refused', subject: cursor.subject, name: eventData.name },
        eventTarget
      )
      return
    }
    advanceSeat(
      game,
      player,
      {
        step: cursor.step,
        subject: cursor.subject,
        deadline: cursor.deadline,
        lit: [...lit, eventData.name],
      },
      'event:final-light'
    )
    await commitSeat(server, game, player)
  },
  { player: 'warn' }
)
