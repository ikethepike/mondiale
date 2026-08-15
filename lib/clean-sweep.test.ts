import { describe, expect, it } from 'vitest'
import {
  FAIR_SHARE_PAY,
  SWEEP_SETS,
  SWEEP_TUNING,
  sweepBoardFor,
  sweepOffBoardFor,
  sweepClaimFraction,
  sweepClaimedBy,
  sweepCloserId,
  sweepIsComplete,
  sweepLeaders,
  sweepPots,
  sweepScoresFromClaims,
  sweepSecondsToSpare,
  sweepSlotBand,
  sweepStandings,
  sweepUnclaimed,
  viableSweepSets,
} from '~~/lib/clean-sweep'
import { DATASETS } from '~~/lib/attribution'
import { playableCountries } from '~~/lib/game-rules'
import type { CleanSweepChallenge, SweepClaim } from '~~/types/challenges/group-modes.type'
import type { GameDifficulty, GameRules, GameVariant } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'

const RULES: GameRules = { variant: 'world', difficulty: 'normal' }

const DIFFICULTIES: GameDifficulty[] = ['easy', 'normal', 'hard']
const VARIANTS: GameVariant[] = [
  'world',
  'europe',
  'africa',
  'asia',
  'north-america',
  'south-america',
]

const claim = (isoCode: string, playerId: string, remaining = 0.5): SweepClaim => ({
  isoCode: isoCode as ISOCountryCode,
  playerId,
  at: 0,
  remaining,
})

const board = (
  members: string[],
  claims: SweepClaim[],
  order: string[],
  maximumPoints = 20
): CleanSweepChallenge => ({
  _type: 'clean-sweep-challenge',
  setId: 'eu',
  members: members as ISOCountryCode[],
  durationSeconds: 80,
  maximumPoints,
  state: { ready: [], deadline: 0, order, claims, strays: [], benched: {} },
})

describe('the set register', () => {
  it('claims a real dataset for every set, so the ⓘ can always cite one', () => {
    for (const [setId, spec] of Object.entries(SWEEP_SETS)) {
      expect(DATASETS[spec.dataset], setId).toBeDefined()
    }
  })

  it('resolves every set without throwing, on every board', () => {
    for (const variant of VARIANTS) {
      for (const difficulty of DIFFICULTIES) {
        for (const [setId, spec] of Object.entries(SWEEP_SETS)) {
          expect(
            () => spec.members({ variant, difficulty }),
            `${setId} on ${variant}`
          ).not.toThrow()
        }
      }
    }
  })

  it('only ever resolves countries that are in play', () => {
    const playable = new Set(playableCountries(RULES))
    for (const [setId, spec] of Object.entries(SWEEP_SETS)) {
      for (const isoCode of spec.members(RULES)) {
        expect(playable.has(isoCode), `${setId}: ${isoCode}`).toBe(true)
      }
    }
  })

  it('fields a board at every difficulty on the world map', () => {
    for (const difficulty of DIFFICULTIES) {
      const band = sweepSlotBand(difficulty, 2)
      expect(viableSweepSets({ ...RULES, difficulty }, band).length, difficulty).toBeGreaterThan(0)
    }
  })

  it('keeps hard-only sets out of easier games', () => {
    const band = sweepSlotBand('easy', 2)
    for (const setId of viableSweepSets({ ...RULES, difficulty: 'easy' }, band)) {
      expect(SWEEP_SETS[setId].hardOnly, setId).not.toBe(true)
    }
  })

  it('never deals a board outside the table’s band', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const contenders of [2, 4, 6]) {
        const band = sweepSlotBand(difficulty, contenders)
        for (const setId of viableSweepSets({ ...RULES, difficulty }, band)) {
          const members = sweepBoardFor(setId, { ...RULES, difficulty }, band)!
          expect(members.length, `${setId} @${difficulty}/${contenders}`).toBeGreaterThanOrEqual(
            band.minimum
          )
          expect(members.length, `${setId} @${difficulty}/${contenders}`).toBeLessThanOrEqual(
            band.maximum
          )
        }
      }
    }
  })

  it('windows an oversized register by its own ordering, never by sampling', () => {
    const band = { minimum: 4, maximum: 6 }
    const first = sweepBoardFor('marriage-equality', RULES, band)
    const second = sweepBoardFor('marriage-equality', RULES, band)
    expect(first).toHaveLength(6)
    // Same board twice: a sampled window would make the prompt's promise a lie
    // ("the first six to legalise it") and the round non-reproducible.
    expect(first).toEqual(second)
    expect(first).toEqual(SWEEP_SETS['marriage-equality'].members(RULES).slice(0, 6))
  })

  it('raises the board floor as the table grows', () => {
    expect(sweepSlotBand('normal', 6).minimum).toBeGreaterThan(sweepSlotBand('normal', 2).minimum)
  })

  it('refuses a set that would swallow its own board', () => {
    // South America IS the south-america variant — a round asking for every
    // country on the board is not a question.
    const band = sweepSlotBand('normal', 2)
    expect(
      sweepBoardFor('south-america', { variant: 'south-america', difficulty: 'normal' }, band)
    ).toBeUndefined()
    expect(sweepBoardFor('south-america', RULES, band)).toBeDefined()
  })

  it('gives every difficulty a clock', () => {
    for (const difficulty of DIFFICULTIES) {
      expect(SWEEP_TUNING[difficulty].durationSeconds, difficulty).toBeGreaterThan(0)
    }
  })
})

describe('reading the board', () => {
  const challenge = board(
    ['FR', 'DE', 'IT', 'ES'],
    [claim('FR', 'ada'), claim('DE', 'ben'), claim('IT', 'ada')],
    ['ada', 'ben']
  )

  it('attributes each slot to the seat that got there first', () => {
    expect(sweepClaimedBy(challenge)).toEqual({ FR: 'ada', DE: 'ben', IT: 'ada' })
  })

  it('never lets a later duplicate steal an owned slot', () => {
    const contested = board(['FR'], [claim('FR', 'ada'), claim('FR', 'ben')], ['ada', 'ben'])
    expect(sweepClaimedBy(contested).FR).toBe('ada')
  })

  it('reports the slots nobody reached', () => {
    expect(sweepUnclaimed(challenge)).toEqual(['ES'])
    expect(sweepIsComplete(challenge)).toBe(false)
  })

  it('ranks the table by claims', () => {
    expect(sweepStandings(challenge)).toEqual([
      { playerId: 'ada', claimed: ['FR', 'IT'] },
      { playerId: 'ben', claimed: ['DE'] },
    ])
  })

  it('holds deal order on a tie, so joint leaders never jitter', () => {
    const level = board(['FR', 'DE'], [claim('DE', 'ben'), claim('FR', 'ada')], ['ada', 'ben'])
    // Ben claimed first, but the rail is not a recency list — a tie keeps the
    // seating, or the two would swap places on every snapshot.
    expect(sweepStandings(level).map(seat => seat.playerId)).toEqual(['ada', 'ben'])
  })

  it('lists a seat that never claimed anything', () => {
    const quiet = board(['FR'], [claim('FR', 'ada')], ['ada', 'ben'])
    expect(sweepStandings(quiet)).toContainEqual({ playerId: 'ben', claimed: [] })
  })

  it('crowns whoever is ahead, joint leaders included', () => {
    expect(sweepLeaders(challenge)).toEqual(['ada'])
    const joint = board(
      ['FR', 'DE', 'IT', 'ES'],
      [claim('FR', 'ada'), claim('DE', 'ben'), claim('IT', 'cy'), claim('ES', 'ben')],
      ['ada', 'ben', 'cy']
    )
    expect(sweepLeaders(joint)).toEqual(['ben'])
  })

  it('crowns nobody when the table is level — at nothing or at six', () => {
    // Round start: three seats on zero. Marking all three says nothing and
    // shouts while saying it.
    expect(sweepLeaders(board(['FR', 'DE'], [], ['ada', 'ben', 'cy']))).toEqual([])
    // And a dead heat is no more of a lead than an empty board.
    const level = board(['FR', 'DE'], [claim('FR', 'ada'), claim('DE', 'ben')], ['ada', 'ben'])
    expect(sweepLeaders(level)).toEqual([])
  })

  it('quotes a margin only for a board that actually cleared', () => {
    // The sentence and the sweep bonus read the same stamped `remaining`, so a
    // board that stood has no margin to quote.
    expect(sweepSecondsToSpare(challenge)).toBe(0)
    const swept = board(
      ['FR', 'DE'],
      [claim('FR', 'ada', 0.9), claim('DE', 'ben', 0.25)],
      ['ada', 'ben']
    )
    // 0.25 of an 80s clock, off the LAST claim — the one that cleared it.
    expect(sweepSecondsToSpare(swept)).toBe(20)
  })

  it('names a closer only when the board actually cleared', () => {
    expect(sweepCloserId(challenge)).toBeUndefined()
    const swept = board(['FR', 'DE'], [claim('FR', 'ada'), claim('DE', 'ben')], ['ada', 'ben'])
    expect(sweepCloserId(swept)).toBe('ben')
  })
})

describe('the pot', () => {
  it('splits into shares that sum exactly to the maximum', () => {
    for (const maximum of [1, 3, 7, 10, 20, 33]) {
      const pots = sweepPots(maximum)
      expect(pots.claims + pots.sweep + pots.closer, `${maximum}`).toBe(maximum)
    }
  })

  it('pays the fair share less than the whole board', () => {
    // Four seats, twenty slots: five each is the fair share.
    expect(sweepClaimFraction(5, 20, 4)).toBeCloseTo(FAIR_SHARE_PAY)
    expect(sweepClaimFraction(20, 20, 4)).toBeCloseTo(1)
    expect(sweepClaimFraction(0, 20, 4)).toBe(0)
  })

  it('rises monotonically with claims', () => {
    let previous = -1
    for (let claimed = 0; claimed <= 20; claimed++) {
      const fraction = sweepClaimFraction(claimed, 20, 4)
      expect(fraction).toBeGreaterThan(previous)
      previous = fraction
    }
  })

  it('treats the whole board as the fair share at a table of one', () => {
    expect(sweepClaimFraction(10, 20, 1)).toBeCloseTo(0.5)
    expect(sweepClaimFraction(20, 20, 1)).toBeCloseTo(1)
  })
})

describe('scoring the round', () => {
  it('pays nobody the sweep bonus when the board stands', () => {
    const scores = sweepScoresFromClaims(
      board(['FR', 'DE', 'IT', 'ES'], [claim('FR', 'ada')], ['ada', 'ben'])
    )
    // Ben claimed nothing and the board was never cleared — a clean zero.
    expect(scores.ben.scored).toBe(0)
    expect(scores.ada.scored).toBeGreaterThan(0)
  })

  it('pays every seat the sweep bonus when the table clears it', () => {
    const scores = sweepScoresFromClaims(
      board(['FR', 'DE'], [claim('FR', 'ada', 0.9), claim('DE', 'ada', 0.8)], ['ada', 'ben'])
    )
    // Ben claimed nothing and still banks the shared stake in the sweep.
    expect(scores.ben.scored).toBeGreaterThan(0)
  })

  it('pays the closer on top', () => {
    const swept = board(
      ['FR', 'DE'],
      [claim('FR', 'ada', 0.9), claim('DE', 'ben', 0.8)],
      ['ada', 'ben']
    )
    const scores = sweepScoresFromClaims(swept)
    // One claim each and the same sweep bonus, so the gap IS the closer share.
    expect(scores.ben.scored - scores.ada.scored).toBe(sweepPots(swept.maximumPoints).closer)
  })

  it('pays a faster sweep more than a slower one', () => {
    const at = (remaining: number) =>
      sweepScoresFromClaims(
        board(['FR', 'DE'], [claim('FR', 'ada', 1), claim('DE', 'ben', remaining)], ['ada', 'ben'])
      ).ada.scored
    expect(at(0.9)).toBeGreaterThan(at(0.05))
  })

  it('never pays more than the pot, however lopsided the board', () => {
    const swept = board(
      ['FR', 'DE', 'IT'],
      [claim('FR', 'ada', 1), claim('DE', 'ada', 1), claim('IT', 'ada', 1)],
      ['ada', 'ben']
    )
    for (const score of Object.values(sweepScoresFromClaims(swept))) {
      expect(score.scored).toBeLessThanOrEqual(swept.maximumPoints)
      expect(score.scored).toBeGreaterThanOrEqual(0)
    }
  })

  it('scores every seat at the table, claimed or not', () => {
    const scores = sweepScoresFromClaims(
      board(['FR', 'DE'], [claim('FR', 'ada')], ['ada', 'ben', 'cy'])
    )
    expect(Object.keys(scores).sort()).toEqual(['ada', 'ben', 'cy'])
  })

  it('is a pure function of the snapshot — re-running it never drifts', () => {
    const swept = board(
      ['FR', 'DE'],
      [claim('FR', 'ada', 0.7), claim('DE', 'ben', 0.6)],
      ['ada', 'ben']
    )
    expect(sweepScoresFromClaims(swept)).toEqual(sweepScoresFromClaims(swept))
  })
})

describe('sweepOffBoardFor', () => {
  const rules = (variant: GameVariant, difficulty: GameDifficulty = 'normal') =>
    ({ variant, difficulty }) as GameRules

  it('names the members the band trimmed away', () => {
    // "Name every member of NATO" deals 30 of 32 on a hard world board —
    // the United States and the United Kingdom fall off the alphabetical tail.
    const band = sweepSlotBand('hard', 2)
    const dealt = sweepBoardFor('nato', rules('world', 'hard'), band)!
    const off = sweepOffBoardFor('nato', rules('world', 'hard'), dealt)
    expect(off.length).toBeGreaterThan(0)
    for (const isoCode of off) expect(dealt).not.toContain(isoCode)
    // Every name it yields is a real member — never a stray.
    const everywhere = SWEEP_SETS.nato!.members({
      variant: 'world',
      difficulty: 'hard',
      includeMicroNations: true,
    } as GameRules)
    for (const isoCode of off) expect(everywhere).toContain(isoCode)
  })

  it('names the members a continental board leaves out', () => {
    const band = sweepSlotBand('normal', 2)
    const dealt = sweepBoardFor('nato', rules('europe'), band)
    if (!dealt) return
    const off = sweepOffBoardFor('nato', rules('europe'), dealt)
    // The United States and Canada are NATO members standing off a Europe board.
    expect(off).toContain('US')
    expect(off).toContain('CA')
  })

  it('never calls a dealt member off-board', () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as GameDifficulty[]) {
      for (const variant of ['world', 'europe', 'asia'] as GameVariant[]) {
        const band = sweepSlotBand(difficulty, 2)
        for (const setId of Object.keys(SWEEP_SETS)) {
          const dealt = sweepBoardFor(setId, rules(variant, difficulty), band)
          if (!dealt) continue
          const off = sweepOffBoardFor(setId, rules(variant, difficulty), dealt)
          for (const isoCode of dealt) {
            expect(off, `${difficulty}/${variant}/${setId}`).not.toContain(isoCode)
          }
        }
      }
    }
  })
})
