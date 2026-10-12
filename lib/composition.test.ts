import { afterEach, describe, expect, it } from 'vitest'
import { COUNTRIES } from '~~/data/countries.gen'
import { getRoundChallenge } from '~~/lib/challenges'
import {
  COMPOSITION_HEAD_WEIGHT,
  COMPOSITION_SLOTS,
  COMPOSITION_STRIKES,
  COMPOSITION_TIE_RATIO,
  compositionSheetKey,
  compositionTiers,
  type CompositionBoard,
  forcedPlacement,
  replayPlacements,
  revealedSlots,
  scoreComposition,
} from '~~/lib/composition'
import { gradeGroupAnswer } from '~~/lib/events/server/grade-group-answer'
import {
  compositionBoards,
  compositionOrigins,
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
  CompositionSheet,
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
  it('deals sizes, cards and the true total — never which card is which group', async () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      const challenge = await deal(difficulty)
      expect(Object.keys(challenge).sort()).toEqual(
        [
          '_type',
          'country',
          'shares',
          'total',
          'options',
          'strikes',
          'showShares',
          'durationSeconds',
          'maximumPoints',
        ].sort()
      )
      const key = compositionOrigins(challenge.country, challenge.shares.length)
      expect(challenge.shares).toEqual(key.map(origin => origin.share))
      expect([...challenge.options].sort()).toEqual(key.map(origin => origin.isoCode).sort())
      expect(challenge.shares.length).toBeLessThanOrEqual(COMPOSITION_SLOTS[difficulty])
      expect(challenge.strikes).toBe(COMPOSITION_STRIKES[difficulty])
      expect(challenge.showShares).toBe(difficulty !== 'hard')
      // Shares are of the whole foreign-born population, so the listed groups
      // sum to less than 1; the generator rounds each share on its own, so a
      // board whose origins nearly exhaust it can land a hair over.
      expect(challenge.shares.reduce((sum, share) => sum + share, 0)).toBeLessThanOrEqual(1.001)
      const listed = key.reduce((sum, origin) => sum + origin.value.amount, 0)
      expect(challenge.total).toBeGreaterThanOrEqual(listed * 0.99)
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
    // Asserted as pool composition, not as an ordering of medians: normal is
    // an untiered shuffle of every board, so its median sits near hard's and
    // the two cross by chance often enough to make that flaky.
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
    expect(await blowoutShare('easy')).toBe(1)
    expect(await blowoutShare('hard')).toBe(0)
  })

  it('never puts the country among its own cards', async () => {
    for (let round = 0; round < 25; round++) {
      const challenge = await deal('normal')
      expect(challenge.options).not.toContain(challenge.country)
    }
  })
})

describe('composition tiers', () => {
  it('ties neighbours inside the ratio and never the gated head', () => {
    expect(compositionTiers([0.5221, 0.0591, 0.0533, 0.051, 0.0486, 0.0293])).toEqual([
      0, 1, 1, 1, 1, 2,
    ])
    expect(COMPOSITION_TIE_RATIO).toBeLessThan(COMPOSITION_MIN_MARGIN)
    for (const isoCode of compositionBoards(Object.keys(COUNTRIES) as ISOCountryCode[])) {
      const shares = corridorsToDestination(isoCode).map(origin => origin.share)
      expect(compositionTiers(shares).filter(tier => tier === 0)).toHaveLength(1)
    }
  })
})

const MAX = 15
const BOARD: CompositionBoard & { maximumPoints: number } = {
  key: ['SY', 'IQ', 'DE', 'IR'],
  shares: [0.5221, 0.0591, 0.0533, 0.0293],
  strikes: 2,
  maximumPoints: MAX,
}
const PERFECT = BOARD.key.map((isoCode, slot) => ({ isoCode, slot }))

describe('the placement rules', () => {
  it('pays the head its weight and the rest an even share', () => {
    expect(scoreComposition(BOARD, PERFECT)).toBe(MAX)
    expect(scoreComposition(BOARD, [{ isoCode: 'SY', slot: 0 }])).toBe(
      Math.round(MAX * COMPOSITION_HEAD_WEIGHT)
    )
    expect(scoreComposition(BOARD, [{ isoCode: 'IR', slot: 3 }])).toBe(
      Math.round((MAX * (1 - COMPOSITION_HEAD_WEIGHT)) / 3)
    )
  })

  it('accepts either origin of a tie in either slot', () => {
    const swapped = [
      { isoCode: 'IQ', slot: 2 },
      { isoCode: 'DE', slot: 1 },
    ] as CompositionPlacement[]
    expect(replayPlacements(BOARD, swapped).placed).toEqual({ 1: 'DE', 2: 'IQ' })
  })

  it('ends the run on the last strike and ignores everything after it', () => {
    const run = [
      { isoCode: 'IR', slot: 0 },
      { isoCode: 'SY', slot: 3 },
      ...PERFECT,
    ] as CompositionPlacement[]
    const replay = replayPlacements(BOARD, run)
    expect(replay.over).toBe(true)
    expect(replay.placed).toEqual({})
    expect(scoreComposition(BOARD, run)).toBe(0)
  })

  it('never pays a slot twice or a card twice', () => {
    const replay = replayPlacements(BOARD, [
      { isoCode: 'SY', slot: 0 },
      { isoCode: 'SY', slot: 0 },
      { isoCode: 'IQ', slot: 0 },
    ])
    expect(replay.placed).toEqual({ 0: 'SY' })
    expect(replay.misses).toEqual([])
  })

  it('reveals a tied origin where the seat put it, and its partner in the gap', () => {
    const { placed } = replayPlacements(BOARD, [
      { isoCode: 'SY', slot: 0 },
      { isoCode: 'DE', slot: 1 },
    ])
    expect(revealedSlots(BOARD, placed)).toEqual({ 0: 'SY', 1: 'DE', 2: 'IQ', 3: 'IR' })
  })

  it('drops the last card in for free once it is the only one left', () => {
    expect(forcedPlacement(BOARD, replayPlacements(BOARD, PERFECT.slice(0, 3)))).toEqual({
      isoCode: 'IR',
      slot: 3,
    })
    expect(forcedPlacement(BOARD, replayPlacements(BOARD, PERFECT.slice(0, 2)))).toBeUndefined()
  })
})

describe('composition grading', () => {
  const challenge: CompositionChallenge = {
    _type: 'composition-challenge',
    country: 'TR',
    shares: [0.5221, 0.0591, 0.0533, 0.051, 0.0486, 0.0293],
    total: 6_826_246,
    options: ['DE', 'IR', 'SY', 'IQ', 'AF', 'BG'],
    strikes: 2,
    showShares: true,
    durationSeconds: 45,
    maximumPoints: MAX,
  }
  const round = { groupChallenge: challenge, groupAnswers: {}, playerTurns: {} } as unknown as Round
  const game = (bot = false) =>
    ({
      id: 'g',
      rounds: [round],
      players: { p: { id: 'p', ...(bot ? { bot: true } : {}) } },
    }) as unknown as Game
  const sheetOf = (sheet: CompositionSheet) => ({
    get: async <T>(key: string) => (key === compositionSheetKey('g', 0) ? sheet : null) as T,
  })
  const grade = (options: {
    bot?: boolean
    sheet?: CompositionSheet
    claimed?: CompositionPlacement[]
    absent?: boolean
  }) =>
    gradeGroupAnswer({
      game: game(options.bot),
      round,
      playerId: 'p',
      submission: { ranking: [], composition: { placements: options.claimed ?? [] } },
      ...(options.sheet ? { redis: sheetOf(options.sheet) } : {}),
      absent: options.absent ?? false,
    })
  const head: CompositionPlacement[] = [{ isoCode: 'SY', slot: 0 }]

  it("pays a person's drops from the server's sheet, never from the submission", async () => {
    expect((await grade({ sheet: { p: head } })).scoring.scored).toBe(
      Math.round(MAX * COMPOSITION_HEAD_WEIGHT)
    )
    expect((await grade({ sheet: {}, claimed: head })).scoring.scored).toBe(0)
    expect((await grade({ claimed: head })).scoring.scored).toBe(0)
  })

  it('takes a bot seat at its composed placements', async () => {
    expect((await grade({ bot: true, claimed: head })).scoring.scored).toBe(
      Math.round(MAX * COMPOSITION_HEAD_WEIGHT)
    )
  })

  it('zeroes an absent seat but still lists the crowd', async () => {
    const { scoring, answer } = await grade({ sheet: { p: head }, absent: true })
    expect(scoring.scored).toBe(0)
    expect(answer.correct).toEqual(challenge.options)
  })

  it('lists what stood and the whole crowd, in card order — never group order', async () => {
    const { answer } = await grade({
      sheet: {
        p: [
          { isoCode: 'SY', slot: 0 },
          { isoCode: 'IR', slot: 5 },
        ],
      },
    })
    expect(answer.submitted).toEqual(['IR', 'SY'])
    expect(answer.correct).toEqual(challenge.options)
  })

  it('drops a malformed bot submission instead of throwing', async () => {
    const { scoring } = await gradeGroupAnswer({
      game: game(true),
      round,
      playerId: 'p',
      submission: { ranking: [], composition: { placements: 'nonsense' as never } },
    })
    expect(scoring.scored).toBe(0)
  })
})

describe('blind play', () => {
  /** A player who knows nothing: random cards onto the open slots of the
   *  biggest tie — the best a zero-knowledge strategy does. */
  const blindRun = (board: CompositionBoard & { maximumPoints: number }): number => {
    const attempts: CompositionPlacement[] = []
    const tried = new Set<string>()
    const tiers = compositionTiers(board.shares)
    for (;;) {
      const replay = replayPlacements(board, attempts)
      if (replay.over) break
      const forced = forcedPlacement(board, replay)
      if (forced) {
        attempts.push(forced)
        continue
      }
      const standing = new Set(Object.values(replay.placed))
      const open = board.key.map((_, slot) => slot).filter(slot => !replay.placed[slot])
      const room = (slot: number) => open.filter(other => tiers[other] === tiers[slot]).length
      const widest = Math.max(...open.map(room))
      const moves = board.key
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
      const origins = compositionOrigins(isoCode, COMPOSITION_SLOTS[difficulty])
      const board = {
        key: origins.map(origin => origin.isoCode),
        shares: origins.map(origin => origin.share),
        strikes: COMPOSITION_STRIKES[difficulty],
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
