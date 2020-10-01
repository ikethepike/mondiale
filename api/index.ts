/* eslint-disable no-unreachable */
import { IncomingMessage } from 'http'
import { ServerMiddleware } from '@nuxt/types'
import { Game, Player, Command, palette } from '../types/game'
import { generateHash } from '../lib/hashing'
import { SSE } from '../lib/SSE'
// import { countryCodes } from '../george/compiled/countries.json'
const games: { [key: string]: Game } = {}
const feeds: { [key: string]: SSE } = {}

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

const randomValue = (array: any) =>
  array[Math.floor(Math.random() * array.length)]

const api: ServerMiddleware = async (req, res, next) => {
  if (!req.originalUrl?.includes('/api/')) {
    return next()
  }

  if (req.originalUrl.includes('/api/feed/')) {
    const gameId = req.originalUrl.split('/').pop()
    if (!feeds[gameId]) {
      feeds[gameId] = new SSE(res)
    }
    return feeds[gameId].connect()
  }

  if (req.originalUrl === '/api/commands') {
    try {
      const command: Command = JSON.parse(await fetchBody(req))

      switch (command.event) {
        case 'connect':
          const id = command.gameId
          const player: Player = {
            ready: false,
            id: generateHash(),
            progress: Math.floor(Math.random() * 100),
            color: randomValue(Object.values(palette)),
          }

          if (!games[id]) {
            games[id] = {
              id,
              variant: 'world',
              players: {},
            }
          }

          games[id].players[player.id] = player
          res.setHeader('Set-Cookie', 'wow="comeon"; Max-Age=40000;')
          res.setHeader('Set-Cookie', `player=${player.id}; Max-Age=3000;`)

          res.end(
            JSON.stringify({
              player,
              game: games[id],
            })
          )
          break
        case 'set-name':
          const { gameId, playerId, name } = command
          games[gameId].players[playerId].name = name
          games[gameId].players[playerId].ready = true
          feeds[gameId].update(games[gameId])
          res.end()
          break
        case 'move':
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
