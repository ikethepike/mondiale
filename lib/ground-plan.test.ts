import { describe, expect, it } from 'vitest'
import { CAPITALS } from '~~/data/capitals.gen'
import { CITY_LIGHTS } from '~~/data/cities.gen'
import { capitalCityLight } from '~~/lib/capitals'
import { cityLightFor, isCapitalCity } from '~~/lib/cities'
import { gradeGroupAnswer } from '~~/lib/events/server/grade-group-answer'
import {
  groundPlanCities,
  groundPlanHints,
  groundPlanImage,
  groundPlanRemainingFraction,
  namesGroundPlanCity,
} from '~~/lib/ground-plan'
import { formatCompact } from '~~/lib/number'
import { buzzScore } from '~~/lib/scoring'
import { normalizeAnswer } from '~~/lib/strings'
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

  it('refuses an empty, missing or malformed name', () => {
    expect(namesGroundPlanCity(plan('Chicago'), undefined)).toBe(false)
    expect(namesGroundPlanCity(plan('Chicago'), '   ')).toBe(false)
    expect(namesGroundPlanCity(plan('Chicago'), 42)).toBe(false)
    expect(namesGroundPlanCity(plan('Chicago'), { city: 'Chicago' })).toBe(false)
  })

  it('resolves a capital through its capital row, native spelling included', () => {
    expect(namesGroundPlanCity(plan('Ulaanbaatar'), 'Ulan Bator')).toBe(true)
    expect(namesGroundPlanCity(plan('Vientiane'), 'Viangchan')).toBe(true)
    expect(namesGroundPlanCity(plan('New Delhi'), 'Delhi')).toBe(false)
  })

  it('refuses a variant that is another city’s own name', () => {
    expect(CITY_LIGHTS.TG?.find(city => city.name === 'Lomé')?.alt).toContain('rome')
    expect(namesGroundPlanCity(plan('Lomé'), 'Rome')).toBe(false)
    expect(namesGroundPlanCity(plan('Lomé'), 'Lome')).toBe(true)
  })

  it('never accepts another roster city or another gazetteer city’s canonical name', () => {
    const gazetteer = Object.values(CITY_LIGHTS).flatMap(cities =>
      (cities ?? []).map(city => city.name)
    )
    for (const entry of groundPlanCities()) {
      const capital = CAPITALS[entry.country]?.name
      const ownNames = [entry.city, ...(entry.aliases ?? [])]
      const isCapital =
        !!capital && ownNames.some(name => normalizeAnswer(name) === normalizeAnswer(capital))
      const own = new Set(
        [...ownNames, ...(isCapital ? [capital, capitalCityLight(entry.country)?.name] : [])]
          .filter((name): name is string => !!name)
          .map(name => normalizeAnswer(name))
      )
      const others = [
        ...groundPlanCities()
          .filter(other => other !== entry)
          .map(other => other.city),
        ...gazetteer,
      ].filter(name => !own.has(normalizeAnswer(name)))
      const accepted = others.filter(name => namesGroundPlanCity(plan(entry.city), name))
      expect(accepted, entry.city).toEqual([])
    }
  })

  it('answers to its own name for every roster city', () => {
    for (const entry of groundPlanCities()) {
      expect(namesGroundPlanCity(plan(entry.city), entry.city), entry.city).toBe(true)
    }
  })
})

const entryFor = (city: string) => groundPlanCities().find(entry => entry.city === city)!

const sizeHint = (city: string) =>
  groundPlanHints(entryFor(city)).find(hint => hint.kind === 'size')?.text

describe('groundPlanHints size rung', () => {
  it('states the city’s own population, not its capital’s', () => {
    expect(sizeHint('Istanbul')).toBe('About 15.7M people live in the city itself')
    expect(sizeHint('Sydney')).toBe('About 5.6M people live in the city itself')
    expect(sizeHint('Chicago')).toBe(
      `About ${formatCompact(2_664_452)} people live in the city itself`
    )
    expect(sizeHint('Saint Petersburg')).not.toBe(sizeHint('Moscow'))
  })

  it('skips the rung where the city has no gazetteer row', () => {
    expect(cityLightFor('IT', ['Venice', 'Venezia'])).toBeUndefined()
    expect(sizeHint('Venice')).toBeUndefined()
    expect(sizeHint('Washington')).toBeUndefined()
  })

  it('reads every roster city’s own row or is absent', () => {
    for (const entry of groundPlanCities()) {
      const names = [entry.city, ...(entry.aliases ?? [])]
      const row = cityLightFor(entry.country, names)
      const hint = groundPlanHints(entry).find(candidate => candidate.kind === 'size')
      if (!row) {
        expect(hint, entry.city).toBeUndefined()
        continue
      }
      if (isCapitalCity(entry.country, names)) {
        expect(row, entry.city).toBe(capitalCityLight(entry.country))
      } else {
        expect(row, entry.city).not.toBe(capitalCityLight(entry.country))
        const own = new Set(names.map(name => normalizeAnswer(name)))
        expect(own.has(normalizeAnswer(row.name)), entry.city).toBe(true)
      }
      expect(hint?.text, entry.city).toBe(
        `About ${formatCompact(row.population)} people live in the city itself`
      )
    }
  })
})

describe('groundPlanImage', () => {
  it('lands a capital on its capital photo whatever the roster calls it', () => {
    expect(entryFor('Washington').city).not.toBe(CAPITALS.US?.name)
    expect(groundPlanImage(entryFor('Washington'))).toBe(CAPITALS.US?.image)
  })

  it('never lands a non-capital on its capital’s photo', () => {
    for (const city of ['New York', 'Sydney', 'La Paz', 'Colombo']) {
      expect(groundPlanImage(entryFor(city)), city).toBeUndefined()
    }
  })
})

describe('ground-plan grading', () => {
  const grade = (challenge: GroundPlanChallenge, city: string | undefined) =>
    gradeGroupAnswer({
      game: { difficulty: 'hard' } as Game,
      round: {
        groupChallenge: challenge,
        groupAnswers: {},
        playerTurns: {},
        playStartsAt: 1_000_000,
      } as never,
      playerId: 'p1',
      submission: {
        ranking: [challenge.country],
        cities: city === undefined ? undefined : [city],
      },
      at: 1_000_000,
    })

  it('pays the dealt city, priced by the layers on screen', async () => {
    const chicago = plan('Chicago')
    const { scoring } = await grade(chicago, 'Chicago')
    expect(scoring).toEqual({
      scored: buzzScore(20, groundPlanRemainingFraction(chicago, 1)),
      maximum: 20,
    })
    expect(scoring.scored).toBeGreaterThan(0)
  })

  it('zeroes another city of the same country, and a bare country', async () => {
    expect((await grade(plan('Chicago'), 'Houston')).scoring.scored).toBe(0)
    expect((await grade(plan('Chicago'), undefined)).scoring.scored).toBe(0)
  })

  it('zeroes a malformed city instead of throwing', async () => {
    expect((await grade(plan('Chicago'), 7 as never)).scoring.scored).toBe(0)
  })
})
