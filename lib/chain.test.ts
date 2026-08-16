import { describe, expect, it } from 'vitest'
import { BORDERS } from '~~/data/borders.gen'
import { STRAITS } from '~~/data/straits.gen'
import type { BorderChainChallenge, BorderChainState } from '~~/types/challenges/group-modes.type'
import type { GameRules } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'
import {
  chainBeats,
  chainHead,
  chainNarration,
  closedDoors,
  connectionsOf,
  isStraitHop,
  liveChain,
  openMoves,
  pickChainSeed,
  scoreChainRound,
  standingPlayers,
} from './chain'

// Hard rules keep micro-nations in play, preserving the full historic graph.
const WORLD: GameRules = { variant: 'world', difficulty: 'hard' }
const EUROPE: GameRules = { variant: 'europe', difficulty: 'hard' }

const state = (overrides: Partial<BorderChainState> = {}): BorderChainState => ({
  ready: [],
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
    const moves = openMoves(walked, WORLD)
    expect(moves).toContain('RU') // FI-RU is open
    expect(moves).not.toContain('SE')
    expect(moves).not.toContain('NO')
  })

  it('scopes to the board variant', () => {
    const atRussia = state({ chains: [['FI', 'RU']] })
    const world = openMoves(atRussia, WORLD)
    const europe = openMoves(atRussia, EUROPE)
    expect(world).toContain('CN')
    expect(europe).not.toContain('CN')
    expect(europe).toContain('EE')
  })

  it('only reads the live chain, not earlier ones', () => {
    const redealt = state({ chains: [['PT', 'ES', 'FR'], ['DE']] })
    expect(openMoves(redealt, WORLD)).toContain('FR')
  })

  it('reports a dead end as no moves', () => {
    // Portugal's only connection is Spain — already walked.
    const trapped = state({ chains: [['ES', 'PT']] })
    expect(openMoves(trapped, WORLD)).toEqual([])
  })
})

describe('closedDoors', () => {
  it('names the walked country that shut the only door, with its step', () => {
    const trapped = state({ chains: [['ES', 'PT']] })
    expect(closedDoors(trapped, WORLD)).toEqual([{ isoCode: 'ES', reason: 'walked', step: 1 }])
  })

  it('marks a neighbour off the board when the variant excludes it', () => {
    // Morocco borders Spain but is not on the European board.
    const atSpain = state({ chains: [['FR', 'ES']] })
    const doors = closedDoors(atSpain, EUROPE)
    expect(doors).toContainEqual({ isoCode: 'MA', reason: 'off-board' })
    expect(doors).toContainEqual({ isoCode: 'FR', reason: 'walked', step: 1 })
  })

  it('accounts for every connection when the head is a dead end', () => {
    const trapped = state({ chains: [['ES', 'PT']] })
    expect(openMoves(trapped, WORLD)).toEqual([])
    // The proof must cover the whole neighbourhood, or the overlay lies.
    const shut = new Set(closedDoors(trapped, WORLD).map(door => door.isoCode))
    for (const connection of connectionsOf('PT')) expect(shut).toContain(connection)
  })

  it('is exactly the complement of openMoves', () => {
    const mid = state({ chains: [['NO', 'SE', 'FI']] })
    const open = new Set(openMoves(mid, WORLD))
    const shut = new Set(closedDoors(mid, WORLD).map(door => door.isoCode))
    for (const connection of connectionsOf('FI')) {
      if (connection === 'FI') continue
      expect(open.has(connection) || shut.has(connection)).toBe(true)
      expect(open.has(connection) && shut.has(connection)).toBe(false)
    }
  })

  it('lists a country reachable by both land and sea only once', () => {
    // Denmark reaches Sweden by strait and Germany by land; no duplicates.
    const atDenmark = state({ chains: [['DE', 'SE', 'DK']] })
    const doors = closedDoors(atDenmark, WORLD).map(door => door.isoCode)
    expect(new Set(doors).size).toBe(doors.length)
  })

  it('has nothing to prove without a head', () => {
    expect(closedDoors(state({ chains: [[]] }), WORLD)).toEqual([])
  })
})

describe('pickChainSeed', () => {
  it('deals a seed with at least three outs on the board', () => {
    for (let attempt = 0; attempt < 25; attempt++) {
      const seed = pickChainSeed(EUROPE)
      expect(seed).toBeDefined()
      const outs = new Set(openMoves(state({ chains: [[seed!]] }), EUROPE))
      expect(outs.size).toBeGreaterThanOrEqual(3)
    }
  })

  it('respects the exclusion set', () => {
    const exclude = new Set<ISOCountryCode>(['DE'])
    for (let attempt = 0; attempt < 25; attempt++) {
      expect(pickChainSeed(EUROPE, exclude)).not.toBe('DE')
    }
  })
})

describe('standingPlayers / chain accessors', () => {
  it('filters the eliminated in order', () => {
    const s = state({ eliminated: ['b'] })
    expect(standingPlayers(s)).toEqual(['a', 'c'])
  })

  it('exposes the live chain and its head', () => {
    const s = state({
      chains: [
        ['PT', 'ES'],
        ['NO', 'SE'],
      ],
    })
    expect(liveChain(s)).toEqual(['NO', 'SE'])
    expect(chainHead(s)).toBe('SE')
  })
})

describe('scoreChainRound', () => {
  it('pays the winner the full ceiling and the first out only link share', () => {
    const scores = scoreChainRound(
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
    const scores = scoreChainRound(
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
    const scores = scoreChainRound(
      challenge({ order: ['a', 'b'], eliminated: ['b'], named: { a: ['SE'], b: [] } })
    )
    for (const { scored, maximum } of Object.values(scores)) {
      expect(scored).toBeLessThanOrEqual(maximum)
      expect(maximum).toBe(15)
    }
  })
})

describe('chainNarration (the beat-diff both turn-chain views toast from)', () => {
  const copy = {
    seatId: 'me',
    seatName: (playerId: string) => playerId.toUpperCase(),
    fate: (outcome?: string) => (outcome === 'timeout' ? 'the clock ran dry' : 'walked off'),
    move: (name: string, to: ISOCountryCode) => `${name} walks on to ${to}`,
  }

  it('narrates a rival move, never the viewer’s own', () => {
    const walked = state({ chains: [['NO', 'SE']], lastMoverId: 'b' })
    const before = chainBeats(state())
    expect(chainNarration(walked, before, chainBeats(walked), copy)).toBe('B walks on to SE')
    const mine = state({ chains: [['NO', 'SE']], lastMoverId: 'me' })
    expect(chainNarration(mine, before, chainBeats(mine), copy)).toBeUndefined()
  })

  it('stays silent on a trap redeal — a fresh seed is a deal, not a move', () => {
    // resumeFromTrap pushes [seed] and leaves lastMoverId stale: links grew,
    // but the one-country live chain must not credit the stale mover.
    const redealt = state({ chains: [['NO', 'SE'], ['KZ']], lastMoverId: 'b' })
    const before = chainBeats(state({ chains: [['NO', 'SE']], lastMoverId: 'b' }))
    expect(chainNarration(redealt, before, chainBeats(redealt), copy)).toBeUndefined()
  })

  it('narrates a strike burn per key, immune to record key order', () => {
    const before = chainBeats(state({ strikesLeft: { a: 1, b: 2 } }))
    const reordered = state({ strikesLeft: { b: 2, a: 1 } })
    expect(chainNarration(reordered, before, chainBeats(reordered), copy)).toBeUndefined()
    const burned = state({ strikesLeft: { b: 1, a: 1 } })
    expect(chainNarration(burned, before, chainBeats(burned), copy)).toBe('B burns a strike')
  })

  it('narrates an elimination with its fate, and holds during trap/briefing', () => {
    const out = state({ eliminated: ['c'], outcomes: { c: 'timeout' } })
    const before = chainBeats(state())
    expect(chainNarration(out, before, chainBeats(out), copy)).toBe('C is out — the clock ran dry')
    const trapped = state({ eliminated: ['c'], outcomes: { c: 'trapped' }, trap: {} as never })
    expect(chainNarration(trapped, before, chainBeats(trapped), copy)).toBeUndefined()
  })
})
