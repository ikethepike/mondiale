import { describe, expect, it } from 'vitest'
import { ISOCountryCodes } from '~~/data/iso-codes.gen'
import type {
  ManhuntChallenge,
  ManhuntClue,
  ManhuntState,
} from '~~/types/challenges/group-modes.type'
import type { BoardRegion } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'
import { connectionsOf } from './chain'
import {
  clueAdmits,
  despotShare,
  initialManhuntCandidates,
  isSheltered,
  legalManhuntMoves,
  manhuntBeatSettled,
  manhuntClaimsPerBeat,
  manhuntFloor,
  manhuntHopShape,
  manhuntLeakOptions,
  manhuntMoveKind,
  MANHUNT_SUBPOENA_TOPICS,
  MANHUNT_THRESHOLD_ACCESSORS,
  MANHUNT_TUNING,
  pickManhuntSeed,
  pickManhuntVaults,
  pruneManhuntCandidates,
  pursuitNeighboursOf,
  randomManhuntMove,
  scoreManhunt,
  seaNeighboursOf,
  stepManhuntCandidates,
} from './manhunt'
import { sample, shuffleArray } from './arrays'
import { getValueByAccessorID } from './values'

const RULES = { regions: [] as BoardRegion[], difficulty: 'normal' as const }
const game = { difficulty: 'normal' as const }
const VAULTS: ISOCountryCode[] = ['CH', 'SG', 'PA']

const state = (overrides: Partial<ManhuntState> = {}): ManhuntState => ({
  ready: [],
  turn: 0,
  hop: 1,
  deadline: 0,
  analysisAt: 0,
  detectives: ['a', 'b', 'c'],
  clues: [],
  moves: [],
  favoursLeft: 2,
  subpoenasLeft: {},
  candidatesBefore: [],
  candidates: [],
  claims: {},
  despotReady: false,
  dragnets: [],
  ...overrides,
})

const challenge = (stateOverrides: Partial<ManhuntState> = {}): ManhuntChallenge => ({
  _type: 'manhunt-challenge',
  turnCount: 7,
  beatSeconds: 30,
  claimsPerBeat: 3,
  maximumPoints: 15,
  despotId: 'despot',
  favours: 2,
  subpoenas: 1,
  showCandidates: true,
  analysisDelay: 0.4,
  vaults: VAULTS,
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

  it('rescue sea-only islands the ground graph cannot reach', () => {
    for (const island of ['IS', 'MG', 'NZ'] as ISOCountryCode[]) {
      expect(pursuitNeighboursOf(island).length).toBeGreaterThan(0)
    }
  })
})

describe('vaults and the seed', () => {
  it('spreads vaults apart, two on a small board and three on the world', () => {
    expect(pickManhuntVaults(RULES)).toHaveLength(3)
    expect(pickManhuntVaults({ regions: ['europe'], difficulty: 'normal' })).toHaveLength(2)
    const vaults = pickManhuntVaults(RULES)
    for (const vault of vaults) {
      for (const other of vaults) {
        if (vault !== other) expect(connectionsOf(vault)).not.toContain(other)
      }
    }
  })

  it('seeds within reach of a vault, never on one, with real outs', () => {
    const vaults = pickManhuntVaults(RULES)
    const pool = initialManhuntCandidates(RULES, vaults)
    expect(pool.length).toBeGreaterThan(40)
    for (const vault of vaults) expect(pool).not.toContain(vault)
    for (let i = 0; i < 20; i++) {
      const seed = pickManhuntSeed(RULES, vaults)!
      expect(pool).toContain(seed)
      expect(connectionsOf(seed).length).toBeGreaterThanOrEqual(3)
    }
  })

  it('excludes marooned islands from the pool', () => {
    const pool = initialManhuntCandidates(RULES, ['NO', 'AU', 'ZA'])
    for (const island of ['IS', 'NZ', 'MG', 'AG', 'KN'] as ISOCountryCode[]) {
      expect(pool).not.toContain(island)
    }
  })

  it('caps stakeouts by what a board can hide', () => {
    expect(manhuntClaimsPerBeat(3, 90)).toBe(3)
    expect(manhuntClaimsPerBeat(5, 27)).toBe(2)
    expect(manhuntClaimsPerBeat(1, 27)).toBe(1)
  })
})

describe('movement', () => {
  it('offers only ground moves without favours', () => {
    const { ground, sea, stay } = legalManhuntMoves('FR', 0, RULES)
    expect(ground.length).toBeGreaterThan(3)
    expect(sea).toEqual([])
    expect(stay).toBe(false)
  })

  it('offers sea passages and lying low for a favour', () => {
    const { ground, sea, stay } = legalManhuntMoves('FR', 1, RULES)
    expect(sea.length).toBeGreaterThan(0)
    expect(stay).toBe(true)
    for (const destination of sea) expect(ground).not.toContain(destination)
  })

  it('blocks a one-way trip to an exit-less island on the last favour', () => {
    expect(legalManhuntMoves('NO', 2, RULES).sea).toContain('IS')
    expect(legalManhuntMoves('NO', 1, RULES).sea).not.toContain('IS')
  })

  it('prices a destination ground-first, and never accepts an illegal hop', () => {
    expect(manhuntMoveKind('FR', 'DE', 2, RULES)).toBe('ground')
    expect(manhuntMoveKind('FR', 'FR', 1, RULES)).toBe('favour')
    expect(manhuntMoveKind('FR', 'FR', 0, RULES)).toBeUndefined()
    expect(manhuntMoveKind('FR', 'JP', 2, RULES)).toBeUndefined()
  })

  it('times out onto the ground when possible', () => {
    for (let i = 0; i < 10; i++) {
      const { isoCode, kind } = randomManhuntMove('DE', 2, RULES)
      expect(kind).toBe('ground')
      expect(connectionsOf('DE')).toContain(isoCode)
    }
    expect(randomManhuntMove('IS', 1, RULES).kind).toBe('favour')
  })

  it('reads the hop shape off the trail alone', () => {
    expect(manhuntHopShape('DE', 'FR')).toBe('ground')
    expect(manhuntHopShape('IT', 'ES')).toBe('sea')
    expect(manhuntHopShape('IT', 'IT')).toBe('stay')
  })
})

describe('candidate engine', () => {
  it('steps to the exact ground neighbour image', () => {
    const stepped = stepManhuntCandidates(['DE'], 'ground', RULES)
    expect(stepped.sort()).toEqual([...new Set(connectionsOf('DE'))].sort())
  })

  it('keeps every favour outcome in a favour step: sailed or stayed', () => {
    const stepped = stepManhuntCandidates(['IT'], 'favour', RULES)
    expect(stepped).toContain('IT')
    expect(stepped).toContain('ES')
  })

  it('prunes misses, but never on a vault', () => {
    expect(pruneManhuntCandidates(['DE', 'FR', 'CH'], ['FR', 'CH'], VAULTS)).toEqual(['DE', 'CH'])
  })

  it('shelters the despot only on a vault still holding its treasury', () => {
    expect(isSheltered('CH', VAULTS, [])).toBe(true)
    expect(isSheltered('CH', VAULTS, ['CH'])).toBe(false)
    expect(isSheltered('DE', VAULTS, [])).toBe(false)
  })
})

describe('leaks', () => {
  const pool = initialManhuntCandidates(RULES, VAULTS)

  it('asserts near-complete coverage for every threshold accessor', () => {
    for (const accessorId of MANHUNT_THRESHOLD_ACCESSORS) {
      const covered = ISOCountryCodes.filter(
        isoCode => getValueByAccessorID(isoCode, accessorId) !== undefined
      )
      expect(covered.length, accessorId).toBeGreaterThanOrEqual(190)
    }
  })

  it('offers two true leaks in contrasting registers', () => {
    for (let i = 0; i < 30; i++) {
      const despotAt = sample(pool)!
      const options = manhuntLeakOptions(game, despotAt, pool, 1, [], 3)
      expect(options).toHaveLength(2)
      for (const option of options) {
        expect(clueAdmits(option.clue, despotAt)).toBe(true)
        expect(option.matches).toEqual(pool.filter(isoCode => clueAdmits(option.clue, isoCode)))
      }
      expect(options[0].clue.text).not.toBe(options[1].clue.text)
    }
  })

  it('never cuts below the floor when an honest cut above it exists', () => {
    const floor = manhuntFloor(3, 'normal')
    for (let i = 0; i < 30; i++) {
      const despotAt = sample(pool)!
      for (const option of manhuntLeakOptions(game, despotAt, pool, 1, [], 3)) {
        expect(option.matches.length).toBeGreaterThanOrEqual(Math.min(floor, pool.length))
      }
    }
  })

  it('binds a subpoena to its topic and leaves the despot one leak', () => {
    const language = manhuntLeakOptions(game, 'EG', pool, 1, [], 3, 'culture')
    expect(language).toHaveLength(1)
    expect(['language', 'flag-colors']).toContain(language[0].clue.kind)
    const economy = manhuntLeakOptions(game, 'FR', pool, 1, [], 3, 'economy')
    expect(economy[0].clue.kind).toBe('threshold')
    for (const topic of MANHUNT_SUBPOENA_TOPICS) {
      const [pick] = manhuntLeakOptions(game, 'BR', pool, 1, [], 3, topic.id)
      expect(clueAdmits(pick.clue, 'BR'), topic.id).toBe(true)
    }
  })

  it('never deals a language clue that names the despot country', () => {
    const endgame: ISOCountryCode[] = ['HU', 'SK', 'AT', 'RO', 'HR', 'SI']
    const used: ManhuntClue[] = []
    for (let hop = 1; hop <= 30; hop++) {
      const [pick] = manhuntLeakOptions(game, 'HU', endgame, hop, used, 1)
      expect(pick.clue.text).not.toContain('Hungarian')
      used.push(pick.clue)
    }
  })

  it('never repeats a leak', () => {
    const used: ManhuntClue[] = []
    for (let hop = 1; hop <= 7; hop++) {
      used.push(manhuntLeakOptions(game, 'FR', pool, hop, used, 3)[0].clue)
    }
    expect(new Set(used.map(clue => clue.text)).size).toBe(used.length)
  })

  it('reads a threshold leak through the same rounded cut it prints', () => {
    const [pick] = manhuntLeakOptions(game, 'FR', pool, 1, [], 3, 'economy')
    expect(pick.clue.threshold).toBeDefined()
    for (const isoCode of pool) {
      const amount = getValueByAccessorID(isoCode, pick.clue.accessorId!)?.amount
      if (amount === undefined) continue
      expect(clueAdmits(pick.clue, isoCode)).toBe(
        amount >= pick.clue.threshold! === pick.clue.above
      )
    }
  })
})

describe('beats', () => {
  it('settles once the stakeouts are in and the despot has planned', () => {
    expect(manhuntBeatSettled(challenge({ claims: { a: 'DE', b: 'FR', c: 'PL' } }))).toBe(false)
    expect(
      manhuntBeatSettled(challenge({ claims: { a: 'DE', b: 'FR', c: 'PL' }, despotReady: true }))
    ).toBe(true)
    // The last beat has nothing to plan.
    expect(manhuntBeatSettled(challenge({ hop: 7, claims: { a: 'DE', b: 'FR', c: 'PL' } }))).toBe(
      true
    )
  })
})

describe('scoring', () => {
  const finalClaims = (claims: ManhuntState['claims']): Partial<ManhuntState> => ({
    dragnets: [{ hop: 4, claims }],
  })

  it('splits a capture by proximity with a capturer bonus', () => {
    const caught = challenge({
      ...finalClaims({ a: 'DE', b: 'FR', c: 'ES' }),
      outcome: {
        kind: 'captured',
        hop: 4,
        capturerId: 'a',
        country: 'DE',
        trail: ['PL', 'CZ', 'AT', 'DE'],
        looted: [],
      },
    })
    const scores = scoreManhunt(caught)
    expect(scores.a.scored).toBeGreaterThan(scores.b.scored)
    expect(scores.b.scored).toBeGreaterThan(scores.c.scored)
    expect(scores.despot.scored).toBe(Math.round(15 * despotShare(3, 7, 0)))
    for (const playerId of ['a', 'b', 'c', 'despot']) {
      expect(scores[playerId].scored).toBeLessThanOrEqual(15)
    }
  })

  it('pays the loot on top of the escape, capped at the maximum', () => {
    const escaped = (looted: ISOCountryCode[]) =>
      scoreManhunt(
        challenge({
          ...finalClaims({ a: 'RU', b: 'CN', c: 'FR' }),
          outcome: { kind: 'escaped', country: 'MN', trail: ['KZ', 'RU', 'MN'], looted },
        })
      )
    expect(escaped([]).despot.scored).toBe(Math.round(15 * 0.7))
    expect(escaped(['CH']).despot.scored).toBeGreaterThan(escaped([]).despot.scored)
    expect(escaped(['CH', 'SG', 'PA']).despot.scored).toBe(15)
    expect(escaped([]).a.scored).toBeGreaterThan(0)
    expect(escaped([]).a.scored).toBeLessThan(8)
  })

  it('gives a claim-less detective nothing but never crashes', () => {
    const scores = scoreManhunt(
      challenge({
        ...finalClaims({ a: 'RU' }),
        outcome: { kind: 'escaped', country: 'MN', trail: ['MN'], looted: [] },
      })
    )
    expect(scores.b.scored).toBe(0)
  })
})

/**
 * The balance pin: a despot hopping at random (picking either leak) against
 * detectives who always know the live set and stake out distinct countries
 * in it. Real detectives play worse, so this is the hunt's upper bound.
 */
const simulateCaptureRate = (regions: BoardRegion[], detectives: number, runs: number): number => {
  const rules = { regions, difficulty: 'normal' as const }
  const turnCount = MANHUNT_TUNING.normal.turnCount
  let captures = 0
  for (let run = 0; run < runs; run++) {
    const vaults = pickManhuntVaults(rules)
    let at = pickManhuntSeed(rules, vaults)!
    let candidates = initialManhuntCandidates(rules, vaults)
    const claimsPerBeat = manhuntClaimsPerBeat(detectives, candidates.length)
    const used: ManhuntClue[] = []
    const opening = manhuntLeakOptions(game, at, candidates, 1, used, claimsPerBeat)[0]
    used.push(opening.clue)
    candidates = opening.matches
    const looted: ISOCountryCode[] = []
    for (let hop = 1; hop <= turnCount; hop++) {
      const claims = shuffleArray(candidates.filter(iso => !vaults.includes(iso))).slice(
        0,
        claimsPerBeat
      )
      const sheltered = isSheltered(at, vaults, looted)
      if (sheltered) looted.push(at)
      if (claims.includes(at) && !sheltered) {
        captures++
        break
      }
      const to = sample(legalManhuntMoves(at, 0, rules).ground)!
      const stepped = stepManhuntCandidates(
        pruneManhuntCandidates(candidates, claims, vaults),
        'ground',
        rules
      )
      const leak = sample(manhuntLeakOptions(game, to, stepped, hop + 1, used, claimsPerBeat))!
      used.push(leak.clue)
      at = to
      candidates = stepped.filter(isoCode => clueAdmits(leak.clue, isoCode))
      expect(candidates).toContain(at)
    }
  }
  return captures / runs
}

describe('balance', () => {
  it('keeps the hunt a contest on the world board', () => {
    const rate = simulateCaptureRate([], 3, 40)
    expect(rate).toBeGreaterThan(0.3)
    expect(rate).toBeLessThan(0.8)
  })

  it('keeps the hunt a contest on a small board with a big table', () => {
    const rate = simulateCaptureRate(['europe'], 5, 40)
    expect(rate).toBeGreaterThan(0.25)
    expect(rate).toBeLessThan(0.8)
  })
})
