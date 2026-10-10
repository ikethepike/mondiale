import { describe, expect, it } from 'vitest'
import { isSeatRender, type ClientEventData } from '~~/types/events.types'
import { authorizeClientEvent } from './registry'

const target = { gameId: 'room-a', playerId: 'alice' }
const bound = { gameId: 'room-a', playerId: 'alice' }

describe('authorizeClientEvent', () => {
  it('lets a bound socket act as its own player in its own room', () => {
    expect(authorizeClientEvent('start-game', { event: 'start-game' }, target, bound)).toBe('ok')
  })

  it('refuses a payload that names another event than it was sent as', () => {
    expect(authorizeClientEvent('join', { event: 'start-game' }, target, {})).toBe('mismatch')
    expect(authorizeClientEvent('set-name', { event: 'kick-player' } as never, target, bound)).toBe(
      'mismatch'
    )
    expect(authorizeClientEvent('start-game', undefined, target, bound)).toBe('mismatch')
  })

  it('admits a real join from an unbound socket — join is what binds it', () => {
    expect(authorizeClientEvent('join', { event: 'join', variant: 'world' }, target, {})).toBe('ok')
  })

  it('refuses an unbound socket, another player, and another room', () => {
    const start: ClientEventData = { event: 'start-game' }
    expect(authorizeClientEvent('start-game', start, target, {})).toBe('unbound')
    expect(authorizeClientEvent('start-game', start, { ...target, playerId: 'bob' }, bound)).toBe(
      'unbound'
    )
    expect(authorizeClientEvent('start-game', start, { ...target, gameId: 'room-b' }, bound)).toBe(
      'unbound'
    )
    expect(authorizeClientEvent('start-game', start, target, { playerId: 'alice' })).toBe('unbound')
  })
})

describe('isSeatRender', () => {
  const ack = {
    event: 'seat-rendered',
    seatId: 'alice',
    seq: 4,
    step: 'gate',
    subject: 'gate:w1:t5',
    view: 'gate:gate:w1:t5',
  } as const

  it('accepts a well-formed ack', () => {
    expect(isSeatRender(ack)).toBe(true)
  })

  it('refuses an unknown step, a fractional seq, or an oversized field', () => {
    expect(isSeatRender({ ...ack, step: 'walkabout' } as never)).toBe(false)
    expect(isSeatRender({ ...ack, seq: 1.5 })).toBe(false)
    expect(isSeatRender({ ...ack, view: 'x'.repeat(10_000) })).toBe(false)
    expect(isSeatRender({ ...ack, subject: 42 } as never)).toBe(false)
  })
})
