import { describe, expect, it } from 'vitest'
import { ISOCountryCodes } from '~~/data/iso-codes.gen'
import type {
  ManhuntChallenge,
  ManhuntClue,
  ManhuntState,
} from '~~/types/challenges/group-modes.type'
import type { ISOCountryCode } from '~~/types/geography.types'
import { connectionsOf } from './chain'
import {
  initialManhuntCandidates,
  legalManhuntMoves,
  MANHUNT_THRESHOLD_ACCESSORS,
  pickManhuntClue,
  pickManhuntSeed,
  pruneManhuntCandidates,
  pursuitNeighboursOf,
  randomManhuntMove,
  scoreManhunt,
  seaNeighboursOf,
  stepManhuntCandidates,
} from './manhunt'
import { getValueByAccessorID } from './values'

const game = { difficulty: 'normal' as const }

const state = (overrides: Partial<ManhuntState> = {}): ManhuntState => ({
  turn: 0,
  hop: 1,
  beat: 'move',
  deadline: 0,
  detectives: ['a', 'b', 'c'],
  clues: [],
  moves: [],
  seaPassagesLeft: 2,
  candidates: [],
  dragnets: [],
  committed: [],
  ...overrides,
})

const challenge = (stateOverrides: Partial<ManhuntState> = {}): ManhuntChallenge => ({
  _type: 'manhunt-challenge',
  turnCount: 7,
  moveSeconds: 15,
  huntSeconds: 25,
  maximumPoints: 15,
  despotId: 'despot',
  seaPassages: 2,
  showCandidates: true,
  state: state(stateOverrides),
})

describe('sea lanes', () => {
  it('are symmetric', () => {
    for (const isoCode of ISOCountryCodes) {
      for (const neighbour of seaNeighboursOf(isoCode)) {
        expect(seaNeighboursOf(neighbour)).toContain(isoCode)
      }
    }
  })

  it('connect Mediterranean shores', () => {
    expect(seaNeighboursOf('IT')).toContain('ES')
  })

  it('rescue sea-only islands the ground graph cannot reach', () => {
    for (const island of ['IS', 'MG', 'NZ'] as ISOCountryCode[]) {
      expect(pursuitNeighboursOf(island).length).toBeGreaterThan(0)
    }
  })
})

describe('seeding and initial candidates', () => {
  it('deals a seed with real outs', () => {
    for (let i = 0; i < 20; i++) {
      const seed = pickManhuntSeed('world')
      expect(seed).toBeDefined()
      expect(connectionsOf(seed as ISOCountryCode).length).toBeGreaterThanOrEqual(3)
    }
  })

  it('starts the candidate set exactly on the seed pool', () => {
    const candidates = initialManhuntCandidates('world')
    expect(candidates.length).toBeGreaterThan(100)
    for (let i = 0; i < 20; i++) {
      expect(candidates).toContain(pickManhuntSeed('world'))
    }
  })

  it('excludes marooned islands from the pool', () => {
    const candidates = initialManhuntCandidates('world')
    for (const island of ['IS', 'NZ', 'MG', 'AG', 'KN'] as ISOCountryCode[]) {
      expect(candidates).not.toContain(island)
    }
  })
})

describe('movement', () => {
  it('offers ground moves without charges', () => {
    const { ground, sea } = legalManhuntMoves('FR', 0, 'world')
    expect(ground.length).toBeGreaterThan(3)
    expect(sea).toEqual([])
  })

  it('offers sea passages with a charge, minus ground duplicates', () => {
    const { ground, sea } = legalManhuntMoves('FR', 1, 'world')
    expect(sea.length).toBeGreaterThan(0)
    for (const destination of sea) expect(ground).not.toContain(destination)
  })

  it('blocks a one-way trip to an exit-less island on the last charge', () => {
    // Iceland has no ground exit: reachable on the first of two charges,
    // never on the last.
    const lastCharge = legalManhuntMoves('NO', 1, 'world')
    const spareCharge = legalManhuntMoves('NO', 2, 'world')
    expect(spareCharge.sea).toContain('IS')
    expect(lastCharge.sea).not.toContain('IS')
  })

  it('random timeout hop stays on the ground when possible', () => {
    for (let i = 0; i < 10; i++) {
      const { isoCode, kind } = randomManhuntMove('DE', 2, 'world')
      expect(kind).toBe('ground')
      expect(connectionsOf('DE')).toContain(isoCode)
    }
  })

  it('random timeout hop burns a charge only when marooned', () => {
    const { kind } = randomManhuntMove('IS', 1, 'world')
    expect(kind).toBe('sea')
  })
})

describe('candidate engine', () => {
  it('steps to the exact ground neighbour image', () => {
    const stepped = stepManhuntCandidates(['DE'], 'ground', 'world')
    expect(stepped.sort()).toEqual([...new Set(connectionsOf('DE'))].sort())
  })

  it('allows backtracking through stepping', () => {
    const once = stepManhuntCandidates(['DE'], 'ground', 'world')
    const twice = stepManhuntCandidates(once, 'ground', 'world')
    expect(twice).toContain('DE')
  })

  it('balloons on a sea passage', () => {
    const stepped = stepManhuntCandidates(['IT'], 'sea', 'world')
    expect(stepped.length).toBeGreaterThan(connectionsOf('IT').length)
    expect(stepped).toContain('ES')
  })

  it('prunes dragnet misses', () => {
    expect(pruneManhuntCandidates(['DE', 'FR', 'PL'], ['FR'])).toEqual(['DE', 'PL'])
  })
})

describe('clue engine', () => {
  it('asserts near-complete coverage for every threshold accessor', () => {
    for (const accessorId of MANHUNT_THRESHOLD_ACCESSORS) {
      const covered = ISOCountryCodes.filter(
        isoCode => getValueByAccessorID(isoCode, accessorId) !== undefined
      )
      expect(covered.length, accessorId).toBeGreaterThanOrEqual(190)
    }
  })

  it('always tells the truth about the despot', () => {
    const candidates = initialManhuntCandidates('world')
    for (let i = 0; i < 50; i++) {
      const despotAt = candidates[Math.floor(Math.random() * candidates.length)]
      const pick = pickManhuntClue(game, despotAt, candidates, 1, [])
      expect(pick.matches).toContain(despotAt)
      expect(pick.matches.length).toBeGreaterThan(0)
      expect(pick.matches.length).toBeLessThanOrEqual(candidates.length)
    }
  })

  it('roughly bisects a large candidate set', () => {
    const candidates = initialManhuntCandidates('world')
    let total = 0
    const rounds = 25
    for (let i = 0; i < rounds; i++) {
      const despotAt = candidates[Math.floor(Math.random() * candidates.length)]
      const pick = pickManhuntClue(game, despotAt, candidates, 1, [])
      total += pick.matches.length / candidates.length
    }
    const average = total / rounds
    expect(average).toBeGreaterThan(0.2)
    expect(average).toBeLessThan(0.8)
  })

  it('converges a full simulated round to a huntable set', () => {
    const endgameSizes: number[] = []
    for (let run = 0; run < 10; run++) {
      let candidates = initialManhuntCandidates('world')
      let despotAt = pickManhuntSeed('world') as ISOCountryCode
      const used: ManhuntClue[] = []
      for (let hop = 1; hop <= 7; hop++) {
        const { isoCode } = randomManhuntMove(despotAt, 0, 'world')
        despotAt = isoCode
        candidates = stepManhuntCandidates(candidates, 'ground', 'world')
        const pick = pickManhuntClue(game, despotAt, candidates, hop, used)
        used.push(pick.clue)
        candidates = pick.matches
        expect(candidates).toContain(despotAt)
        // Three detectives miss into the painted set — the dragnet's pruning.
        const misses = candidates.filter(isoCode => isoCode !== despotAt).slice(0, 3)
        candidates = pruneManhuntCandidates(candidates, misses)
      }
      endgameSizes.push(candidates.length)
      // Any single round may hit a statistical crowd; the hard cap is loose.
      expect(candidates.length).toBeLessThan(60)
    }
    const mean = endgameSizes.reduce((sum, size) => sum + size, 0) / endgameSizes.length
    expect(mean).toBeLessThan(30)
  })

  it('never repeats a clue', () => {
    const candidates = initialManhuntCandidates('world')
    const used: ManhuntClue[] = []
    for (let hop = 1; hop <= 7; hop++) {
      const pick = pickManhuntClue(game, 'FR', candidates, hop, used)
      used.push(pick.clue)
    }
    expect(new Set(used.map(clue => clue.text)).size).toBe(used.length)
  })
})

describe('scoring', () => {
  it('splits a capture by proximity with a capturer bonus', () => {
    const caught = challenge({
      outcome: {
        kind: 'captured',
        hop: 4,
        capturerIds: ['a'],
        country: 'DE',
        trail: ['PL', 'CZ', 'AT', 'DE'],
      },
    })
    const scores = scoreManhunt(caught, { a: 'DE', b: 'FR', c: 'ES' })
    expect(scores.a.scored).toBeGreaterThan(scores.b.scored)
    expect(scores.b.scored).toBeGreaterThan(scores.c.scored)
    // Captured at hop 4 of 7 → three hops survived.
    expect(scores.despot.scored).toBe(Math.round(15 * (3 / 7)))
    for (const playerId of ['a', 'b', 'c', 'despot']) {
      expect(scores[playerId].maximum).toBe(15)
      expect(scores[playerId].scored).toBeLessThanOrEqual(15)
    }
  })

  it('pays the despot in full on escape, detectives a consolation', () => {
    const escaped = challenge({
      outcome: { kind: 'escaped', country: 'MN', trail: ['KZ', 'RU', 'MN'] },
    })
    const scores = scoreManhunt(escaped, { a: 'RU', b: 'CN', c: 'FR' })
    expect(scores.despot.scored).toBe(15)
    expect(scores.a.scored).toBeGreaterThan(0)
    expect(scores.a.scored).toBeLessThan(8)
  })

  it('gives a marker-less detective nothing but never crashes', () => {
    const escaped = challenge({
      outcome: { kind: 'escaped', country: 'MN', trail: ['MN'] },
    })
    const scores = scoreManhunt(escaped, { a: 'RU' })
    expect(scores.b.scored).toBe(0)
    expect(scores.c.scored).toBe(0)
  })

  it('scores island captures with finite distances', () => {
    const caught = challenge({
      outcome: {
        kind: 'captured',
        hop: 7,
        capturerIds: ['a'],
        country: 'IS',
        trail: ['NO', 'IS'],
      },
    })
    const scores = scoreManhunt(caught, { a: 'IS', b: 'NO', c: 'PT' })
    expect(scores.b.scored).toBeGreaterThan(0)
    expect(scores.c.scored).toBeGreaterThan(0)
  })
})
