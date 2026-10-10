import { describe, it, expect } from 'vitest'
import { getPlayerStatus, placeLabel } from './player-status'
import { testSeat } from '~~/lib/events/server/test-seat'
import type { Player } from '~~/types/player.type'
import type { SeatStep } from '~~/types/seat.types'

const seat = (step: SeatStep, e: Partial<Player> = {}): Player => testSeat('p', step, e)

describe('player status labels', () => {
  it('ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(placeLabel).join(' ')).toBe(
      '1st 2nd 3rd 4th 11th 12th 13th 21st 22nd'
    )
  })
  it('names the finishing place', () => {
    const table = [
      seat('victory', { id: 'a', completedAtRound: 3 }),
      seat('victory', { id: 'b', completedAtRound: 5 }),
      seat('victory', { id: 'c', completedAtRound: 7 }),
    ]
    expect(table.map(p => getPlayerStatus(p, table).label)).toEqual([
      'Finished 1st',
      'Finished 2nd',
      'Finished 3rd',
    ])
  })
  it('falls back with no table (other call sites)', () => {
    expect(getPlayerStatus(seat('victory', { completedAtRound: 2 })).label).toBe('Finished 1st')
    expect(getPlayerStatus(seat('victory')).label).toBe('Finished the race!')
  })
  it('shows gauntlet progress', () => {
    const p = seat('final', {
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
