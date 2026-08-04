import { afterEach, describe, expect, it } from 'vitest'
import { COUNTRIES } from '~~/data/countries.gen'
import { compositionBoards, getRoundChallenge } from '~~/lib/challenges'
import {
  COMPOSITION_CLEAR_MARGIN,
  COMPOSITION_MIN_MARGIN,
  COMPOSITION_MIN_SLICES,
  COMPOSITION_MIN_TOTAL,
  corridorMargin,
  corridorsToDestination,
} from '~~/lib/migration'
import type { CompositionChallenge } from '~~/types/challenges/group-modes.type'
import type { Game, GameDifficulty } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'

const game = (difficulty: GameDifficulty) =>
  ({
    variant: 'world',
    difficulty,
    rounds: [{}],
    players: { a: { phase: 'group-challenge' } },
  }) as unknown as Game

const deal = async (difficulty: GameDifficulty) => {
  process.env.FORCE_ROUND_TYPE = 'composition'
  return (await getRoundChallenge({ game: game(difficulty) })) as CompositionChallenge
}

afterEach(() => {
  delete process.env.FORCE_ROUND_TYPE
})

describe('compositionBoards', () => {
  const pool = Object.keys(COUNTRIES) as ISOCountryCode[]

  it('keeps only boards with a bar worth reading and a decisive leader', () => {
    for (const isoCode of compositionBoards(pool)) {
      const origins = corridorsToDestination(isoCode)
      expect(origins.length).toBeGreaterThanOrEqual(COMPOSITION_MIN_SLICES)
      const total = origins.reduce((sum, origin) => sum + origin.value.amount, 0)
      expect(total).toBeGreaterThanOrEqual(COMPOSITION_MIN_TOTAL)
      expect(corridorMargin(origins)).toBeGreaterThanOrEqual(COMPOSITION_MIN_MARGIN)
    }
  })

  it('drops the boards where naming the largest origin is a coin-flip', () => {
    // The Netherlands (Poland vs Türkiye) and Canada (India vs the
    // Philippines) sit inside a rounding error of each other — asking for the
    // largest there would teach a guess as a fact
    const boards = compositionBoards(pool)
    for (const isoCode of ['NL', 'CA'] as ISOCountryCode[]) {
      expect(corridorMargin(corridorsToDestination(isoCode))).toBeLessThan(COMPOSITION_MIN_MARGIN)
      expect(boards).not.toContain(isoCode)
    }
  })

  it('leaves the mode well stocked on the world board', () => {
    // A migration regeneration that half-parses still type-checks; this is
    // what catches the dealer quietly starving
    expect(compositionBoards(pool).length).toBeGreaterThanOrEqual(60)
  })
})

describe('getCompositionChallenge (via getRoundChallenge)', () => {
  it('deals a sorted bar whose shares never exceed the whole', async () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      const challenge = await deal(difficulty)
      expect(challenge._type).toBe('composition-challenge')
      expect(challenge.slices.length).toBeGreaterThanOrEqual(COMPOSITION_MIN_SLICES)

      const shares = challenge.slices.map(slice => slice.share)
      expect([...shares].sort((a, b) => b - a)).toEqual(shares)
      // Shares are of the country's whole foreign-born population, so the
      // listed head sums to less than 1 — the rest is the long tail
      expect(shares.reduce((sum, share) => sum + share, 0)).toBeLessThanOrEqual(1)
      expect(new Set(challenge.slices.map(slice => slice.isoCode)).size).toBe(
        challenge.slices.length
      )
    }
  })

  it('offers the bar as an option table below hard, and free-types on hard', async () => {
    for (const difficulty of ['easy', 'normal'] as const) {
      const challenge = await deal(difficulty)
      expect(challenge.options).toBeDefined()
      // Every slice is offered, so the answer is on screen and the question is
      // which one leads
      expect([...challenge.options!].sort()).toEqual(
        [...challenge.slices.map(slice => slice.isoCode)].sort()
      )
    }
    expect((await deal('hard')).options).toBeUndefined()
  })

  it('never deals a board whose leader is not decisive', async () => {
    const boards = new Set(compositionBoards(Object.keys(COUNTRIES) as ISOCountryCode[]))
    for (let round = 0; round < 25; round++) {
      const challenge = await deal('hard')
      expect(boards).toContain(challenge.country)
      expect(corridorMargin(corridorsToDestination(challenge.country))).toBeGreaterThanOrEqual(
        COMPOSITION_MIN_MARGIN
      )
    }
  })

  it('scales the board by difficulty, not just the console', async () => {
    // The option table is always the bar's own origins, so it cannot narrow
    // with difficulty — the board carries the scaling instead. Without this,
    // easy and normal dealt identical rounds.
    //
    // Asserted as pool composition, not as an ordering of medians: normal is
    // an untiered shuffle of every board, so its median sits near hard's and
    // the two cross by chance often enough to make that flaky (~4% per run).
    // What the tiering actually guarantees is which boards each end can draw.
    const blowoutShare = async (difficulty: GameDifficulty) => {
      let clear = 0
      for (let round = 0; round < 40; round++) {
        const challenge = await deal(difficulty)
        if (corridorMargin(corridorsToDestination(challenge.country)) >= COMPOSITION_CLEAR_MARGIN) {
          clear++
        }
      }
      return clear / 40
    }

    // Easy draws blowouts exclusively — the shape answers before the names do
    expect(await blowoutShare('easy')).toBe(1)
    // …and hard exhausts the close boards before it ever reaches one
    expect(await blowoutShare('hard')).toBe(0)
  })

  it('never puts the country on its own bar', async () => {
    for (let round = 0; round < 25; round++) {
      const challenge = await deal('normal')
      expect(challenge.slices.map(slice => slice.isoCode)).not.toContain(challenge.country)
    }
  })
})
