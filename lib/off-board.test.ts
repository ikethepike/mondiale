import { describe, expect, it } from 'vitest'
import { BORDERS } from '~~/data/borders.gen'
import { WATER_FEATURES } from '~~/data/water.gen'
import { isCountryInPlay, playableCountries } from '~~/lib/game-rules'
import { bordersButOffKey, touchesButOffKey } from '~~/lib/off-board'
import type { Game, GameDifficulty } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'

const rules = (difficulty: GameDifficulty) =>
  ({ difficulty, variant: 'world' }) as unknown as Game

/** The dealer's own answer key, rebuilt exactly as `getNeighbourBlitzChallenge` does. */
const neighbourKey = (game: Game, isoCode: ISOCountryCode) =>
  (BORDERS[isoCode] ?? []).filter(neighbour => isCountryInPlay(game, neighbour))

describe('bordersButOffKey', () => {
  it('catches the real neighbours a normal board benches', () => {
    const game = rules('normal')
    // San Marino is landlocked inside Italy; below hard mode it is off the key.
    expect(neighbourKey(game, 'IT')).not.toContain('SM')
    expect(bordersButOffKey('IT', neighbourKey(game, 'IT'), 'SM')).toBe(true)
    expect(bordersButOffKey('FR', neighbourKey(game, 'FR'), 'MC')).toBe(true)
    expect(bordersButOffKey('CH', neighbourKey(game, 'CH'), 'LI')).toBe(true)
  })

  it('is silent for a country that genuinely does not border the subject', () => {
    const game = rules('normal')
    // Japan borders nobody; a wrong guess must still cost.
    expect(bordersButOffKey('IT', neighbourKey(game, 'IT'), 'JP')).toBe(false)
    expect(bordersButOffKey('FR', neighbourKey(game, 'FR'), 'PT')).toBe(false)
  })

  it('never fires for a country already in the answer key', () => {
    const game = rules('normal')
    for (const subject of ['IT', 'FR', 'CH', 'AT'] as ISOCountryCode[]) {
      const key = neighbourKey(game, subject)
      for (const answer of key) {
        expect(bordersButOffKey(subject, key, answer), `${subject}/${answer}`).toBe(false)
      }
    }
  })

  it('never fires on hard, where the micro-nations are in play', () => {
    const game = rules('hard')
    expect(bordersButOffKey('IT', neighbourKey(game, 'IT'), 'SM')).toBe(false)
    expect(bordersButOffKey('FR', neighbourKey(game, 'FR'), 'MC')).toBe(false)
  })

  it('never fires for the subject itself', () => {
    expect(bordersButOffKey('IT', [], 'IT')).toBe(false)
  })

  it('sweeps every dealable subject without ever eating an answer', () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as GameDifficulty[]) {
      const game = rules(difficulty)
      for (const subject of playableCountries(game)) {
        const key = neighbourKey(game, subject)
        if (key.length < 4) continue
        for (const answer of key) {
          expect(bordersButOffKey(subject, key, answer), `${difficulty}/${subject}`).toBe(false)
        }
      }
    }
  })
})

describe('touchesButOffKey', () => {
  it('catches a real shore the deal benched', () => {
    // Monaco is on the Mediterranean; below hard mode it is off the key.
    const feature = Object.values(WATER_FEATURES).find(entry => entry.name === 'Mediterranean Sea')
    expect(feature?.countries).toContain('MC')
    const dealt = (feature?.countries ?? []).filter(isoCode =>
      isCountryInPlay(rules('normal'), isoCode)
    )
    expect(touchesButOffKey(feature?.countries, dealt, 'MC')).toBe(true)
  })

  it('is silent for a country the feature never touches, and for one on the key', () => {
    const feature = Object.values(WATER_FEATURES).find(entry => entry.name === 'Mediterranean Sea')
    const shores = feature?.countries ?? []
    expect(touchesButOffKey(shores, shores, 'JP')).toBe(false)
    for (const shore of shores) expect(touchesButOffKey(shores, shores, shore)).toBe(false)
  })

  it('is silent when the geometry has not loaded yet', () => {
    expect(touchesButOffKey(undefined, [], 'MC')).toBe(false)
    expect(touchesButOffKey([], [], 'MC')).toBe(false)
  })
})
