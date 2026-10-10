import { describe, expect, it } from 'vitest'
import { CLIENT_SIDE_EVENT_HANDLERS } from '~~/lib/events/client-registry'
import { testCursor } from '~~/lib/events/server/test-seat'
import type { Game } from '~~/types/game.types'
import { adoptRevision, isStaleSeat, isStaleSnapshot } from './snapshot-revision'

const game = (fields: Record<string, unknown>) => fields as unknown as Game

const seated = (id: string, seqs: Record<string, number>) =>
  game({
    id,
    players: Object.fromEntries(
      Object.entries(seqs).map(([seat, seq]) => [
        seat,
        { id: seat, cursor: testCursor('walk', { seq }) },
      ])
    ),
  })

describe('isStaleSnapshot', () => {
  it('drops a strictly older snapshot of the same game', () => {
    expect(isStaleSnapshot(game({ id: 'g', rev: 5 }), game({ id: 'g', rev: 4 }))).toBe(true)
  })

  it('applies equal revs — join full-syncs re-emit the last save', () => {
    expect(isStaleSnapshot(game({ id: 'g', rev: 5 }), game({ id: 'g', rev: 5 }))).toBe(false)
    expect(isStaleSnapshot(game({ id: 'g', rev: 5 }), game({ id: 'g', rev: 6 }))).toBe(false)
  })

  it('applies when either side lacks a rev (pre-deploy games)', () => {
    expect(isStaleSnapshot(game({ id: 'g' }), game({ id: 'g', rev: 1 }))).toBe(false)
    expect(isStaleSnapshot(game({ id: 'g', rev: 9 }), game({ id: 'g' }))).toBe(false)
  })

  it('never blocks a different game or an empty store', () => {
    expect(isStaleSnapshot(game({ id: 'a', rev: 9 }), game({ id: 'b', rev: 1 }))).toBe(false)
    expect(isStaleSnapshot(undefined, game({ id: 'g', rev: 1 }))).toBe(false)
  })
})

describe('adoptRevision', () => {
  it('carries a slice payload’s rev onto the held game', () => {
    const held = game({ id: 'g', rev: 3 })
    adoptRevision(held, game({ id: 'g', rev: 7 }))
    expect(held.rev).toBe(7)
    adoptRevision(held, game({ id: 'g' }))
    expect(held.rev).toBe(7)
  })
})

describe('isStaleSeat', () => {
  it('drops a slice that would move the seat’s cursor backwards', () => {
    expect(isStaleSeat(seated('g', { a: 5 }), seated('g', { a: 4 }), 'a')).toBe(true)
  })

  it('applies an equal or newer cursor — a redelivered slice re-applies harmlessly', () => {
    expect(isStaleSeat(seated('g', { a: 5 }), seated('g', { a: 5 }), 'a')).toBe(false)
    expect(isStaleSeat(seated('g', { a: 5 }), seated('g', { a: 6 }), 'a')).toBe(false)
  })

  it('reads only the named seat, never another seat’s cursor', () => {
    const held = seated('g', { a: 5, b: 9 })
    expect(isStaleSeat(held, seated('g', { a: 6, b: 1 }), 'a')).toBe(false)
    expect(isStaleSeat(held, seated('g', { a: 6, b: 1 }), 'b')).toBe(true)
  })

  it('never blocks a different game, an empty store or a seat either side lacks', () => {
    expect(isStaleSeat(seated('a', { a: 9 }), seated('b', { a: 1 }), 'a')).toBe(false)
    expect(isStaleSeat(undefined, seated('g', { a: 1 }), 'a')).toBe(false)
    expect(isStaleSeat(seated('g', {}), seated('g', { a: 1 }), 'a')).toBe(false)
    expect(isStaleSeat(seated('g', { a: 9 }), seated('g', {}), 'a')).toBe(false)
  })
})

describe('the gate’s registry exemptions', () => {
  it('never gates the join full-sync or the seat slices', () => {
    // The join sync is the recovery moment — and the ONE emit that can carry
    // a recreated room whose rev restarted at 1; gating it wedges every
    // rejoining client forever. Slices are FIFO per seat on the socket, and
    // dropping an older slice for another seat after adopting a newer rev
    // could discard that seat's only cursor move.
    expect(CLIENT_SIDE_EVENT_HANDLERS['player-joined'].snapshotScope).toBe('authoritative')
    for (const event of ['update', 'name-set', 'color-set', 'seat-advanced'] as const) {
      expect(CLIENT_SIDE_EVENT_HANDLERS[event].snapshotScope, event).toBe('seat-slice')
    }
  })
})
