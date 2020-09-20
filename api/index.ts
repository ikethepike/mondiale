import { Request, Response, NextFunction } from 'express'

module.exports = async (req: Request, res: Response, __: NextFunction) => {
  const update = (data: any) => {
    res.write(JSON.stringify(data))
  }

  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  update('retry: 10000\n\n')
}
