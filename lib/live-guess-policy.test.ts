import { describe, expect, it } from 'vitest'
import { placedCount, probeDistance } from '~~/lib/events/server/player-guessing.handler'
import { guessPolicyFor } from '~~/lib/live-guess-policy'
import { CRITICAL_CLIENT_EVENTS, isCriticalClientEvent } from '~~/types/events.types'
import type { Game } from '~~/types/game.types'

const liveGame = { liveGuesses: true } as unknown as Game

const challenge = (fields: Record<string, unknown>) => fields as never

describe('guessPolicyFor', () => {
  it('names wrong guesses only where each player holds an independent answer set', () => {
    expect(guessPolicyFor(liveGame, challenge({ _type: 'neighbour-blitz-challenge' }))).toBe(
      'label'
    )
    expect(guessPolicyFor(liveGame, challenge({ _type: 'hot-cold-challenge' }))).toBe('presence')
  })

  it('downgrades the option variants to presence only when a table is dealt', () => {
    // A small flag table makes a named wrong pick eliminate a share of the
    // field; hard mode free-types the whole world and a wrong name is noise.
    for (const _type of ['capital-guess-challenge', 'flashpoint-challenge']) {
      expect(guessPolicyFor(liveGame, challenge({ _type, options: ['FR', 'DE'] }))).toBe('presence')
      expect(guessPolicyFor(liveGame, challenge({ _type }))).toBe('label')
    }
  })

  it('reaches government through BASE_POLICY, not the options accident', () => {
    // Government's required party list once tripped the bare `options`
    // truthiness check, silently overriding its BASE_POLICY row.
    expect(guessPolicyFor(liveGame, challenge({ _type: 'government-challenge', options: [] }))).toBe(
      'presence'
    )
    expect(
      guessPolicyFor(liveGame, challenge({ _type: 'government-challenge', options: [{}] }))
    ).toBe('presence')
  })

  it('leaves the other options-carrying modes on their own rows', () => {
    expect(
      guessPolicyFor(liveGame, challenge({ _type: 'trend-race-challenge', options: ['FR'] }))
    ).toBe('presence')
    expect(guessPolicyFor(liveGame, challenge({ _type: 'empire-challenge', options: ['x'] }))).toBe(
      'presence'
    )
    expect(
      guessPolicyFor(liveGame, challenge({ _type: 'composition-challenge', options: ['FR'] }))
    ).toBe('presence')
  })

  it('races the silent arrange rounds instead of muting them', () => {
    // Legacy ranking challenges carry no _type at all.
    expect(guessPolicyFor(liveGame, challenge({ countries: ['FR'] }))).toBe('presence')
    expect(guessPolicyFor(liveGame, challenge({ _type: 'sketch-challenge' }))).toBe('presence')
  })

  it('keeps the turn-based modes silent — their moves are already public', () => {
    for (const _type of ['timeline-challenge', 'border-chain-challenge', 'atlas-challenge']) {
      expect(guessPolicyFor(liveGame, challenge({ _type }))).toBe('none')
    }
  })

  it('honours the table switching live guesses off', () => {
    const off = { liveGuesses: false } as unknown as Game
    expect(guessPolicyFor(off, challenge({ _type: 'neighbour-blitz-challenge' }))).toBe('none')
  })
})

describe('placedCount for government benches', () => {
  const bench = challenge({ _type: 'government-challenge', sorted: ['A', 'B', 'C'] })

  it('takes the total from the chamber, not the client', () => {
    expect(placedCount(bench, { placed: { seated: 9, total: 99 } })).toEqual({
      placed: { seated: 3, total: 3 },
    })
    expect(placedCount(bench, { placed: { seated: 2, total: 3 } })).toEqual({
      placed: { seated: 2, total: 3 },
    })
  })

  it('stays empty for modes without a race', () => {
    expect(placedCount(challenge({ _type: 'sketch-challenge' }), { placed: { seated: 1, total: 1 } })).toEqual({})
  })
})

describe('probeDistance', () => {
  it('answers a hot-cold probe with a 100km-rounded radius, never the country', () => {
    const hotCold = challenge({ _type: 'hot-cold-challenge', country: 'DE' })
    const result = probeDistance(hotCold, { isoCode: 'FR' })
    expect(result.distanceKm).toBeGreaterThan(0)
    expect(result.distanceKm! % 100).toBe(0)
    expect(result).not.toHaveProperty('isoCode')
  })

  it('stays empty for other modes and junk codes', () => {
    expect(probeDistance(challenge({ _type: 'ghost-state-challenge' }), { isoCode: 'FR' })).toEqual(
      {}
    )
    expect(
      probeDistance(challenge({ _type: 'hot-cold-challenge', country: 'DE' }), { isoCode: 'nope' })
    ).toEqual({})
  })
})

describe('critical client events', () => {
  it('acks and retries every briefing ready-gate', () => {
    // A lost ready click strands the briefing — sweep-ready once slipped this
    // list while its three siblings were in.
    for (const ready of ['manhunt-ready', 'unique-ready', 'chain-ready', 'sweep-ready'] as const) {
      expect(isCriticalClientEvent(ready)).toBe(true)
    }
    expect(CRITICAL_CLIENT_EVENTS.filter(event => event.endsWith('-ready'))).toHaveLength(4)
  })
})
