import { describe, expect, it } from 'vitest'
import { MAX_SEAT_DOTS, hemicycleSeats, seatDots, seatRun } from './hemicycle'

describe('seatRun', () => {
  it('always hands out exactly the dots it was given', () => {
    const groups = [
      { key: 'a', seats: 164 },
      { key: 'b', seats: 120 },
      { key: 'c', seats: 44 },
      { key: 'd', seats: 150 },
      { key: 'e', seats: 85 },
      { key: 'f', seats: 64 },
      { key: 'g', seats: 3 },
    ]
    const run = seatRun(seatDots(630), groups)
    expect(run).toHaveLength(MAX_SEAT_DOTS)
    expect(run.filter(key => key === 'a')).toHaveLength(47)
  })

  it('keeps groups contiguous and in order', () => {
    const run = seatRun(10, [
      { key: 'x', seats: 3 },
      { key: 'y', seats: 7 },
    ])
    expect(run).toEqual(['x', 'x', 'x', 'y', 'y', 'y', 'y', 'y', 'y', 'y'])
  })

  it('draws one mark per seat in a small chamber', () => {
    expect(seatDots(51)).toBe(51)
    expect(hemicycleSeats(seatDots(51))).toHaveLength(51)
  })

  it('draws nothing for an empty house', () => {
    expect(seatRun(0, [{ key: 'x', seats: 3 }])).toEqual([])
    expect(seatRun(10, [{ key: 'x', seats: 0 }])).toEqual([])
  })
})
