/* eslint-disable no-unreachable */
import { IncomingMessage } from 'http'
import { ServerMiddleware } from '@nuxt/types'
import { Game, Player, Command, palette } from '../types/game'
import { generateHash } from '../lib/hashing'

const games: { [key: string]: Game } = {}

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
  // const update = (data: any) => {
  //   res.write(JSON.stringify(data))
  // }

  if (!req.originalUrl?.includes('/api/')) {
    return next()
  }

  if (req.originalUrl?.includes('/api/feed/')) {
    const gameId = req.originalUrl.split('/').pop()
    Object.values(games).forEach((game) => {
      if (game.id === gameId) {
        console.log(gameId)
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Connection', 'keep-alive')
        res.flushHeaders()

        res.write(JSON.stringify('hey hey hey'))
      }
    })
  }

  if (req.originalUrl === '/api/commands') {
    try {
      const command: Command = JSON.parse(await fetchBody(req))

      switch (command.event) {
        case 'connect':
          const id = command.gameId
          const player: Player = {
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
          res.end(JSON.stringify(games[gameId]))
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
