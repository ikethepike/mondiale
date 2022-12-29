import { EventHandler } from '~~/server/middleware/socket'

export const testHandler: EventHandler = data => {
  console.log('Received', data)
}
