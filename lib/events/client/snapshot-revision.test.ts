import { describe, expect, it } from 'vitest'
import { CLIENT_SIDE_EVENT_HANDLERS } from '~~/lib/events/client-registry'
import type { Game } from '~~/types/game.types'
import { adoptRevision, isStaleSnapshot } from './snapshot-revision'

const game = (fields: Record<string, unknown>) => fields as unknown as Game

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

describe('the gate’s registry exemptions', () => {
  it('never gates the join full-sync or the seat slices', () => {
    // The join sync is the recovery moment — and the ONE emit that can carry
    // a recreated room whose rev restarted at 1; gating it wedges every
    // rejoining client forever. Slices are FIFO per seat on the socket, and
    // dropping an older slice for another seat after adopting a newer rev
    // could discard that seat's only phase flip.
    expect(CLIENT_SIDE_EVENT_HANDLERS['player-joined'].snapshotScope).toBe('authoritative')
    for (const event of [
      'update',
      'name-set',
      'color-set',
      'group-challenge-scored',
      'individual-challenge-checked',
      'final-challenge-checked',
    ] as const) {
      expect(CLIENT_SIDE_EVENT_HANDLERS[event].snapshotScope, event).toBe('seat-slice')
    }
  })
})
