import { clampScore } from './scoring'
import type {
  CompositionChallenge,
  CompositionPlacement,
} from '~~/types/challenges/group-modes.type'
import type { GameDifficulty } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * Composition's rules: the foreign-born crowd is dealt as anonymous groups,
 * largest first, and each origin card is placed onto the group it belongs to.
 *
 * Which origin each group is lives only on the server (`compositionOrigins`):
 * the drop handler grades every placement through `replayPlacements` and the
 * grader pays the same replay, so a strike, a fit and the pay are one rule.
 */

/** Neighbouring groups closer than this are one tier: either origin fits either
 *  slot, because ordering a near-tie would grade a coin flip as knowledge. */
export const COMPOSITION_TIE_RATIO = 1.15

/** The largest group's slice of the pot — it is still the question the board is
 *  gated on (`COMPOSITION_MIN_MARGIN`), so knowing it matters most. */
export const COMPOSITION_HEAD_WEIGHT = 0.4

/** Groups dealt onto the crowd. */
export const COMPOSITION_SLOTS: { [difficulty in GameDifficulty]: number } = {
  easy: 5,
  normal: 6,
  hard: 6,
}

/** Wrong placements that end a seat's round. What blind play earns under them
 *  is pinned in composition.test.ts. */
export const COMPOSITION_STRIKES: { [difficulty in GameDifficulty]: number } = {
  easy: 3,
  normal: 3,
  hard: 2,
}

export const COMPOSITION_SECONDS = 45

/** The redis side key holding every seat's attempts for one round. */
export const compositionSheetKey = (gameId: string, roundIndex: number) =>
  `${gameId}:composition:${roundIndex}`

/** Where the client store files a seat's board for one round. */
export const compositionBoardKey = (gameId: string, round: number) => `${gameId}:${round}`

/** A submission's placements as the server may trust them: well-formed
 *  entries only, everything else dropped rather than thrown on. */
export const parsePlacements = (raw: unknown): CompositionPlacement[] =>
  Array.isArray(raw)
    ? raw.flatMap(entry =>
        entry &&
        typeof entry === 'object' &&
        typeof entry.isoCode === 'string' &&
        Number.isInteger(entry.slot)
          ? [{ isoCode: entry.isoCode as ISOCountryCode, slot: entry.slot as number }]
          : []
      )
    : []

/** A dealt board with its answer: `key[slot]` is the origin each group is. */
export type CompositionBoard = Pick<CompositionChallenge, 'shares' | 'strikes'> & {
  key: readonly ISOCountryCode[]
}

/** Each slot's tier: neighbours within `COMPOSITION_TIE_RATIO` chain into one. */
export const compositionTiers = (shares: readonly number[]): number[] => {
  let tier = 0
  return shares.map((share, index) => {
    const above = shares[index - 1]
    if (above !== undefined && above > share * COMPOSITION_TIE_RATIO) tier += 1
    return tier
  })
}

export interface PlacementReplay {
  /** Slot → the origin standing on it. */
  placed: Partial<Record<number, ISOCountryCode>>
  /** Wrong placements, in the order they were made. */
  misses: CompositionPlacement[]
  /** Out of strikes, or every group filled — later attempts are ignored. */
  over: boolean
}

/**
 * Plays a seat's attempts in order. An attempt on a filled slot or with a card
 * already standing is no move at all; one that misses spends a strike, and the
 * last strike ends the seat's round.
 */
export const replayPlacements = (
  board: CompositionBoard,
  attempts: readonly CompositionPlacement[]
): PlacementReplay => {
  const tiers = compositionTiers(board.shares)
  const tierOf = new Map(board.key.map((isoCode, slot) => [isoCode, tiers[slot]]))
  const placed: PlacementReplay['placed'] = {}
  const standing = new Set<ISOCountryCode>()
  const misses: CompositionPlacement[] = []
  const full = () => standing.size >= board.key.length
  for (const attempt of attempts) {
    if (misses.length >= board.strikes || full()) break
    if (placed[attempt.slot] || standing.has(attempt.isoCode)) continue
    const truth = tierOf.get(attempt.isoCode)
    if (truth !== undefined && truth === tiers[attempt.slot]) {
      placed[attempt.slot] = attempt.isoCode
      standing.add(attempt.isoCode)
    } else misses.push(attempt)
  }
  return { placed, misses, over: misses.length >= board.strikes || full() }
}

/**
 * The one card left once every other group is filled. It always fits the last
 * slot — every tier holds exactly as many cards as slots — so it drops in by
 * itself rather than make the player tap a foregone answer.
 */
export const forcedPlacement = (
  board: CompositionBoard,
  replay: PlacementReplay
): CompositionPlacement | undefined => {
  if (replay.over) return undefined
  const standing = new Set(Object.values(replay.placed))
  const cards = board.key.filter(isoCode => !standing.has(isoCode))
  const slots = board.key.map((_, slot) => slot).filter(slot => !replay.placed[slot])
  return cards.length === 1 && slots.length === 1
    ? { isoCode: cards[0]!, slot: slots[0]! }
    : undefined
}

/** What a slot pays: the head its weight, the rest an even share of what's left. */
export const slotPoints = (slots: number, slot: number, maximumPoints: number) => {
  const others = slots - 1
  const fraction =
    slot === 0 ? (others ? COMPOSITION_HEAD_WEIGHT : 1) : (1 - COMPOSITION_HEAD_WEIGHT) / others
  return maximumPoints * fraction
}

/** What a replayed board pays. */
export const compositionPay = (
  board: CompositionBoard & { maximumPoints: number },
  replay: PlacementReplay
): number => {
  const earned = Object.keys(replay.placed).reduce(
    (sum, slot) => sum + slotPoints(board.key.length, Number(slot), board.maximumPoints),
    0
  )
  return clampScore(Math.round(earned), board.maximumPoints)
}

export const scoreComposition = (
  board: CompositionBoard & { maximumPoints: number },
  attempts: readonly CompositionPlacement[]
): number => compositionPay(board, replayPlacements(board, attempts))

/**
 * Who stands on each group at the reveal: what the seat placed, and in every
 * group it left empty, an origin of that group's tier it never placed — so a
 * tied origin dropped on its neighbour's slot is never also shown as missed.
 */
export const revealedSlots = (
  board: Pick<CompositionBoard, 'key' | 'shares'>,
  placed: PlacementReplay['placed']
): Record<number, ISOCountryCode> => {
  const tiers = compositionTiers(board.shares)
  const standing = new Set(Object.values(placed))
  const unplaced = board.key
    .map((isoCode, slot) => ({ isoCode, tier: tiers[slot] }))
    .filter(origin => !standing.has(origin.isoCode))
  return Object.fromEntries(
    board.key.map((_, slot) => {
      const own = placed[slot]
      if (own) return [slot, own]
      const index = unplaced.findIndex(origin => origin.tier === tiers[slot])
      return [slot, unplaced.splice(index, 1)[0]!.isoCode]
    })
  )
}
