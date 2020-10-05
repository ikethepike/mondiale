/* eslint-disable no-unreachable */
import { IncomingMessage } from 'http'
import { ServerMiddleware } from '@nuxt/types'
import { Game, Player, Command, palette } from '../types/game'
import { GameFeed } from '../lib/SSE'
// import { countryCodes } from '../george/compiled/countries.json'
import { getRandomValue } from '../lib/retrieval'
// import { countryCodes } from '../george/compiled/countries.json'

const games: { [key: string]: Game } = {}
const feeds: { [key: string]: GameFeed } = {}
// const rounds: { [gameId: string]: Round[] } = {}

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
              variant: 'world',
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
        case 'set-name':
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
          feeds[gameId].update({ event: 'player-waved' }, playerId)
          break
        // case 'round-finish':
        //   const ids = Object.keys(games[gameId].players)
        //   const lists = {}
        //   const points = {}

        //   ids.forEach((id) => {
        //     lists[id] = getRandomValues(Object.keys(countryCodes), 5)
        //     points[id] = undefined
        //   })

        //   const stat = 'obesity'

        //   feeds[gameId].update({
        //     event: 'new-round',
        //     stat,
        //     lists,
        //   })

        //   rounds[gameId].push({
        //     number: 0,
        //     points,
        //   })

        //   break
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
