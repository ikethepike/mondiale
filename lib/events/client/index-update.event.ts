import type { ClientSideEventHandler } from '~~/plugins/socket.client'

export const indexUpdateEvent: ClientSideEventHandler = async ({ gameStore, payload }) => {
  if (payload.event !== 'index-update') return
  const { game } = gameStore
  if (!game) {
    throw new ReferenceError('Game is not defined in index update event')
  }

  let value: any = game
  const { accessorPattern } = payload
  const split = accessorPattern.split('.')

  for (const [index, accessor] of split.entries()) {
    if (!Reflect.has(value, accessor)) {
      return console.error('Invalid accessor passed', accessor, `from: ${accessorPattern}`)
    }

    const isFinal = index === split.length - 1
    if (isFinal) {
      value[accessor] = payload.value
    } else {
      value = value[accessor]
    }
  }
}
