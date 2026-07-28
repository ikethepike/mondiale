import { COUNTRIES } from '~~/data/countries.gen'
import { normalizeAnswer } from './strings'
import { clampScore } from './scoring'
import { playableWorldCountries } from './game-rules'
import { countryName } from './country'
import type {
  UniqueBoardCell,
  UniqueCategoryId,
  UniqueOrBustChallenge,
} from '~~/types/challenges/group-modes.type'
import type { GameDifficulty, GameRules } from '~~/types/game.types'

/**
 * Unique or Bust's single source: the category registers, the letter pools,
 * and the duplicate-cancel collision resolve. The dealer, the server's beat
 * engine, the answer validator and the client's suggestion lists all read the
 * same functions — the two sides of the wire must never grow separate ideas of
 * what "a river starting with M" is.
 */

/** A megacity per the board's phrasing: a city of at least a million. */
export const MEGACITY_MINIMUM_POPULATION = 1_000_000

/** The board, in slot order — every deal carries all four. */
export const UNIQUE_BOARD: UniqueCategoryId[] = ['country', 'capital', 'river', 'megacity']

export const UNIQUE_CATEGORIES: {
  [id in UniqueCategoryId]: { label: string; prompt: string }
} = {
  country: { label: 'Country', prompt: 'A country' },
  capital: { label: 'Capital', prompt: 'A capital city' },
  river: { label: 'River', prompt: 'A river' },
  megacity: { label: 'Million-city', prompt: 'A city over a million' },
}

export const UNIQUE_TUNING: {
  [difficulty in GameDifficulty]: { durationSeconds: number }
} = {
  easy: { durationSeconds: 90 },
  normal: { durationSeconds: 75 },
  hard: { durationSeconds: 60 },
}

/** Redis key for the round's live answer sheet — the player-secret pattern:
 *  never rides a broadcast, deleted once the scores settle. */
export const uniqueKey = (gameId: string, roundIndex: number) =>
  `${gameId}:unique-or-bust:${roundIndex}`

/** One register entry — shaped so views can feed it straight to SuggestInput. */
export interface UniqueEntry {
  id: string
  name: string
  /** Accepted alternate spellings — matched, never displayed. */
  aliases?: string[]
}

/** The live answer sheet as the redis blob stores it: entry ids only. */
export type UniqueAnswerSheet = {
  [playerId: string]: Partial<Record<UniqueCategoryId, string>>
}

/** The one normalizer for matching AND collision-keying: two picks whose
 *  names normalize alike are the same word, wherever they came from. */
export const uniqueNameKey = (name: string): string => normalizeAnswer(name)

/** The board letter an entry files under (lowercase), from its canonical name. */
export const uniqueLetterOf = (entry: Pick<UniqueEntry, 'name'>): string =>
  uniqueNameKey(entry.name).charAt(0)

/**
 * The four registers for a game's rules. Async because rivers and cities live
 * in fat generated chunks (the water-blitz dealers' lazy-import precedent).
 */
export const uniqueRegisters = async (
  rules: GameRules
): Promise<Record<UniqueCategoryId, UniqueEntry[]>> => {
  const [{ WATER_FEATURES }, { CITY_LIGHTS }] = await Promise.all([
    import('~~/data/water.gen'),
    import('~~/data/cities.gen'),
  ])

  const countries = playableWorldCountries(rules)
  return {
    country: countries.map(isoCode => ({ id: isoCode, name: countryName(isoCode) })),
    capital: countries.flatMap(isoCode => {
      const capital = COUNTRIES[isoCode].geography.capital.name
      return capital ? [{ id: isoCode, name: capital }] : []
    }),
    river: Object.values(WATER_FEATURES)
      .filter(feature => feature.kind === 'river')
      .map(feature => ({ id: feature.id, name: feature.name })),
    megacity: countries.flatMap(isoCode =>
      (CITY_LIGHTS[isoCode] ?? [])
        .filter(city => city.population >= MEGACITY_MINIMUM_POPULATION)
        .map(city => ({ id: `${isoCode}:${city.name}`, name: city.name, aliases: city.alt }))
    ),
  }
}

/** A category's answer pool for the dealt letter. */
export const uniqueEntriesForLetter = (entries: UniqueEntry[], letter: string): UniqueEntry[] => {
  const wanted = letter.toLowerCase()
  return entries.filter(entry => uniqueLetterOf(entry) === wanted)
}

/**
 * Letters every category can field at least `minimumDepth` answers for —
 * the dealer's viability filter (Q, X and friends fall out here naturally).
 */
export const uniqueViableLetters = (
  registers: Record<UniqueCategoryId, UniqueEntry[]>,
  minimumDepth: number
): string[] =>
  'abcdefghijklmnopqrstuvwxyz'
    .split('')
    .filter(letter =>
      UNIQUE_BOARD.every(
        category => uniqueEntriesForLetter(registers[category], letter).length >= minimumDepth
      )
    )

/** The answer a slot id names, if it exists AND files under the dealt letter.
 *  The server-side validity check and the resolve both go through this. */
export const uniqueEntryForAnswer = (
  registers: Record<UniqueCategoryId, UniqueEntry[]>,
  category: UniqueCategoryId,
  letter: string,
  id: string
): UniqueEntry | undefined => {
  const entry = registers[category].find(candidate => candidate.id === id)
  return entry && uniqueLetterOf(entry) === letter.toLowerCase() ? entry : undefined
}

/** True once every seated player has locked every slot — the early finish. */
export const uniqueBoardComplete = (challenge: UniqueOrBustChallenge): boolean =>
  challenge.state.order.every(playerId =>
    challenge.categories.every(category =>
      challenge.state.locked[playerId]?.includes(category)
    )
  )

/**
 * The reveal's collision grid and the scores, in one pass. Cells group by
 * normalized name, not register id — Córdoba (AR) and Córdoba (ES) are the
 * same word at a Scattergories table and cancel each other. A slot pays its
 * category's equal share of the pot only when exactly one player holds its
 * word; empty and off-register slots pay nothing.
 */
export const resolveUniqueCollisions = (
  challenge: UniqueOrBustChallenge,
  answers: UniqueAnswerSheet,
  registers: Record<UniqueCategoryId, UniqueEntry[]>
): {
  results: { [category in UniqueCategoryId]?: UniqueBoardCell[] }
  scores: { [playerId: string]: { scored: number; maximum: number } }
} => {
  const share = challenge.maximumPoints / challenge.categories.length
  const results: { [category in UniqueCategoryId]?: UniqueBoardCell[] } = {}
  const banked: { [playerId: string]: number } = {}

  for (const category of challenge.categories) {
    const cells = new Map<string, UniqueBoardCell>()
    for (const playerId of challenge.state.order) {
      const id = answers[playerId]?.[category]
      const entry =
        id !== undefined
          ? uniqueEntryForAnswer(registers, category, challenge.letter, id)
          : undefined
      if (!entry) continue
      const key = uniqueNameKey(entry.name)
      const cell = cells.get(key) ?? { key, id: entry.id, name: entry.name, holders: [], scored: 0 }
      cell.holders.push(playerId)
      cells.set(key, cell)
    }

    for (const cell of cells.values()) {
      cell.scored = cell.holders.length === 1 ? Math.round(share) : 0
      for (const holder of cell.holders) banked[holder] = (banked[holder] ?? 0) + cell.scored
    }
    results[category] = [...cells.values()].sort((a, b) => a.name.localeCompare(b.name))
  }

  const scores = Object.fromEntries(
    challenge.state.order.map(playerId => [
      playerId,
      {
        scored: clampScore(banked[playerId] ?? 0, challenge.maximumPoints),
        maximum: challenge.maximumPoints,
      },
    ])
  )
  return { results, scores }
}
