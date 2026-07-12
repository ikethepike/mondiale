import { describe, expect, it } from 'vitest'
import { BORDERS } from '~~/data/borders.gen'
import { STRAITS } from '~~/data/straits.gen'
import type {
  BorderChainChallenge,
  BorderChainState,
} from '~~/types/challenges/group-modes.type'
import type { ISOCountryCode } from '~~/types/geography.types'
import {
  chainHead,
  connectionsOf,
  isStraitHop,
  liveChain,
  openMoves,
  pickChainSeed,
  scoreBorderChain,
  standingPlayers,
} from './chain'

const state = (overrides: Partial<BorderChainState> = {}): BorderChainState => ({
  chains: [['NO']],
  order: ['a', 'b', 'c'],
  activeIndex: 0,
  turn: 0,
  deadline: 0,
  named: {},
  strikesLeft: {},
  eliminated: [],
  outcomes: {},
  missedOuts: {},
  ...overrides,
})

const challenge = (
  stateOverrides: Partial<BorderChainState> = {},
  maximumPoints = 15
): BorderChainChallenge => ({
  _type: 'border-chain-challenge',
  turnSeconds: 12,
  maximumPoints,
  strikes: 0,
  state: state(stateOverrides),
})

describe('straits data', () => {
  it('keeps the marquee sea crossings', () => {
    expect(STRAITS.RU).toContain('US') // Bering
    expect(STRAITS.CN).toContain('TW')
    expect(STRAITS.DK).toContain('SE') // Øresund
    expect(STRAITS.FR).toContain('GB') // Dover
    expect(STRAITS.IN).toContain('LK') // Palk
    expect(STRAITS.IR).toContain('OM') // Hormuz
  })

  it('never resurrects an editorially excluded land pair', () => {
    expect(STRAITS.RS).not.toContain('AL') // only adjacent via Kosovo
    expect(STRAITS.NA).not.toContain('ZW') // Kazungula quadripoint
    expect(STRAITS.DE).not.toContain('IT') // near across Austria, no sea
    expect(STRAITS.US).not.toContain('HT') // Navassa artifact, excluded
  })

  it('is symmetric and disjoint from BORDERS', () => {
    for (const [isoCode, connections] of Object.entries(STRAITS)) {
      for (const other of connections) {
        expect(STRAITS[other]).toContain(isoCode)
        expect(BORDERS[isoCode as ISOCountryCode]).not.toContain(other)
      }
    }
  })
})

describe('connectionsOf', () => {
  it('merges land borders and straits', () => {
    expect(connectionsOf('DK')).toEqual(expect.arrayContaining(['DE', 'SE', 'NO', 'PL']))
    // Islands reach the graph by sea alone.
    expect(connectionsOf('LK')).toContain('IN')
  })

  it('tells strait hops from land hops', () => {
    expect(isStraitHop('DK', 'SE')).toBe(true)
    expect(isStraitHop('DK', 'DE')).toBe(false)
  })
})

describe('openMoves', () => {
  it('excludes countries already walked this chain', () => {
    const walked = state({ chains: [['NO', 'SE', 'FI']] })
    const moves = openMoves(walked, 'world')
    expect(moves).toContain('RU') // FI-RU is open
    expect(moves).not.toContain('SE')
    expect(moves).not.toContain('NO')
  })

  it('scopes to the board variant', () => {
    const atRussia = state({ chains: [['FI', 'RU']] })
    const world = openMoves(atRussia, 'world')
    const europe = openMoves(atRussia, 'europe')
    expect(world).toContain('CN')
    expect(europe).not.toContain('CN')
    expect(europe).toContain('EE')
  })

  it('only reads the live chain, not earlier ones', () => {
    const redealt = state({ chains: [['PT', 'ES', 'FR'], ['DE']] })
    expect(openMoves(redealt, 'world')).toContain('FR')
  })

  it('reports a dead end as no moves', () => {
    // Portugal's only connection is Spain — already walked.
    const trapped = state({ chains: [['ES', 'PT']] })
    expect(openMoves(trapped, 'world')).toEqual([])
  })
})

describe('pickChainSeed', () => {
  it('deals a seed with at least three outs on the board', () => {
    for (let attempt = 0; attempt < 25; attempt++) {
      const seed = pickChainSeed('europe')
      expect(seed).toBeDefined()
      const outs = new Set(openMoves(state({ chains: [[seed!]] }), 'europe'))
      expect(outs.size).toBeGreaterThanOrEqual(3)
    }
  })

  it('respects the exclusion set', () => {
    const exclude = new Set<ISOCountryCode>(['DE'])
    for (let attempt = 0; attempt < 25; attempt++) {
      expect(pickChainSeed('europe', exclude)).not.toBe('DE')
    }
  })
})

describe('standingPlayers / chain accessors', () => {
  it('filters the eliminated in order', () => {
    const s = state({ eliminated: ['b'] })
    expect(standingPlayers(s)).toEqual(['a', 'c'])
  })

  it('exposes the live chain and its head', () => {
    const s = state({ chains: [['PT', 'ES'], ['NO', 'SE']] })
    expect(liveChain(s)).toEqual(['NO', 'SE'])
    expect(chainHead(s)).toBe('SE')
  })
})

describe('scoreBorderChain', () => {
  it('pays the winner the full ceiling and the first out only link share', () => {
    const scores = scoreBorderChain(
      challenge({
        eliminated: ['a', 'b'], // a out first, c wins
        named: { a: [], b: ['SE'], c: ['FI', 'RU'] },
      })
    )
    expect(scores.c.scored).toBe(15) // full placement + best links
    expect(scores.a.scored).toBe(0)
    expect(scores.b.scored).toBeGreaterThan(0)
    expect(scores.b.scored).toBeLessThan(scores.c.scored)
  })

  it('rewards links within equal placement', () => {
    const scores = scoreBorderChain(
      challenge({
        order: ['a', 'b'],
        eliminated: ['a'],
        named: { a: ['SE', 'FI', 'RU'], b: ['DK'] },
      })
    )
    // The loser contributed three links — walks away with the link share.
    expect(scores.a.scored).toBeGreaterThan(0)
    // The winner banked the placement share but not the best-links bonus.
    expect(scores.b.scored).toBe(13)
    expect(scores.b.scored).toBeGreaterThan(scores.a.scored)
  })

  it('never exceeds the ceiling', () => {
    const scores = scoreBorderChain(
      challenge({ order: ['a', 'b'], eliminated: ['b'], named: { a: ['SE'], b: [] } })
    )
    for (const { scored, maximum } of Object.values(scores)) {
      expect(scored).toBeLessThanOrEqual(maximum)
      expect(maximum).toBe(15)
    }
  })
})
