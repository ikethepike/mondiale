import Alea from 'alea'
import {
  individualChallengeAccessors,
  type IndividualChallengeAccessorId,
} from '~~/types/challenges/individual-challenge.type'
import type { GameLength, Tile } from '~~/types/game.types'
import { shuffleArray, weightedPick } from './arrays'

/** Relative deal weights for gate tiles — currency runs at a quarter rate so
 *  money questions surface noticeably less often than the other themes. */
const GATE_TILE_WEIGHTS: { [id in IndividualChallengeAccessorId]: number } = {
  flag: 1,
  isoCode: 1,
  'capital.name': 1,
  'government.leader': 1,
  currency: 0.25,
  landmarks: 1,
}

export const TILE_COUNTS: Record<GameLength, number> = {
  short: 40,
  medium: 65,
  long: 90,
}

/** Gate-to-gate gap draws. Mean 5, so overall density matches the old
 *  every-5th-tile board while the rhythm varies game to game. */
const GATE_GAP_WEIGHTS: readonly (readonly [number, number])[] = [
  [3, 1],
  [4, 2],
  [5, 3],
  [6, 2],
  [7, 1],
]
/** Tighter draws inside the climax zone — the run-up to the final arch. */
const CLIMAX_GAP_WEIGHTS: readonly (readonly [number, number])[] = [
  [3, 2],
  [4, 1],
]
/** How many tiles before the final count as the climax zone. Exported for the
 *  3D board's final-approach tinting. */
export const CLIMAX_TILES = 12
const FIRST_GATE_MIN = 4
/** The last gate sits at least this far before the final tile, so the final
 *  can never swallow a gate and the finish is always a clean sprint. */
const FINAL_BUFFER = 3
const GATE_DRAW_ATTEMPTS = 20

/** Walk the board dealing seeded gaps; climax-zone gaps draw tighter. */
const drawGatePositions = (count: number, random: () => number): number[] => {
  const lastAllowed = count - 1 - FINAL_BUFFER
  const climaxStart = count - 1 - CLIMAX_TILES
  const positions: number[] = []
  let position = FIRST_GATE_MIN + Math.floor(random() * 2)
  while (position <= lastAllowed) {
    positions.push(position)
    const weights = position >= climaxStart ? CLIMAX_GAP_WEIGHTS : GATE_GAP_WEIGHTS
    position += weightedPick(weights, random)!
  }
  return positions
}

/** Gate positions for a board: seeded draws, retried until every theme can
 *  appear at least once, with a fixed-stride fallback that always can. */
const gatePositions = (count: number, random: () => number): number[] => {
  for (let attempt = 0; attempt < GATE_DRAW_ATTEMPTS; attempt++) {
    const positions = drawGatePositions(count, random)
    if (positions.length >= individualChallengeAccessors.length) return positions
  }
  const positions: number[] = []
  for (let position = 5; position <= count - 1 - FINAL_BUFFER; position += 5) {
    positions.push(position)
  }
  return positions
}

/**
 * Themes for the dealt gates. Every accessor lands in a random slot first
 * (guaranteed coverage; all six differ, so they can never violate adjacency),
 * then the remaining slots fill by weighted draw excluding both neighbours —
 * adjacent gates differ by construction.
 */
const gateThemes = (count: number, random: () => number): IndividualChallengeAccessorId[] => {
  const themes: (IndividualChallengeAccessorId | undefined)[] = Array(count).fill(undefined)
  const slots = shuffleArray([...Array(count).keys()], random)
  individualChallengeAccessors.slice(0, count).forEach((theme, index) => {
    themes[slots[index]] = theme
  })

  for (let index = 0; index < count; index++) {
    if (themes[index]) continue
    const banned = new Set([themes[index - 1], themes[index + 1]])
    const entries = (
      Object.entries(GATE_TILE_WEIGHTS) as [IndividualChallengeAccessorId, number][]
    ).filter(([id]) => !banned.has(id))
    themes[index] = weightedPick(entries, random)!
  }

  return themes as IndividualChallengeAccessorId[]
}

/** Deterministic per seed (use the game id): every client and the server can
 *  agree on — and reproduce — the exact same board. */
export const generateTiles = (length: GameLength, seed: string): Tile[] => {
  const random = Alea(`${seed}:tiles`)
  const count = TILE_COUNTS[length]

  const tiles: Tile[] = [...Array(count)].map((_, index) => ({
    position: index,
    type: 'normal',
  }))
  tiles[0].type = 'start'
  tiles[count - 1].type = 'final'

  const positions = gatePositions(count, random)
  const themes = gateThemes(positions.length, random)
  positions.forEach((position, index) => {
    tiles[position].type = themes[index]
  })

  return tiles
}
