import { afterEach, describe, expect, it } from 'vitest'
import { COUNTRIES } from '~~/data/countries.gen'
import { getRoundChallenge } from '~~/lib/challenges'
import {
  COMPOSITION_HEAD_WEIGHT,
  COMPOSITION_SECONDS,
  COMPOSITION_SLOTS,
  COMPOSITION_STRIKES,
  COMPOSITION_TIE_RATIO,
  compositionTiers,
  forcedPlacement,
  replayPlacements,
  scoreComposition,
} from '~~/lib/composition'
import { gradeGroupAnswer } from '~~/lib/events/server/grade-group-answer'
import {
  compositionBoards,
  COMPOSITION_CLEAR_MARGIN,
  COMPOSITION_MIN_MARGIN,
  COMPOSITION_MIN_SLICES,
  COMPOSITION_MIN_TOTAL,
  corridorMargin,
  corridorsToDestination,
} from '~~/lib/migration'
import type {
  CompositionChallenge,
  CompositionPlacement,
} from '~~/types/challenges/group-modes.type'
import type { Game, GameDifficulty, Round } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'

const game = (difficulty: GameDifficulty) =>
  ({
    regions: [],
    difficulty,
    rounds: [{}],
    players: { a: { phase: 'group-challenge' } },
  }) as unknown as Game

const deal = async (difficulty: GameDifficulty) => {
  process.env.FORCE_ROUND_TYPE = 'composition'
  return (await getRoundChallenge({ game: game(difficulty) })) as CompositionChallenge
}

afterEach(() => {
  delete process.env.FORCE_ROUND_TYPE
})

describe('compositionBoards', () => {
  const pool = Object.keys(COUNTRIES) as ISOCountryCode[]

  it('keeps only boards with a bar worth reading and a decisive leader', () => {
    for (const isoCode of compositionBoards(pool)) {
      const origins = corridorsToDestination(isoCode)
      expect(origins.length).toBeGreaterThanOrEqual(COMPOSITION_MIN_SLICES)
      const total = origins.reduce((sum, origin) => sum + origin.value.amount, 0)
      expect(total).toBeGreaterThanOrEqual(COMPOSITION_MIN_TOTAL)
      expect(corridorMargin(origins)).toBeGreaterThanOrEqual(COMPOSITION_MIN_MARGIN)
    }
  })

  it('drops the boards where naming the largest origin is a coin-flip', () => {
    // The Netherlands (Poland vs Türkiye) and Canada (India vs the
    // Philippines) sit inside a rounding error of each other — asking for the
    // largest there would teach a guess as a fact
    const boards = compositionBoards(pool)
    for (const isoCode of ['NL', 'CA'] as ISOCountryCode[]) {
      expect(corridorMargin(corridorsToDestination(isoCode))).toBeLessThan(COMPOSITION_MIN_MARGIN)
      expect(boards).not.toContain(isoCode)
    }
  })

  it('leaves the mode well stocked on the world board', () => {
    // A migration regeneration that half-parses still type-checks; this is
    // what catches the dealer quietly starving
    expect(compositionBoards(pool).length).toBeGreaterThanOrEqual(60)
  })
})

describe('getCompositionChallenge (via getRoundChallenge)', () => {
  it('deals a sorted bar whose shares never exceed the whole', async () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      const challenge = await deal(difficulty)
      expect(challenge._type).toBe('composition-challenge')
      expect(challenge.slices.length).toBeGreaterThanOrEqual(COMPOSITION_MIN_SLICES)

      const shares = challenge.slices.map(slice => slice.share)
      expect([...shares].sort((a, b) => b - a)).toEqual(shares)
      // Shares are of the country's whole foreign-born population, so the
      // listed head sums to less than 1 — the rest is the long tail. The
      // generator rounds each share to 4 decimals independently, so a board
      // whose origins nearly exhaust its population can land a hair over
      // (Nepal and Rwanda both reach 1.0001); the bar clamps its tail at 0.
      expect(shares.reduce((sum, share) => sum + share, 0)).toBeLessThanOrEqual(1.001)
      expect(new Set(challenge.slices.map(slice => slice.isoCode)).size).toBe(
        challenge.slices.length
      )
    }
  })

  it('deals every group as a card, with the difficulty setting groups, strikes and shares', async () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      const challenge = await deal(difficulty)
      expect([...challenge.options].sort()).toEqual(
        [...challenge.slices.map(slice => slice.isoCode)].sort()
      )
      expect(challenge.slices.length).toBeLessThanOrEqual(COMPOSITION_SLOTS[difficulty])
      expect(challenge.strikes).toBe(COMPOSITION_STRIKES[difficulty])
      expect(challenge.showShares).toBe(difficulty !== 'hard')
    }
  })

  it('never deals a board whose leader is not decisive', async () => {
    const boards = new Set(compositionBoards(Object.keys(COUNTRIES) as ISOCountryCode[]))
    for (let round = 0; round < 25; round++) {
      const challenge = await deal('hard')
      expect(boards).toContain(challenge.country)
      expect(corridorMargin(corridorsToDestination(challenge.country))).toBeGreaterThanOrEqual(
        COMPOSITION_MIN_MARGIN
      )
    }
  })

  it('scales the board by difficulty, not just the console', async () => {
    // The option table is always the bar's own origins, so it cannot narrow
    // with difficulty — the board carries the scaling instead. Without this,
    // easy and normal dealt identical rounds.
    //
    // Asserted as pool composition, not as an ordering of medians: normal is
    // an untiered shuffle of every board, so its median sits near hard's and
    // the two cross by chance often enough to make that flaky (~4% per run).
    // What the tiering actually guarantees is which boards each end can draw.
    const blowoutShare = async (difficulty: GameDifficulty) => {
      let clear = 0
      for (let round = 0; round < 40; round++) {
        const challenge = await deal(difficulty)
        if (corridorMargin(corridorsToDestination(challenge.country)) >= COMPOSITION_CLEAR_MARGIN) {
          clear++
        }
      }
      return clear / 40
    }

    // Easy draws blowouts exclusively — the shape answers before the names do
    expect(await blowoutShare('easy')).toBe(1)
    // …and hard exhausts the close boards before it ever reaches one
    expect(await blowoutShare('hard')).toBe(0)
  })

  it('never puts the country on its own bar', async () => {
    for (let round = 0; round < 25; round++) {
      const challenge = await deal('normal')
      expect(challenge.slices.map(slice => slice.isoCode)).not.toContain(challenge.country)
    }
  })
})

describe('composition tiers', () => {
  it('ties neighbours inside the ratio and never the gated head', () => {
    const tiers = compositionTiers([
      { share: 0.5221 },
      { share: 0.0591 },
      { share: 0.0533 },
      { share: 0.051 },
      { share: 0.0486 },
      { share: 0.0293 },
    ] as CompositionChallenge['slices'])
    expect(tiers).toEqual([0, 1, 1, 1, 1, 2])
    // The board gate keeps the head clear of the tie, on every dealt board
    expect(COMPOSITION_TIE_RATIO).toBeLessThan(COMPOSITION_MIN_MARGIN)
    for (const isoCode of compositionBoards(Object.keys(COUNTRIES) as ISOCountryCode[])) {
      const slices = corridorsToDestination(isoCode)
      expect(compositionTiers(slices).filter(tier => tier === 0)).toHaveLength(1)
    }
  })
})

describe('composition grading', () => {
  const MAX = 15
  const board: CompositionChallenge = {
    _type: 'composition-challenge',
    country: 'TR',
    slices: [
      { isoCode: 'SY', share: 0.5221 },
      { isoCode: 'IQ', share: 0.0591 },
      { isoCode: 'DE', share: 0.0533 },
      { isoCode: 'IR', share: 0.0293 },
    ],
    options: ['DE', 'IR', 'SY', 'IQ'],
    strikes: 2,
    showShares: true,
    durationSeconds: 45,
    maximumPoints: MAX,
  }
  const grade = (placements: unknown, absent = false) =>
    gradeGroupAnswer({
      game: {} as Game,
      round: { groupChallenge: board, groupAnswers: {}, playerTurns: {} } as unknown as Round,
      playerId: 'p',
      submission: { ranking: [], composition: { placements } as never },
      absent,
    })
  const perfect = board.slices.map((slice, slot) => ({ isoCode: slice.isoCode, slot }))

  it('pays the head its weight and the rest an even share', async () => {
    expect((await grade(perfect)).scoring.scored).toBe(MAX)
    expect((await grade([{ isoCode: 'SY', slot: 0 }])).scoring.scored).toBe(
      Math.round(MAX * COMPOSITION_HEAD_WEIGHT)
    )
    expect((await grade([{ isoCode: 'IR', slot: 3 }])).scoring.scored).toBe(
      Math.round((MAX * (1 - COMPOSITION_HEAD_WEIGHT)) / 3)
    )
  })

  it('accepts either origin of a tie in either slot', async () => {
    const swapped = [
      { isoCode: 'IQ', slot: 2 },
      { isoCode: 'DE', slot: 1 },
    ]
    expect((await grade(swapped)).answer.submitted.sort()).toEqual(['DE', 'IQ'])
  })

  it('ends the run on the last strike and ignores everything after it', async () => {
    const run = [{ isoCode: 'IR', slot: 0 }, { isoCode: 'SY', slot: 3 }, ...perfect]
    const { scoring, answer } = await grade(run)
    expect(scoring.scored).toBe(0)
    expect(answer.submitted).toEqual([])
    expect(answer.correct).toEqual(['SY', 'IQ', 'DE', 'IR'])
  })

  it('never pays a slot twice or a card twice', async () => {
    const replay = replayPlacements(board, [
      { isoCode: 'SY', slot: 0 },
      { isoCode: 'SY', slot: 0 },
      { isoCode: 'IQ', slot: 0 },
    ])
    expect(replay.placed).toEqual({ 0: 'SY' })
    expect(replay.misses).toEqual([])
  })

  it('drops a malformed submission instead of throwing', async () => {
    expect((await grade('nonsense')).scoring.scored).toBe(0)
    expect(
      (await grade([{ isoCode: 'SY' }, null, { isoCode: 'SY', slot: 0 }])).scoring.scored
    ).toBe(Math.round(MAX * COMPOSITION_HEAD_WEIGHT))
  })

  it('zeroes an absent seat but still lists the crowd', async () => {
    const { scoring, answer } = await grade([], true)
    expect(scoring.scored).toBe(0)
    expect(answer.correct).toEqual(['SY', 'IQ', 'DE', 'IR'])
  })

  it('drops the last card in for free once it is the only one left', () => {
    const replay = replayPlacements(board, perfect.slice(0, 3))
    expect(forcedPlacement(board, replay)).toEqual({ isoCode: 'IR', slot: 3 })
    expect(forcedPlacement(board, replayPlacements(board, perfect.slice(0, 2)))).toBeUndefined()
  })
})

describe('blind play', () => {
  /** A player who knows nothing: random cards onto the open slots of the
   *  biggest tie — the best a zero-knowledge strategy does. */
  const blindRun = (board: CompositionChallenge): number => {
    const attempts: CompositionPlacement[] = []
    const tried = new Set<string>()
    const tiers = compositionTiers(board.slices)
    for (;;) {
      const replay = replayPlacements(board, attempts)
      if (replay.over) break
      const forced = forcedPlacement(board, replay)
      if (forced) {
        attempts.push(forced)
        continue
      }
      const standing = new Set(Object.values(replay.placed))
      const open = board.slices.map((_, slot) => slot).filter(slot => !replay.placed[slot])
      const room = (slot: number) => open.filter(other => tiers[other] === tiers[slot]).length
      const widest = Math.max(...open.map(room))
      const moves = board.options
        .filter(isoCode => !standing.has(isoCode))
        .flatMap(isoCode =>
          open.filter(slot => room(slot) === widest).map(slot => ({ isoCode, slot }))
        )
        .filter(move => !tried.has(`${move.isoCode}${move.slot}`))
      const move = moves[Math.floor(Math.random() * moves.length)]
      if (!move) break
      tried.add(`${move.isoCode}${move.slot}`)
      attempts.push(move)
    }
    return scoreComposition(board, attempts) / board.maximumPoints
  }

  it.each([
    ['easy', 0.4],
    ['normal', 0.28],
    ['hard', 0.2],
  ] as const)('pays a blind %s player well under the pot', (difficulty, ceiling) => {
    const boards = compositionBoards(Object.keys(COUNTRIES) as ISOCountryCode[])
    let paid = 0
    let runs = 0
    for (const isoCode of boards) {
      const slices = corridorsToDestination(isoCode)
        .slice(0, COMPOSITION_SLOTS[difficulty])
        .map(origin => ({ isoCode: origin.isoCode, share: origin.share }))
      const board: CompositionChallenge = {
        _type: 'composition-challenge',
        country: isoCode,
        slices,
        options: slices.map(slice => slice.isoCode),
        strikes: COMPOSITION_STRIKES[difficulty],
        showShares: true,
        durationSeconds: COMPOSITION_SECONDS,
        maximumPoints: 100,
      }
      for (let run = 0; run < 20; run++) {
        paid += blindRun(board)
        runs++
      }
    }
    expect(paid / runs).toBeLessThan(ceiling)
  })
})
