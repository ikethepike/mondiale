import { EventHandler } from '~~/server/middleware/socket.server'
import { useServerSideEvents } from '../server-side'

export const updateByIndexHandler: EventHandler = async ({
  io,
  eventData,
  eventTarget,
  redis,
  socket,
}) => {
  if (eventData.event !== 'update-by-index') return

  const server = useServerSideEvents({ socket, redis, io })

  const { accessorPattern, value } = eventData
  console.log({ value })

  server.emit({ event: 'index-update', value, accessorPattern }, eventTarget)
}
