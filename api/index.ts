/* eslint-disable no-unreachable */
import { IncomingMessage } from 'http'
import { ServerMiddleware } from '@nuxt/types'
import { generateHash } from '../lib/hashing'
import { Game, Player } from '../types/game'
import { Command } from '~/types/game'

const games: { [key: string]: Game } = {}

export const test: Response | null = null

interface GameCreateRequest {
  player: {
    name: string
  }
}
export interface GameConnectRequest {
  id: string
}

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
  // const update = (data: any) => {
  //   res.write(JSON.stringify(data))
  // }

  if (!req.originalUrl?.includes('/api/')) {
    return next()
  }

  if (req.originalUrl === '/api/commands') {
    try {
      const command: Command = JSON.parse(await fetchBody(req))

      switch (command.event) {
        case 'connect':
          const id = command.gameId
          const player: Player = {
            id: generateHash(),
            points: 0,
          }

          if (!games[id]) {
            games[id] = {
              id,
              variant: 'world',
              players: {},
            }
          }

          games[id].players[player.id] = player
          res.end(JSON.stringify(games[id]))
          break
        case 'set-name':
          const { gameId, playerId, name } = command
          games[gameId].players[playerId].name = name
          res.end(JSON.stringify(games[gameId]))
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

  // res.setHeader('Cache-Control', 'no-cache')
  // res.setHeader('Content-Type', 'text/event-stream')
  // res.setHeader('Connection', 'keep-alive')
  // res.flushHeaders()
}

export default api
