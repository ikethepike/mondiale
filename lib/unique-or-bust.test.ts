import { describe, expect, it } from 'vitest'
import {
  MEGACITY_MINIMUM_POPULATION,
  UNIQUE_BOARD,
  nextOpenCategory,
  resolveUniqueCollisions,
  uniqueBoardComplete,
  uniqueEntriesForLetter,
  uniqueEntryForAnswer,
  uniqueLetterOf,
  uniqueNameKey,
  uniqueRegisters,
  uniqueViableLetters,
  type UniqueAnswerSheet,
  type UniqueEntry,
} from '~~/lib/unique-or-bust'
import type { UniqueCategoryId, UniqueOrBustChallenge } from '~~/types/challenges/group-modes.type'
import type { GameRules } from '~~/types/game.types'

const RULES: GameRules = { variant: 'world', difficulty: 'normal' }

const boardChallenge = (
  order: string[],
  overrides: Partial<UniqueOrBustChallenge> = {}
): UniqueOrBustChallenge => ({
  _type: 'unique-or-bust-challenge',
  letter: 'M',
  categories: [...UNIQUE_BOARD],
  durationSeconds: 75,
  maximumPoints: 20,
  state: { ready: [], deadline: 0, order, locked: {} },
  ...overrides,
})

const registerFixture: Record<UniqueCategoryId, UniqueEntry[]> = {
  country: [
    { id: 'MX', name: 'Mexico' },
    { id: 'MR', name: 'Mauritania' },
    { id: 'MN', name: 'Mongolia' },
  ],
  capital: [
    { id: 'ES', name: 'Madrid' },
    { id: 'PH', name: 'Manila' },
  ],
  river: [
    { id: 'mississippi', name: 'Mississippi' },
    { id: 'mekong', name: 'Mekong' },
  ],
  megacity: [
    { id: 'DE:Munich', name: 'Munich', aliases: ['München'] },
    // Two register entries, one word — the collision must be by name.
    { id: 'MX:Mérida', name: 'Mérida' },
    { id: 'VE:Merida', name: 'Merida' },
  ],
}

describe('uniqueNameKey / uniqueLetterOf', () => {
  it('normalizes case, diacritics and articles into one collision key', () => {
    expect(uniqueNameKey('Córdoba')).toBe(uniqueNameKey('cordoba'))
    expect(uniqueNameKey('The Gambia')).toBe(uniqueNameKey('Gambia'))
  })

  it('files an entry under its normalized first letter', () => {
    expect(uniqueLetterOf({ name: 'México' })).toBe('m')
    expect(uniqueLetterOf({ name: 'Åland' })).toBe('a')
  })
})

describe('uniqueEntriesForLetter', () => {
  it('keeps only canonical names starting with the letter', () => {
    const names = uniqueEntriesForLetter(registerFixture.country, 'm').map(entry => entry.name)
    expect(names).toEqual(['Mexico', 'Mauritania', 'Mongolia'])
    expect(uniqueEntriesForLetter(registerFixture.country, 'z')).toEqual([])
  })
})

describe('uniqueViableLetters', () => {
  it('offers only letters every category can serve at depth', () => {
    expect(uniqueViableLetters(registerFixture, 2)).toEqual(['m'])
    expect(uniqueViableLetters(registerFixture, 3)).toEqual([])
  })
})

describe('uniqueEntryForAnswer', () => {
  it('accepts a register id filed under the dealt letter', () => {
    expect(uniqueEntryForAnswer(registerFixture, 'river', 'M', 'mekong')?.name).toBe('Mekong')
  })

  it('rejects unknown ids and wrong-letter names', () => {
    expect(uniqueEntryForAnswer(registerFixture, 'river', 'M', 'amazon')).toBeUndefined()
    expect(uniqueEntryForAnswer(registerFixture, 'country', 'B', 'MX')).toBeUndefined()
  })
})

describe('uniqueBoardComplete', () => {
  it('is true only when every seat has locked every slot', () => {
    const challenge = boardChallenge(['a', 'b'])
    expect(uniqueBoardComplete(challenge)).toBe(false)
    challenge.state.locked = { a: [...UNIQUE_BOARD], b: [...UNIQUE_BOARD] }
    expect(uniqueBoardComplete(challenge)).toBe(true)
    challenge.state.locked.b = UNIQUE_BOARD.slice(1)
    expect(uniqueBoardComplete(challenge)).toBe(false)
  })
})

describe('nextOpenCategory', () => {
  // The regression this whole fix exists for: a rival locking a slot re-emits
  // the snapshot, and the view re-runs this rule. An open slot must survive it
  // untouched, or the player's next word lands in another register.
  it('keeps focus on a slot that is still open', () => {
    expect(nextOpenCategory(UNIQUE_BOARD, [], 'capital')).toBe('capital')
    expect(nextOpenCategory(UNIQUE_BOARD, ['country', 'river'], 'capital')).toBe('capital')
  })

  it('steps to the next open blank once the current one is spent', () => {
    expect(nextOpenCategory(UNIQUE_BOARD, ['capital'], 'capital')).toBe('country')
    expect(nextOpenCategory(UNIQUE_BOARD, ['country', 'capital'], 'capital')).toBe('river')
  })

  it('never lands on a spent slot, including board order zero', () => {
    const next = nextOpenCategory(UNIQUE_BOARD, ['country', 'capital'], 'country')
    expect(next).toBe('river')
    expect(next).not.toBe('country')
  })

  it('reports all-in when every blank is spent', () => {
    expect(nextOpenCategory(UNIQUE_BOARD, [...UNIQUE_BOARD], 'river')).toBeUndefined()
  })
})

describe('resolveUniqueCollisions', () => {
  it('pays lone holders their share and cancels duplicates to zero', () => {
    const challenge = boardChallenge(['a', 'b', 'c'])
    const answers: UniqueAnswerSheet = {
      a: { country: 'MX', river: 'mekong' },
      b: { country: 'MX', river: 'mississippi' },
      c: { country: 'MR' },
    }
    const { results, scores } = resolveUniqueCollisions(challenge, answers, registerFixture)

    const mexico = results.country?.find(cell => cell.name === 'Mexico')
    expect(mexico?.holders.sort()).toEqual(['a', 'b'])
    expect(mexico?.scored).toBe(0)
    expect(results.country?.find(cell => cell.name === 'Mauritania')?.scored).toBe(5)

    // a and b each keep only their unique river; c keeps the lone country.
    expect(scores.a).toEqual({ scored: 5, maximum: 20 })
    expect(scores.b).toEqual({ scored: 5, maximum: 20 })
    expect(scores.c).toEqual({ scored: 5, maximum: 20 })
  })

  it('collides by normalized name across different register ids', () => {
    const challenge = boardChallenge(['a', 'b'])
    const answers: UniqueAnswerSheet = {
      a: { megacity: 'MX:Mérida' },
      b: { megacity: 'VE:Merida' },
    }
    const { results, scores } = resolveUniqueCollisions(challenge, answers, registerFixture)
    expect(results.megacity).toHaveLength(1)
    expect(results.megacity?.[0].holders.sort()).toEqual(['a', 'b'])
    expect(scores.a.scored).toBe(0)
    expect(scores.b.scored).toBe(0)
  })

  it('ignores empty, unknown and wrong-letter slots', () => {
    const challenge = boardChallenge(['a', 'b'])
    const answers: UniqueAnswerSheet = {
      a: { river: 'amazon', capital: 'ES' },
      // b never answered at all.
    }
    const { results, scores } = resolveUniqueCollisions(challenge, answers, registerFixture)
    expect(results.river).toEqual([])
    expect(scores.a).toEqual({ scored: 5, maximum: 20 })
    expect(scores.b).toEqual({ scored: 0, maximum: 20 })
  })

  it('clamps a full unique board to the round pot', () => {
    const challenge = boardChallenge(['a'])
    const answers: UniqueAnswerSheet = {
      a: { country: 'MX', capital: 'ES', river: 'mekong', megacity: 'DE:Munich' },
    }
    const { scores } = resolveUniqueCollisions(challenge, answers, registerFixture)
    expect(scores.a.scored).toBe(20)
  })
})

describe('uniqueRegisters (generated data)', () => {
  it('fields deep pools for the classic letters in every category', async () => {
    const registers = await uniqueRegisters(RULES)
    for (const category of UNIQUE_BOARD) {
      expect(registers[category].length).toBeGreaterThan(20)
    }
    // The issue's own board: M must be dealable at any table size in range.
    for (const category of UNIQUE_BOARD) {
      expect(uniqueEntriesForLetter(registers[category], 'm').length).toBeGreaterThanOrEqual(5)
    }
    // Megacities honour the population line the prompt promises.
    const munich = registers.megacity.find(entry => entry.name === 'Munich')
    expect(munich).toBeDefined()
    expect(MEGACITY_MINIMUM_POPULATION).toBe(1_000_000)
  })

  it('offers several viable letters at a full table', async () => {
    const registers = await uniqueRegisters(RULES)
    const letters = uniqueViableLetters(registers, 8)
    expect(letters.length).toBeGreaterThanOrEqual(5)
    expect(letters).not.toContain('x')
  })

  // The reported round: on S, neither Stockholm nor Sanaa was accepted as a
  // capital or a million-city. The registers were never the problem — the view
  // was routing the answer to another category — so this pins the data down.
  it('files Stockholm and Sanaa under S as both capital and million-city', async () => {
    const registers = await uniqueRegisters(RULES)
    for (const category of ['capital', 'megacity'] as const) {
      const pool = uniqueEntriesForLetter(registers[category], 'S')
      for (const name of ['Stockholm', 'Sanaa']) {
        const entry = pool.find(candidate => candidate.name === name)
        expect(entry, `${name} missing from ${category}`).toBeDefined()
        expect(uniqueEntryForAnswer(registers, category, 'S', entry!.id)).toBeDefined()
      }
    }
  })
})
