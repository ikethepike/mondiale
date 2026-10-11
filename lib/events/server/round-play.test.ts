import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { seatSubject } from '~~/lib/seat-transitions'
import type { RoundChallenge } from '~~/types/challenges/traversal-challenge.type'
import type { Game } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'
import { dropArmedTimersForTests } from './seat-cursor'
import { testSeat } from './test-seat'
import { createTestTable, type TestTable, uniqueGameId } from './test-table'

const ANTHEM = {
  _type: 'anthem-buzz-challenge',
  country: 'SE',
  durationSeconds: 20,
  maximumPoints: 10,
} as unknown as RoundChallenge

const buildGame = (seats: Player[], closesInMs: number): Game =>
  ({
    id: uniqueGameId('round-play'),
    host: seats[0]!.id,
    started: true,
    length: 'short',
    regions: [],
    difficulty: 'normal',
    tiles: [],
    players: Object.fromEntries(seats.map(seat => [seat.id, seat])),
    rounds: [
      {
        groupChallenge: ANTHEM,
        groupAnswers: {},
        playerTurns: {},
        playStartsAt: Date.now(),
        deadline: Date.now() + closesInMs,
      },
    ],
  }) as unknown as Game

const play = (table: TestTable) =>
  table.send('a', { event: 'round-play', subject: seatSubject.round(0), seq: 1 })

describe("a seat's own window", () => {
  let table: TestTable | undefined

  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    table?.dispose()
    table = undefined
    dropArmedTimersForTests()
    vi.useRealTimers()
  })

  it('opens for the round kind’s window when the round has room for it', async () => {
    table = await createTestTable(buildGame([testSeat('a', 'round')], 60_000))
    await play(table)
    expect((await table.read()).players.a!.cursor.deadline).toBe(Date.now() + 20_000)
  })

  it('never outlives the round it belongs to', async () => {
    const game = buildGame([testSeat('a', 'round')], 5_000)
    table = await createTestTable(game)
    await play(table)
    expect((await table.read()).players.a!.cursor.deadline).toBe(game.rounds[0]!.deadline)
  })

  it('opens nothing once the round has closed', async () => {
    table = await createTestTable(buildGame([testSeat('a', 'round')], 1_000))
    await vi.advanceTimersByTimeAsync(1_500)
    await play(table)
    expect((await table.read()).players.a!.cursor.deadline).toBeUndefined()
  })
})
