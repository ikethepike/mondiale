import { describe, expect, it } from 'vitest'
import { CITY_LIGHTS } from '~~/data/cities.gen'
import { gradeGroupAnswer } from '~~/lib/events/server/grade-group-answer'
import { groundPlanCities, namesGroundPlanCity } from '~~/lib/ground-plan'
import type { GroundPlanChallenge } from '~~/types/challenges/group-modes.type'
import type { Game } from '~~/types/game.types'

const plan = (city: string): GroundPlanChallenge => {
  const entry = groundPlanCities().find(candidate => candidate.city === city)!
  return {
    _type: 'ground-plan-challenge',
    country: entry.country,
    city: entry.city,
    cut: entry.cuts[0]!,
    crossings: 0,
    layers: ['fabric'],
    secondsPerLayer: 5,
    secondsPerHint: 5,
    durationSeconds: 30,
    maximumPoints: 20,
  }
}

describe('namesGroundPlanCity', () => {
  it('refuses another city of the same country', () => {
    expect(CITY_LIGHTS.US?.some(city => city.name === 'Houston')).toBe(true)
    expect(namesGroundPlanCity(plan('Chicago'), 'Houston')).toBe(false)
    expect(namesGroundPlanCity(plan('New York'), 'Chicago')).toBe(false)
    expect(namesGroundPlanCity(plan('Rome'), 'Venice')).toBe(false)
  })

  it('accepts the city under any normalized spelling or roster alias', () => {
    expect(namesGroundPlanCity(plan('Chicago'), '  chicago ')).toBe(true)
    expect(namesGroundPlanCity(plan('New York'), 'NYC')).toBe(true)
    expect(namesGroundPlanCity(plan('Turin'), 'Torino')).toBe(true)
    expect(namesGroundPlanCity(plan('Fez'), 'Fès')).toBe(true)
  })

  it('accepts the spellings the gazetteer row carries', () => {
    expect(groundPlanCities().find(entry => entry.city === 'Vienna')?.aliases).toBeUndefined()
    expect(namesGroundPlanCity(plan('Vienna'), 'Wien')).toBe(true)
    expect(namesGroundPlanCity(plan('Prague'), 'Praha')).toBe(true)
    expect(namesGroundPlanCity(plan('Rome'), 'Roma')).toBe(true)
  })

  it('refuses an empty or missing name', () => {
    expect(namesGroundPlanCity(plan('Chicago'), undefined)).toBe(false)
    expect(namesGroundPlanCity(plan('Chicago'), '   ')).toBe(false)
  })

  it('answers to its own name for every roster city', () => {
    for (const entry of groundPlanCities()) {
      expect(namesGroundPlanCity(plan(entry.city), entry.city), entry.city).toBe(true)
    }
  })
})

describe('ground-plan grading', () => {
  const grade = (challenge: GroundPlanChallenge, city: string | undefined) =>
    gradeGroupAnswer({
      game: { difficulty: 'hard' } as Game,
      round: { groupChallenge: challenge, groupAnswers: {}, playerTurns: {} } as never,
      playerId: 'p1',
      submission: { ranking: [challenge.country], clientScore: 20, city },
    })

  it('pays the dealt city', async () => {
    const { scoring } = await grade(plan('Chicago'), 'Chicago')
    expect(scoring).toEqual({ scored: 20, maximum: 20 })
  })

  it('zeroes another city of the same country, and a bare country', async () => {
    expect((await grade(plan('Chicago'), 'Houston')).scoring.scored).toBe(0)
    expect((await grade(plan('Chicago'), undefined)).scoring.scored).toBe(0)
  })
})
