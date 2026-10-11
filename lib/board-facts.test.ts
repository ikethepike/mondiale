import { describe, expect, it } from 'vitest'
import {
  BOARD_FACT_FAMILIES,
  BOARD_FACT_TUNING,
  loadBoardFacts,
  dealableBoardFacts,
  fitFactText,
  pickBoardFact,
  tidyFactbookText,
  type BoardFactFamily,
} from '~~/lib/board-facts'
import { isCountryPlayable } from '~~/lib/game-rules'
import { seededRandom } from '~~/lib/random'
import type { GameRules } from '~~/types/game.types'

const WORLD: GameRules = { variant: 'world', difficulty: 'normal', includeMicroNations: true }
const DERIVED = new Set<BoardFactFamily>(['record', 'borders', 'clock'])

describe('tidyFactbookText', () => {
  it('closes the stray spaces italics leave and unshouts surnames', () => {
    expect(tidyFactbookText('the Huron word kanata , meaning village')).toBe(
      'the Huron word kanata, meaning village'
    )
    expect(tidyFactbookText('explorer Floki VILGERDARSON applied the name')).toBe(
      'explorer Floki Vilgerdarson applied the name'
    )
    expect(tidyFactbookText('the USSR under Peter I and Louis XIV')).toBe(
      'the USSR under Peter I and Louis XIV'
    )
    expect(tidyFactbookText('cutting leaves -- so the explorer')).toBe(
      'cutting leaves — so the explorer'
    )
  })
})

describe('fitFactText', () => {
  it('keeps whole clauses that fit and never splits an initial', () => {
    const pei =
      "I. M. Pei's glass-and-steel pyramid, the entrance and skylight of the Louvre in Paris."
    expect(fitFactText(pei)).toBe(pei)
    const long = `${'a'.repeat(120)}; ${'b'.repeat(80)}; ${'c'.repeat(80)}`
    expect(fitFactText(long)).toBe(`A${'a'.repeat(119)}; ${'b'.repeat(80)}.`)
  })

  it('refuses a fact whose first unit cannot fit', () => {
    expect(fitFactText('x'.repeat(BOARD_FACT_TUNING.maxChars + 1))).toBeUndefined()
    expect(fitFactText('Too short.')).toBeUndefined()
  })
})

describe('loadBoardFacts', async () => {
  const deck = await loadBoardFacts()

  it('deals every family', () => {
    const families = new Set(deck.map(fact => fact.family))
    for (const family of BOARD_FACT_FAMILIES) expect(families, family).toContain(family)
  })

  it('keeps every fact readable in the aside', () => {
    for (const fact of deck) {
      const where = `${fact.id}: ${fact.text}`
      expect(fact.text.length, where).toBeGreaterThanOrEqual(
        DERIVED.has(fact.family) ? 40 : BOARD_FACT_TUNING.minChars
      )
      expect(fact.text.length, where).toBeLessThanOrEqual(BOARD_FACT_TUNING.maxChars + 1)
      expect(fact.text, where).toMatch(/^["“‘]?[\p{Lu}\d$]/u)
      expect(fact.text, where).toMatch(/[.!?…]["”’)]?$/)
      expect(fact.text, where).not.toMatch(/\s[,;:.]|--|\s{2}/)
      expect(fact.kicker, where).not.toBe('')
      expect(fact.countries.length, where).toBeGreaterThan(0)
    }
  })

  it('gives every fact its own id', () => {
    expect(new Set(deck.map(fact => fact.id)).size).toBe(deck.length)
  })

  it('credits every world record to its source', () => {
    const records = deck.filter(fact => fact.family === 'record')
    expect(records.length).toBeGreaterThanOrEqual(20)
    for (const fact of records) expect(fact.source, fact.id).toBeTruthy()
  })
})

describe('pickBoardFact', async () => {
  const deck = await loadBoardFacts()

  it('never repeats a seen fact and runs dry once everything is seen', () => {
    const seen = new Set<string>()
    const random = seededRandom(7)
    for (let draw = 0; draw < 200; draw++) {
      const fact = pickBoardFact(deck, { rules: WORLD, seen, recent: [], random })!
      expect(seen.has(fact.id)).toBe(false)
      seen.add(fact.id)
    }
    const everything = new Set(deck.map(fact => fact.id))
    expect(pickBoardFact(deck, { rules: WORLD, seen: everything, recent: [] })).toBeUndefined()
  })

  it('rotates families instead of dealing one twice in a row', () => {
    const seen = new Set<string>()
    const recent: BoardFactFamily[] = []
    const random = seededRandom(11)
    for (let draw = 0; draw < 60; draw++) {
      const fact = pickBoardFact(deck, { rules: WORLD, seen, recent, random })!
      expect(recent.slice(-BOARD_FACT_TUNING.familyMemory)).not.toContain(fact.family)
      seen.add(fact.id)
      recent.push(fact.family)
    }
    expect(new Set(recent).size).toBeGreaterThanOrEqual(8)
  })

  it('puts the focus country first', () => {
    const fact = pickBoardFact(deck, {
      rules: WORLD,
      seen: new Set(),
      recent: [],
      focus: 'AR',
      random: seededRandom(3),
    })
    expect(fact?.countries).toContain('AR')
  })

  it('only tells a regional board about countries on it', () => {
    const europe: GameRules = { variant: 'europe', difficulty: 'normal' }
    for (const fact of dealableBoardFacts(deck, europe, new Set())) {
      expect(
        fact.countries.some(isoCode => isCountryPlayable(europe, isoCode)),
        fact.id
      ).toBe(true)
    }
  })

  it('keeps obscure subjects off an easy board', () => {
    const easy: GameRules = { ...WORLD, difficulty: 'easy' }
    const dealt = dealableBoardFacts(deck, easy, new Set())
    expect(dealt.some(fact => fact.fame && fact.fame !== 'major')).toBe(false)
    expect(dealt.length).toBeGreaterThan(300)
  })
})
