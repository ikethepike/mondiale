import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { capitalGuessScore } from '~~/lib/challenges'
import type { PyramidSchemeChallenge } from '~~/types/challenges/group-modes.type'
import type { ClientEventData } from '~~/types/events.types'
import type { Game } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'
import { dropArmedTimersForTests, rearmSeats } from './seat-cursor'
import { createTestTable, uniqueGameId, type TestTable } from './test-table'
import { testCursor, testSeat } from './test-seat'

const PYRAMID: PyramidSchemeChallenge = {
  _type: 'pyramid-scheme-challenge',
  country: 'JP',
  options: ['NE', 'JP', 'QA', 'IN'],
  band: 'easy',
  maximumGuesses: 2,
  durationSeconds: 40,
  maximumPoints: 20,
}

const buildGame = (players: Player[], groupChallenge: object): Game =>
  ({
    id: uniqueGameId('spend-pick'),
    host: 'a',
    started: true,
    regions: [],
    difficulty: 'easy',
    tiles: [],
    players: Object.fromEntries(players.map(player => [player.id, player])),
    rounds: [{ groupChallenge, groupAnswers: {}, playerTurns: {}, playStartsAt: Date.now() }],
  }) as unknown as Game

let tables: TestTable[] = []
const open = async (game: Game) => {
  const table = await createTestTable(game)
  tables.push(table)
  rearmSeats(table.ctx('a'), game)
  return table
}
const seatA = async (table: TestTable) => (await table.read()).players.a!
const send = async (table: TestTable, data: Record<string, unknown>) => {
  const { subject, seq } = (await seatA(table)).cursor
  await table.send('a', { ...data, subject, seq } as ClientEventData)
}
const onRound = () =>
  testSeat('a', 'round', { cursor: testCursor('round', { deadline: Date.now() + 40_000 }) })

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  dropArmedTimersForTests()
  for (const table of tables) table.dispose()
  tables = []
  vi.useRealTimers()
})

describe('spent option picks live on the seat', () => {
  it('records a pick once, and only an option of the live board', async () => {
    const table = await open(buildGame([onRound(), testSeat('b', 'round')], PYRAMID))
    await send(table, { event: 'spend-pick', pick: 'NE' })
    await send(table, { event: 'spend-pick', pick: 'NE' })
    await send(table, { event: 'spend-pick', pick: 'FR' })
    expect((await seatA(table)).cursor.spent).toEqual(['NE'])
  })

  it('stops at the cap', async () => {
    const table = await open(buildGame([onRound(), testSeat('b', 'round')], PYRAMID))
    for (const pick of ['NE', 'QA', 'IN']) await send(table, { event: 'spend-pick', pick })
    expect((await seatA(table)).cursor.spent).toEqual(['NE', 'QA'])
  })

  it('ignores a board that is not priced by attempt', async () => {
    const typed = { ...PYRAMID, _type: 'capital-guess-challenge', maximumGuesses: undefined }
    const table = await open(buildGame([onRound(), testSeat('b', 'round')], typed))
    await send(table, { event: 'spend-pick', pick: 'NE' })
    expect((await seatA(table)).cursor.spent).toBeUndefined()
  })

  it('prices a reloaded seat on its record, not the submit it sends', async () => {
    // The reload exploit: a wrong pick, a refresh, then the answer submitted
    // as if it were the first try.
    const table = await open(buildGame([onRound(), testSeat('b', 'round')], PYRAMID))
    await send(table, { event: 'spend-pick', pick: 'NE' })
    await send(table, { event: 'submit-group-challenge-answers', ranking: ['JP'] })
    const round = (await table.read()).rounds[0]!
    expect(round.playerTurns.a?.points.scored).toBe(capitalGuessScore(2, 2, 20))
    expect(round.groupAnswers.a?.submitted).toEqual(['NE', 'JP'])
  })
})
