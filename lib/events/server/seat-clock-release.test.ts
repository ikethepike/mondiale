import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { finalClockDeadline, finalQuestionDeadline } from '~~/lib/final-timing'
import { gateClockDeadline, gateDeadline } from '~~/lib/gate-timing'
import { seatSubject } from '~~/lib/seat-transitions'
import type { FinalChallengeItem } from '~~/types/challenges/final-challenge.type'
import type { IndividualChallenge } from '~~/types/challenges/individual-challenge.type'
import type { Game } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'
import { dropArmedTimersForTests } from './seat-cursor'
import { testCursor, testSeat } from './test-seat'
import { createTestTable, type TestTable, uniqueGameId } from './test-table'

/**
 * A gate's or the gauntlet's opening card dismissed early releases the seat's
 * clock through `round-play`: the deadline the landing stamped (which assumed
 * the full card) is pulled in to the tap — never pushed out, never twice.
 */

const ROSETTA = {
  _type: 'individual-challenge',
  id: 'isoCode',
  country: 'FI',
  variant: 'rosetta',
} as IndividualChallenge
const FIND = { ...ROSETTA, variant: 'find' } as IndividualChallenge
const NOCTURNE = {
  _type: 'city-nocturne-challenge',
  durationSeconds: 40,
} as unknown as FinalChallengeItem

const buildGame = (seat: Player): Game =>
  ({
    id: uniqueGameId('seat-clock'),
    host: seat.id,
    started: true,
    length: 'short',
    variant: 'world',
    difficulty: 'normal',
    tiles: [],
    players: { [seat.id]: seat },
    rounds: [{ groupChallenge: undefined, groupAnswers: {}, playerTurns: {} }],
  }) as unknown as Game

const onGate = (challenge: IndividualChallenge) =>
  testSeat('a', 'gate', {
    cursor: testCursor('gate', { deadline: gateDeadline(challenge, Date.now()) }),
    moves: [{ endTile: { position: 0 }, challenge }] as never,
  })

const onFirstQuestion = (item: FinalChallengeItem) =>
  testSeat('a', 'final', {
    cursor: testCursor('final', {
      deadline: finalQuestionDeadline(item, 'normal', Date.now(), true),
    }),
    moves: [
      {
        endTile: { position: 0 },
        challenge: {
          _type: 'final-challenge',
          difficulty: 'normal',
          challenges: [item],
          lives: 2,
          totalCount: 1,
          answeredCorrect: 0,
          turn: 0,
        },
      },
    ] as never,
  })

const release = (table: TestTable, subject: string) =>
  table.send('a', { event: 'round-play', subject, seq: 1 })

describe("a dismissed opening card releases the seat's clock", () => {
  let table: TestTable | undefined

  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    table?.dispose()
    table = undefined
    dropArmedTimersForTests()
    vi.useRealTimers()
  })

  it('pulls a timed gate’s deadline in to the tap', async () => {
    table = await createTestTable(buildGame(onGate(ROSETTA)))
    await vi.advanceTimersByTimeAsync(1_000)
    await release(table, seatSubject.gate(1, 0))
    const { cursor } = (await table.read()).players.a!
    expect(cursor.step).toBe('gate')
    expect(cursor.deadline).toBe(gateClockDeadline(ROSETTA, Date.now()))
  })

  it('never moves a deadline later, so a repeat changes nothing', async () => {
    table = await createTestTable(buildGame(onGate(ROSETTA)))
    await vi.advanceTimersByTimeAsync(1_000)
    await release(table, seatSubject.gate(1, 0))
    const first = (await table.read()).players.a!.cursor
    await vi.advanceTimersByTimeAsync(1_000)
    await release(table, seatSubject.gate(1, 0))
    expect((await table.read()).players.a!.cursor).toEqual(first)
  })

  it('leaves an untimed gate and another subject alone', async () => {
    table = await createTestTable(buildGame(onGate(FIND)))
    const before = (await table.read()).players.a!.cursor
    await release(table, seatSubject.gate(1, 0))
    expect((await table.read()).players.a!.cursor).toEqual(before)

    table.dispose()
    table = await createTestTable(buildGame(onGate(ROSETTA)))
    const stamped = (await table.read()).players.a!.cursor
    await release(table, seatSubject.gate(1, 9))
    expect((await table.read()).players.a!.cursor).toEqual(stamped)
  })

  it('pulls the gauntlet’s first stage clock in to the tap', async () => {
    table = await createTestTable(buildGame(onFirstQuestion(NOCTURNE)))
    await vi.advanceTimersByTimeAsync(800)
    await release(table, seatSubject.final(1, 0))
    expect((await table.read()).players.a!.cursor.deadline).toBe(
      finalClockDeadline(NOCTURNE, 'normal', Date.now())
    )
  })
})
