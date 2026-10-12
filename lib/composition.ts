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
 * The view grades every placement as it lands and the server replays the same
 * attempt sequence through `replayPlacements`, so the two can never disagree
 * about a strike, a fit or the pay.
 */

/**
 * Neighbouring groups closer than this are one tier: either origin fits either
 * slot. 78 of the 102 dealt boards hold such a pair somewhere below the head
 * (Türkiye's Iraq, Germany, Bulgaria and Afghanistan all sit within 5.9–4.9%),
 * and ordering them strictly would grade a coin flip as knowledge.
 */
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

/** Wrong placements that end a seat's round. Blind play pays about a third of
 *  the pot on easy, a fifth on normal and a seventh on hard — pinned in
 *  composition.test.ts. */
export const COMPOSITION_STRIKES: { [difficulty in GameDifficulty]: number } = {
  easy: 3,
  normal: 3,
  hard: 2,
}

export const COMPOSITION_SECONDS = 45

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

type CompositionBoard = Pick<CompositionChallenge, 'slices' | 'strikes'>

/** Each slot's tier: neighbours within `COMPOSITION_TIE_RATIO` chain into one. */
export const compositionTiers = (slices: CompositionBoard['slices']): number[] => {
  let tier = 0
  return slices.map((slice, index) => {
    const above = slices[index - 1]
    if (above && above.share > slice.share * COMPOSITION_TIE_RATIO) tier += 1
    return tier
  })
}

/** Whether `isoCode` belongs on `slot` — its own group, or one tied with it. */
export const placementFits = (
  board: CompositionBoard,
  isoCode: ISOCountryCode,
  slot: number
): boolean => {
  const truth = board.slices.findIndex(slice => slice.isoCode === isoCode)
  if (truth < 0 || slot < 0 || slot >= board.slices.length) return false
  const tiers = compositionTiers(board.slices)
  return tiers[truth] === tiers[slot]
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
  const placed: PlacementReplay['placed'] = {}
  const misses: CompositionPlacement[] = []
  const full = () => Object.keys(placed).length >= board.slices.length
  for (const attempt of attempts) {
    if (misses.length >= board.strikes || full()) break
    if (placed[attempt.slot] || Object.values(placed).includes(attempt.isoCode)) continue
    if (placementFits(board, attempt.isoCode, attempt.slot)) placed[attempt.slot] = attempt.isoCode
    else misses.push(attempt)
  }
  return { placed, misses, over: misses.length >= board.strikes || full() }
}

/**
 * The one card left once every other group is filled. It always fits the last
 * slot — every tier holds exactly as many cards as slots — so the view drops
 * it in rather than make the player tap a foregone answer.
 */
export const forcedPlacement = (
  board: CompositionBoard,
  replay: PlacementReplay
): CompositionPlacement | undefined => {
  if (replay.over) return undefined
  const standing = new Set(Object.values(replay.placed))
  const cards = board.slices.filter(slice => !standing.has(slice.isoCode))
  const slots = board.slices.map((_, slot) => slot).filter(slot => !replay.placed[slot])
  return cards.length === 1 && slots.length === 1
    ? { isoCode: cards[0]!.isoCode, slot: slots[0]! }
    : undefined
}

/** What a slot pays: the head its weight, the rest an even share of what's left. */
export const slotPoints = (board: CompositionBoard, slot: number, maximumPoints: number) => {
  const others = board.slices.length - 1
  const fraction =
    slot === 0 ? (others ? COMPOSITION_HEAD_WEIGHT : 1) : (1 - COMPOSITION_HEAD_WEIGHT) / others
  return maximumPoints * fraction
}

export const scoreComposition = (
  board: CompositionBoard & { maximumPoints: number },
  attempts: readonly CompositionPlacement[]
): number => {
  const { placed } = replayPlacements(board, attempts)
  const earned = Object.keys(placed).reduce(
    (sum, slot) => sum + slotPoints(board, Number(slot), board.maximumPoints),
    0
  )
  return clampScore(Math.round(earned), board.maximumPoints)
}
