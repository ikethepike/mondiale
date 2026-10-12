import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { seatSubject } from '~~/lib/seat-transitions'
import type { ClientEventData } from '~~/types/events.types'
import type { Game, PlayerMove, Tile } from '~~/types/game.types'
import { dropArmedTimersForTests, rearmSeats } from './seat-cursor'
import { createTestTable, uniqueGameId, type TestTable } from './test-table'
import { testCursor, testSeat } from './test-seat'

const tile = (position: number, type: Tile['type'] = 'normal'): Tile => ({ position, type })

const duels: PlayerMove = {
  endTile: tile(5, 'flag'),
  challenge: {
    _type: 'individual-challenge',
    id: 'flag',
    country: 'SE',
    variant: 'higher-lower',
    higherLower: {
      accessorId: 'geography.area.total',
      pairs: [
        { a: 'LU', b: 'RU' },
        { a: 'US', b: 'PT' },
      ],
    },
  } as PlayerMove['challenge'],
}

const buildGame = (): Game =>
  ({
    id: uniqueGameId('steps'),
    host: 'a',
    started: true,
    regions: [],
    difficulty: 'normal',
    tiles: Array.from({ length: 12 }, (_, index) => tile(index, index === 5 ? 'flag' : 'normal')),
    players: {
      a: testSeat('a', 'gate', {
        currentPosition: 4,
        moves: [duels],
        cursor: testCursor('gate', {
          subject: seatSubject.gate(1, 5),
          deadline: Date.now() + 90_000,
        }),
      }),
      b: testSeat('b', 'round'),
    },
    rounds: [{ groupChallenge: { _type: 'group-challenge' }, groupAnswers: {}, playerTurns: {} }],
  }) as unknown as Game

let tables: TestTable[] = []
const answer = async (data: Record<string, unknown>) => {
  const game = buildGame()
  const table = await createTestTable(game)
  tables.push(table)
  rearmSeats(table.ctx('a'), game)
  const { subject, seq } = (await table.read()).players.a!.cursor
  await table.send('a', {
    event: 'submit-individual-challenge-answer',
    ...data,
    subject,
    seq,
  } as ClientEventData)
  return (await table.read()).players.a!.cursor.verdict
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  dropArmedTimersForTests()
  for (const table of tables) table.dispose()
  tables = []
  vi.useRealTimers()
})

describe('a self-graded gate is graded by the server', () => {
  it('refuses the winning token without the duels that won it', async () => {
    expect(await answer({ isoCode: 'SE' })).toMatchObject({ correct: false })
    expect(await answer({ isoCode: 'SE', steps: ['RU', 'PT'] })).toMatchObject({ correct: false })
  })

  it('passes the duels actually won', async () => {
    expect(await answer({ isoCode: 'SE', steps: ['RU', 'US'] })).toMatchObject({ correct: true })
  })
})
