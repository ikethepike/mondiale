import { TUTORIAL_CAP_MS } from '~~/lib/round-beats'
import { seatSubject } from '~~/lib/seat-transitions'
import { defineGameHandler } from '../server-side'
import { armBotPump } from './bot-brain'
import { dealRound } from './moves'
import { advanceSeat, capDeadline } from './seat-cursor'
import { roundSideKeys } from './seat-exits'
import { recordCheckpoint } from './seat-journal'
import { isUnmaskChallenge } from './unmask-file'
import { startUnmask } from './unmask-seal'

export const startGameHandler = defineGameHandler(
  'start-game',
  async ({ game, server, eventTarget, io, redis, socket }) => {
    // Idempotency first: a duplicate start-game answers with a resync snapshot
    // whoever sent it — that recovery beat must survive the host gate below.
    if (game.started) return server.emit({ event: 'update', game }, eventTarget)

    // Host-only: pre-start balcony watchers hold bound sockets, so this is
    // reachable by a non-player — the client guard alone no longer covers it.
    if (game.host !== eventTarget.playerId) {
      return console.warn(`Ignoring start-game from non-host ${eventTarget.playerId}`)
    }

    // Start the game
    game.started = true

    const groupChallenge = await dealRound(game)
    game.rounds.push({ groupChallenge, groupAnswers: {}, playerTurns: {} })
    // Round 1 never passes `revealNextRound` (a forced round type can make it
    // an Unmask), so its file is sealed here, before the first save.
    if (isUnmaskChallenge(groupChallenge)) await startUnmask({ redis }, game, groupChallenge)

    // Every seat opens on the rules card; its cap guarantees a reader who
    // never clicks (or never returns) still joins round 1.
    for (const seat of Object.values(game.players)) {
      advanceSeat(
        game,
        seat,
        {
          step: 'tutorial',
          subject: seatSubject.tutorial(),
          deadline: capDeadline(TUTORIAL_CAP_MS),
        },
        'table:start-game'
      )
    }

    await server.updateGameState(game)
    server.emit({ event: 'game-started', game }, eventTarget)
    await recordCheckpoint(redis, game, roundSideKeys(game))
    // Bot seats play from here on — the brain's pump runs for the game.
    armBotPump({ io, redis, socket, eventTarget }, game)
  },
  { player: 'optional' }
)
