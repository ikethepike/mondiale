/* eslint-disable no-unreachable */
import { IncomingMessage } from 'http'
import { ServerMiddleware } from '@nuxt/types'
import { generateComparisons } from '../types/comparisons'
import { Game, Player, Command, palette, Round } from '../types/game'

import { GameFeed } from '../lib/SSE'
import { getRandomValue, getRandomValues } from '../lib/retrieval'
import { generateGameBoard } from '../lib/game'

const games: { [gameId: string]: Game } = {}
const feeds: { [gameId: string]: GameFeed } = {}

const fetchBody = (req: IncomingMessage): Promise<any> => {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk: string) => {
      body += chunk
    })
    req.on('end', () => {
      resolve(body)
    })
  })
}

const api: ServerMiddleware = async (req, res, next) => {
  if (!req.originalUrl?.includes('/api/')) {
    return next()
  }

  if (req.originalUrl.includes('/api/feed/')) {
    const path = req.originalUrl.split('/')
    const playerId = path.pop()
    const gameId = path.pop()
    if (!feeds[gameId]) {
      feeds[gameId] = new GameFeed(gameId)
    }
    feeds[gameId].addConnection(res, playerId)
    return
  }

  if (req.originalUrl === '/api/commands') {
    try {
      const command: Command = JSON.parse(await fetchBody(req))
      const { gameId, playerId } = command
      switch (command.event) {
        case 'connect':
          if (!games[gameId]) {
            games[gameId] = {
              id: gameId,
              rounds: [],
              players: {},
              host: command.playerId,
              options: command.options,
              tiles: generateGameBoard('medium'),
              variant: command.variant || 'world',
            }
          }

          const player: Player = games[gameId].players[playerId] || {
            id: playerId,
            progress: Math.floor(Math.random() * 100),
            color: getRandomValue(Object.values(palette)),
          }

          games[gameId].players[playerId] = player

          res.end(
            JSON.stringify({
              player,
              game: games[gameId],
            })
          )
          break
        case 'set-player':
          const { name } = command
          games[gameId].players[playerId].name = name
          feeds[gameId].update({
            event: 'name-set',
            game: games[gameId],
          })
          res.end()
          break
        case 'join-game':
          feeds[gameId].update({
            event: 'player-joined',
            game: games[gameId],
          })
          break
        case 'wave-at-player':
          feeds[gameId].update(
            { event: 'player-waved', playerId },
            command.targetPlayer
          )
          break
        case 'start-game':
          const challenges = {}
          const ids = Object.keys(games[gameId].players)
          const { comparison, countries } = generateComparisons('neutral')

          ids.forEach((id) => {
            challenges[id] = {
              points: undefined,
              answers: undefined,
              countries: getRandomValues(
                countries.map(({ countryCode }) => countryCode),
                5
              ),
            }
          })
          const round: Round = {
            statistic: comparison,
            challenges,
          }
          games[gameId].rounds.push(round)
          feeds[gameId].update({
            event: 'new-round',
            game: games[gameId],
          })
          break
        case 'kick-player':
          if (playerId !== games[gameId].host) {
            res.statusCode = 401
            return res.end()
          }

          delete games[gameId].players[command.targetPlayer]

          // Kick the player
          if (feeds[gameId].feeds[command.targetPlayer]) {
            feeds[gameId].update(
              {
                event: 'player-kicked',
              },
              command.targetPlayer
            )
          }

          feeds[gameId].removeConnection(command.targetPlayer)

          // Update the game for the rest of the players
          feeds[gameId].update({
            event: 'game-updated',
            game: games[gameId],
          })
          break
        default:
          res.statusCode = 400
          res.statusMessage = 'Unrecognized command sent'
          res.end()
          break
      }
    } catch (e) {
      res.statusCode = 500
      res.statusMessage = e
      res.end()
    }
  }
}

export default api
