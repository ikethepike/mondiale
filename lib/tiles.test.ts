import { describe, expect, it } from 'vitest'
import { individualChallengeAccessors } from '~~/types/challenges/individual-challenge.type'
import { gameLengths, type Tile } from '~~/types/game.types'
import { CLIMAX_TILES, generateTiles, TILE_COUNTS } from './tiles'

const SEEDS = [...Array(60)].map((_, index) => `seed-${index}`)
const FINAL_BUFFER = 3
const isGate = (tile: Tile) => !['start', 'normal', 'final'].includes(tile.type)
const gatesOf = (tiles: Tile[]) => tiles.filter(isGate)

describe('generateTiles', () => {
  it('is deterministic per seed and varies across seeds', () => {
    for (const length of gameLengths) {
      expect(generateTiles(length, 'alpha')).toEqual(generateTiles(length, 'alpha'))
    }
    const boards = SEEDS.map(seed => JSON.stringify(generateTiles('medium', seed)))
    expect(new Set(boards).size).toBeGreaterThan(1)
  })

  it('deals the configured count with one start and one final', () => {
    for (const length of gameLengths) {
      for (const seed of SEEDS) {
        const tiles = generateTiles(length, seed)
        expect(tiles).toHaveLength(TILE_COUNTS[length])
        expect(tiles[0].type).toBe('start')
        expect(tiles[tiles.length - 1].type).toBe('final')
        expect(tiles.filter(tile => tile.type === 'start')).toHaveLength(1)
        expect(tiles.filter(tile => tile.type === 'final')).toHaveLength(1)
        tiles.forEach((tile, index) => expect(tile.position).toBe(index))
      }
    }
  })

  it('spaces gates 3-7 apart and never against the final tile', () => {
    for (const length of gameLengths) {
      for (const seed of SEEDS) {
        const tiles = generateTiles(length, seed)
        const positions = gatesOf(tiles).map(tile => tile.position)
        expect(positions[0]).toBeGreaterThanOrEqual(4)
        for (let index = 1; index < positions.length; index++) {
          const gap = positions[index] - positions[index - 1]
          expect(gap).toBeGreaterThanOrEqual(3)
          expect(gap).toBeLessThanOrEqual(7)
        }
        expect(positions[positions.length - 1]).toBeLessThanOrEqual(
          tiles.length - 1 - FINAL_BUFFER
        )
      }
    }
  })

  it('keeps overall gate density near one gate per five tiles', () => {
    for (const length of gameLengths) {
      const totalGates = SEEDS.reduce(
        (sum, seed) => sum + gatesOf(generateTiles(length, seed)).length,
        0
      )
      const averageDensity = totalGates / SEEDS.length / TILE_COUNTS[length]
      expect(averageDensity).toBeGreaterThan(0.2 * 0.8)
      expect(averageDensity).toBeLessThan(0.2 * 1.25)
    }
  })

  it('packs the climax zone denser than the body of the board', () => {
    for (const length of gameLengths) {
      let climaxGates = 0
      let bodyGates = 0
      let climaxTiles = 0
      let bodyTiles = 0
      for (const seed of SEEDS) {
        const tiles = generateTiles(length, seed)
        const climaxStart = tiles.length - 1 - CLIMAX_TILES
        for (const tile of gatesOf(tiles)) {
          if (tile.position >= climaxStart) climaxGates++
          else bodyGates++
        }
        climaxTiles += CLIMAX_TILES
        bodyTiles += tiles.length - CLIMAX_TILES
      }
      expect(climaxGates / climaxTiles).toBeGreaterThan(bodyGates / bodyTiles)
    }
  })

  it('covers every theme and never repeats a theme on adjacent gates', () => {
    for (const length of gameLengths) {
      for (const seed of SEEDS) {
        const gates = gatesOf(generateTiles(length, seed))
        const themes = gates.map(gate => gate.type)
        for (const accessor of individualChallengeAccessors) {
          expect(themes).toContain(accessor)
        }
        for (let index = 1; index < themes.length; index++) {
          expect(themes[index]).not.toBe(themes[index - 1])
        }
      }
    }
  })

  it('keeps currency scarce', () => {
    let currency = 0
    let total = 0
    for (const seed of SEEDS) {
      const gates = gatesOf(generateTiles('long', seed))
      currency += gates.filter(gate => gate.type === 'currency').length
      total += gates.length
    }
    // One guaranteed deal per board plus a down-weighted trickle — well under
    // an even 1/6 share
    expect(currency / total).toBeLessThan(1 / 6)
  })
})
