import { roundSettled } from '~~/lib/spectate'
import { defineGameHandler } from '../server-side'
import { fetchUnmaskFile, isUnmaskChallenge, unmaskDossier } from './unmask-file'

/**
 * A seat's Unmask dossier, answered on the requesting socket only: the rungs
 * the round clock has reached, and the answer once this seat can no longer
 * use it — graded, the round behind the table, or (holding no seat) every
 * seat out of the round, so a spectator's screen never spoils a live room.
 */
export const fetchUnmaskDossierHandler = defineGameHandler(
  'fetch-unmask-dossier',
  async ({ game, eventData, eventTarget, redis, socket }) => {
    const index = eventData.round
    const round = Number.isInteger(index) ? game.rounds[index] : undefined
    const challenge = round?.groupChallenge
    if (!round || !isUnmaskChallenge(challenge)) return
    const file = await fetchUnmaskFile(redis, game.id, index)
    if (!file) return

    const live = index === game.rounds.length - 1
    const seated = !!game.players[eventTarget.playerId]
    const revealed =
      !live ||
      (seated
        ? !!round.groupAnswers[eventTarget.playerId]
        : roundSettled(Object.values(game.players)))

    socket.emit(
      'unmask-dossier',
      {
        event: 'unmask-dossier',
        ...unmaskDossier({ challenge, file, round, roundIndex: index, now: Date.now(), revealed }),
      },
      eventTarget
    )
  },
  { player: 'optional' }
)
