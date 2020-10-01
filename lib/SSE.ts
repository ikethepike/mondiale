import { ServerResponse } from 'http'
export class SSE {
  res: ServerResponse
  constructor(res: ServerResponse) {
    this.res = res
  }

  connect() {
    this.res.writeHead(200, {
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Content-Encoding': 'none',
    })

    this.res.write('retry: 10000\n\n')
  }

  update<T>(data: T) {
    this.res.write(`data: ${JSON.stringify(data)}\n\n`)
  }
}
