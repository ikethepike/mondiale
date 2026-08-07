import { getRoundChallenge } from '~~/lib/challenges'
import { defineGameHandler } from '../server-side'
import { armTutorialCap } from './seat-exits'

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

    for (const playerId of Object.keys(game.players)) {
      game.players[playerId].phase = 'tutorial'
    }

    // Generate a new round
    game.rounds.push({
      groupChallenge: await getRoundChallenge({ game }),
      groupAnswers: {},
      playerTurns: {},
    })

    await server.updateGameState(game)
    server.emit({ event: 'game-started', game }, eventTarget)

    // Every seat opens on the rules card; the cap guarantees a reader who
    // never clicks (or never returns) still joins round 1.
    for (const playerId of Object.keys(game.players)) {
      armTutorialCap({ io, redis, socket, eventTarget }, playerId)
    }
  },
  { player: 'optional' }
)
