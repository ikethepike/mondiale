import { COUNTRIES } from '~~/data/countries.gen'
import { normalizeAnswer } from './strings'
import { clampScore } from './scoring'
import { playableWorldCountries } from './game-rules'
import { countryName } from './country'
import type { GroupChallengeAccessorId } from '~~/types/challenges/group-challenge.type'
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

import { MEGACITY_MINIMUM_POPULATION } from '~~/types/city.type'

export { MEGACITY_MINIMUM_POPULATION }

/** The board, in slot order — every deal carries all four. */
export const UNIQUE_BOARD: UniqueCategoryId[] = ['country', 'capital', 'river', 'megacity']

export const UNIQUE_CATEGORIES: {
  [id in UniqueCategoryId]: {
    label: string
    prompt: string
    /** The category's subtle emblem, through StatTopicIcon's two channels. */
    icon: { topic?: string; accessor?: GroupChallengeAccessorId }
  }
} = {
  country: { label: 'Country', prompt: 'A country', icon: { topic: 'geography' } },
  capital: { label: 'Capital', prompt: 'A capital city', icon: { topic: 'relations.embassy' } },
  river: { label: 'River', prompt: 'A river', icon: { accessor: 'geography.area.water' } },
  megacity: {
    label: 'Million-city',
    prompt: 'A city over a million',
    icon: { accessor: 'people.urbanization' },
  },
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

/** Typed-river matching only: "Yellow River" is "Yellow". Collision keys and
 *  letter filing stay on uniqueNameKey — the server validates ids, so a
 *  looser client matcher can't drift across the wire. */
export const riverNameKey = (value: string): string =>
  normalizeAnswer(value, { suffixes: ['river'] })

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
      .map(feature => ({ id: feature.id, name: feature.name, aliases: feature.aliases })),
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
 * Depth counts DISTINCT words, not register entries: Hyderabad (IN) and
 * Hyderabad (PK) are one answer at this table — they cancel, so they can't
 * both count toward the pool the dealer promises.
 */
export const uniqueViableLetters = (
  registers: Record<UniqueCategoryId, UniqueEntry[]>,
  minimumDepth: number
): string[] =>
  'abcdefghijklmnopqrstuvwxyz'
    .split('')
    .filter(letter =>
      UNIQUE_BOARD.every(
        category =>
          new Set(
            uniqueEntriesForLetter(registers[category], letter).map(entry =>
              uniqueNameKey(entry.name)
            )
          ).size >= minimumDepth
      )
    )

/**
 * Integer per-category shares that sum exactly to the pot (largest remainder:
 * the first `pot mod count` slots carry the extra point). One rounded share
 * either overshot the pot on a full board or left it unreachable — the client
 * sums cells, the server clamps, and the two disagreed.
 */
export const uniqueCategoryShares = (maximumPoints: number, count: number): number[] => {
  const base = Math.floor(maximumPoints / count)
  const extras = maximumPoints - base * count
  return Array.from({ length: count }, (_, index) => (index < extras ? base + 1 : base))
}

/**
 * The words a player has already locked, as collision keys — the reuse gate.
 * One word never fills two blanks: Singapore the country, the capital and the
 * megacity are the same word at this table.
 */
export const uniqueUsedWordKeys = (
  registers: Record<UniqueCategoryId, UniqueEntry[]>,
  challenge: Pick<UniqueOrBustChallenge, 'categories' | 'letter'>,
  row: Partial<Record<UniqueCategoryId, string>> | undefined
): Set<string> => {
  const keys = new Set<string>()
  for (const category of challenge.categories) {
    const id = row?.[category]
    const entry =
      id !== undefined ? uniqueEntryForAnswer(registers, category, challenge.letter, id) : undefined
    if (entry) keys.add(uniqueNameKey(entry.name))
  }
  return keys
}

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
    challenge.categories.every(category => challenge.state.locked[playerId]?.includes(category))
  )

/**
 * Which blank the console should be writing into, given the one it is on now.
 * A still-open slot KEEPS focus — the caller re-runs this as snapshots land,
 * and a rival's lock must never move a player's cursor mid-word (that reroutes
 * the typed answer to another category's register). Focus only steps when the
 * current slot is spent, and then to the next open blank in board order —
 * never back to slot zero, which by mid-round is usually taken.
 * `undefined` means the player is all in.
 */
export const nextOpenCategory = (
  categories: UniqueCategoryId[],
  locked: UniqueCategoryId[],
  current: UniqueCategoryId
): UniqueCategoryId | undefined => {
  if (categories.includes(current) && !locked.includes(current)) return current
  return categories.find(category => !locked.includes(category))
}

/**
 * The reveal's collision grid and the scores, in one pass. Cells group by
 * normalized name, not register id — Córdoba (AR) and Córdoba (ES) are the
 * same word at a Scattergories table and cancel each other. A slot pays its
 * category's share of the pot (integer, the shares sum exactly to the pot)
 * only when exactly one player holds its word; empty and off-register slots
 * pay nothing.
 */
export const resolveUniqueCollisions = (
  challenge: UniqueOrBustChallenge,
  answers: UniqueAnswerSheet,
  registers: Record<UniqueCategoryId, UniqueEntry[]>
): {
  results: { [category in UniqueCategoryId]?: UniqueBoardCell[] }
  scores: { [playerId: string]: { scored: number; maximum: number } }
} => {
  const shares = uniqueCategoryShares(challenge.maximumPoints, challenge.categories.length)
  const results: { [category in UniqueCategoryId]?: UniqueBoardCell[] } = {}
  const banked: { [playerId: string]: number } = {}

  for (const [categoryIndex, category] of challenge.categories.entries()) {
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
      cell.scored = cell.holders.length === 1 ? shares[categoryIndex] : 0
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
