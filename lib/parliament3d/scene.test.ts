import { describe, expect, it } from 'vitest'
import { buildParliament, seatPositions } from './building'
import {
  PARLIAMENT,
  PARLIAMENT_POSES,
  bandShift,
  chamberGroups,
  chamberTones,
  fitDistance,
  orbitPosition,
  parliamentPhase,
  type ChamberInput,
} from './scene'

const base: ChamberInput = {
  phase: 'sides',
  totalSeats: 349,
  benches: [
    { name: 'Moderates', seats: 68 },
    { name: 'Sweden Democrats', seats: 73 },
    { name: 'Social Democrats', seats: 107 },
    { name: 'Left', seats: 24 },
  ],
  governing: 'Moderates',
  sorted: ['Sweden Democrats', 'Social Democrats', 'Left'],
  filed: {},
}

describe('parliamentPhase', () => {
  it('follows the round', () => {
    expect(parliamentPhase({ briefing: true, beat: 'party' })).toBe('briefing')
    expect(parliamentPhase({ beat: 'seats' })).toBe('seats')
    expect(parliamentPhase({ beat: 'sides', finished: true })).toBe('reveal')
  })

  it('opens the building only once the round goes inside', () => {
    expect(PARLIAMENT_POSES.party.roof).toBe(0)
    expect(PARLIAMENT_POSES.seats.roof).toBe(1)
    expect(PARLIAMENT_POSES.seats.roofGone).toBe(1)
    expect(PARLIAMENT_POSES.reveal.seats).toBe(1)
  })

  it('leaves the roof hovering over the chamber at the reveal', () => {
    expect(PARLIAMENT_POSES.reveal.roof).toBeGreaterThan(0)
    expect(PARLIAMENT_POSES.reveal.roof).toBeLessThan(1)
    expect(PARLIAMENT_POSES.reveal.roofGone).toBe(0)
  })
})

describe('chamberGroups', () => {
  it('fills the whole house in every phase', () => {
    for (const input of [
      base,
      {
        ...base,
        filed: { 'Sweden Democrats': 'government' as const, Left: 'opposition' as const },
      },
      { ...base, phase: 'seats' as const, preview: 92 },
      { ...base, phase: 'party' as const },
    ]) {
      const total = chamberGroups(input).reduce((sum, group) => sum + group.seats, 0)
      expect(total).toBe(349)
    }
  })

  it('stacks the coalition from the left: governing, then the benches filed with it', () => {
    const groups = chamberGroups({ ...base, filed: { 'Sweden Democrats': 'government' } })
    expect(groups.map(group => group.tone)).toEqual(['governing', 'with', 'ghost'])
    expect(groups[1]!.seats).toBe(73)
  })

  it('marks each filed bench right or wrong at the verdict', () => {
    const groups = chamberGroups({
      ...base,
      filed: { 'Sweden Democrats': 'government', Left: 'government' },
      truth: { 'Sweden Democrats': 'government', Left: 'opposition' },
    })
    expect(groups.map(group => group.tone)).toEqual(['governing', 'right', 'wrong', 'ghost'])
  })

  it('lights the previewed block in beat 2 and wears its verdict', () => {
    expect(chamberGroups({ ...base, phase: 'seats', preview: 68 })[0]).toEqual({
      tone: 'lit',
      seats: 68,
    })
    expect(chamberGroups({ ...base, phase: 'seats', preview: 68, verdict: 'wrong' })[0]!.tone).toBe(
      'wrong'
    )
  })

  it('paints the reveal government → backing → opposition', () => {
    const tones = chamberTones(
      20,
      chamberGroups({
        ...base,
        phase: 'reveal',
        standings: { Moderates: 'government', 'Sweden Democrats': 'backing' },
      })
    )
    expect(tones).toHaveLength(20)
    expect(tones[0]).toBe('governing')
    expect(tones.at(-1)).toBe('opposition')
  })
})

describe('framing', () => {
  it('backs the camera off as its band narrows', () => {
    expect(fitDistance(3, 35, 1.6, 0.5)).toBeGreaterThan(fitDistance(3, 35, 1.6, 1))
    expect(fitDistance(3, 35, 0.5, 1)).toBeGreaterThan(fitDistance(3, 35, 1.6, 1))
  })

  it('orbits around its target', () => {
    const [x, y, z] = orbitPosition([0, 0, 0], 0, Math.PI / 2, 5)
    expect(x).toBeCloseTo(0)
    expect(y).toBeCloseTo(5)
    expect(z).toBeCloseTo(0)
  })

  it('centres the image on its band', () => {
    expect(bandShift(800, { top: 0, bottom: 400 })).toBe(200)
    expect(bandShift(800, { top: 0, bottom: 800 })).toBe(0)
  })
})

describe('the building', () => {
  it('takes the roof and the facade apart in sequence, never as one block', () => {
    for (const channel of ['roof', 'facade'] as const) {
      const delays = new Set(
        buildParliament()
          .parts.filter(part => part.motion?.channel === channel)
          .map(part => part.motion!.delay)
      )
      expect(delays.size).toBeGreaterThan(3)
      expect(Math.max(...delays)).toBeLessThanOrEqual(0.4)
    }
  })

  it('has every part it animates', () => {
    const groups = new Set(buildParliament().parts.map(part => part.group))
    expect([...groups].sort()).toEqual(['chamber', 'facade', 'hall', 'plinth', 'roof', 'spine'])
  })

  it('seats the chamber inside the hall walls', () => {
    const inner = PARLIAMENT.hall.width / 2 - PARLIAMENT.hall.wall
    const back = PARLIAMENT.hall.centerZ - PARLIAMENT.hall.depth / 2
    for (const [x, , z] of seatPositions(180)) {
      expect(Math.abs(x)).toBeLessThan(inner)
      expect(z).toBeGreaterThan(back)
      expect(z).toBeLessThanOrEqual(PARLIAMENT.chamber.center[2])
    }
  })

  it('raises the back rows above the front', () => {
    const seats = seatPositions(180)
    const back = Math.max(...seats.map(seat => seat[1]))
    const front = Math.min(...seats.map(seat => seat[1]))
    expect(back).toBeGreaterThan(front)
  })
})
