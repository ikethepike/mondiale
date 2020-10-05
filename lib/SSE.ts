import { ServerResponse } from 'http'
import { Update } from '../types/game'

export class GameFeed {
  gameId: string
  feeds: { [playerId: string]: SSE }

  constructor(gameId: string) {
    this.gameId = gameId
    this.feeds = {}
  }

  addConnection(res: ServerResponse, playerId: string) {
    this.feeds[playerId] = new SSE(res)
  }

  update(data: Update, playerId: string | undefined = undefined): void {
    if (!playerId) {
      Object.values(this.feeds).forEach((feed) => feed.update(data))
      return
    }
    this.feeds[playerId].update(data)
  }
}

export class SSE {
  res: ServerResponse
  constructor(res: ServerResponse) {
    this.res = res
    this.res.writeHead(200, {
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Content-Encoding': 'none',
    })

    this.res.write('retry: 10000\n\n')
  }

  update(data: Update) {
    this.res.write(`data: ${JSON.stringify(data)}\n\n`)
  }
}
