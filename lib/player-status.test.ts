import { describe, it, expect } from 'vitest'
import { getPlayerStatus, placeLabel } from './player-status'
import type { Player } from '~~/types/player.type'

const seat = (e: Partial<Player>): Player =>
  ({ id: 'p', name: 'P', moves: [], currentPosition: 0, ...e }) as unknown as Player

describe('player status labels', () => {
  it('ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(placeLabel).join(' ')).toBe(
      '1st 2nd 3rd 4th 11th 12th 13th 21st 22nd'
    )
  })
  it('names the finishing place', () => {
    const table = [
      seat({ id: 'a', phase: 'victory', completedAtRound: 3 }),
      seat({ id: 'b', phase: 'victory', completedAtRound: 5 }),
      seat({ id: 'c', phase: 'victory', completedAtRound: 7 }),
    ]
    expect(table.map(p => getPlayerStatus(p, table).label)).toEqual([
      'Finished 1st',
      'Finished 2nd',
      'Finished 3rd',
    ])
  })
  it('falls back with no table (other call sites)', () => {
    expect(getPlayerStatus(seat({ phase: 'victory', completedAtRound: 2 })).label).toBe(
      'Finished 1st'
    )
    expect(getPlayerStatus(seat({ phase: 'victory' })).label).toBe('Finished the race!')
  })
  it('shows gauntlet progress', () => {
    const p = seat({
      phase: 'final-challenge',
      moves: [
        {
          challenge: {
            _type: 'final-challenge',
            answeredCorrect: 3,
            totalCount: 5,
          },
        },
      ] as never,
    })
    const s = getPlayerStatus(p)
    expect(s.label).toBe('Final challenge · 3/5')
    expect(s.final).toEqual({ answered: 3, total: 5 })
  })
})
