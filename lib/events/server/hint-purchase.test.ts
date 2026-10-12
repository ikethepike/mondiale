import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gateRemainingFraction } from '~~/lib/gate-timing'
import { gateLeapSteps, gatePot, hintBitePoints } from '~~/lib/scoring'
import { seatSubject } from '~~/lib/seat-transitions'
import type { ClientEventData } from '~~/types/events.types'
import type { Game, PlayerMove, Tile } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'
import { dropArmedTimersForTests, rearmSeats } from './seat-cursor'
import { createTestTable, uniqueGameId, type TestTable } from './test-table'
import { testCursor, testSeat } from './test-seat'

const tile = (position: number, type: Tile['type'] = 'normal'): Tile => ({ position, type })

const borderDetective: PlayerMove = {
  endTile: tile(5, 'flag'),
  challenge: {
    _type: 'individual-challenge',
    id: 'flag',
    country: 'FI',
    variant: 'border-detective',
  } as PlayerMove['challenge'],
}

const onGate = (deadline: number): Player =>
  testSeat('a', 'gate', {
    currentPosition: 4,
    moves: [borderDetective],
    cursor: testCursor('gate', { subject: seatSubject.gate(1, 5), deadline }),
  })

const buildGame = (players: Player[], groupChallenge: object): Game =>
  ({
    id: uniqueGameId('hints'),
    host: 'a',
    started: true,
    regions: [],
    difficulty: 'normal',
    tiles: Array.from({ length: 12 }, (_, index) => tile(index, index === 5 ? 'flag' : 'normal')),
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

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  dropArmedTimersForTests()
  for (const table of tables) table.dispose()
  tables = []
  vi.useRealTimers()
})

describe('gate hints are charged from the server record', () => {
  const second = testSeat('b', 'round')

  it('docks the leap for a bought hint the submit never reports', async () => {
    const deadline = Date.now() + 40_000
    const table = await open(buildGame([onGate(deadline), second], { _type: 'group-challenge' }))
    await send(table, { event: 'buy-hint', hint: 'outline' })
    expect((await seatA(table)).cursor.hints).toEqual(['outline'])

    // A hostile submit still claiming no hints: the field is not even read.
    await send(table, {
      event: 'submit-individual-challenge-answer',
      isoCode: 'FI',
      hintsUsed: 0,
    })
    const judged = await seatA(table)
    const fraction = gateRemainingFraction(borderDetective.challenge as never, deadline, Date.now())
    expect(judged.cursor.verdict).toMatchObject({
      correct: true,
      steps: gateLeapSteps(fraction, 1, gatePot('border-detective')),
    })
    expect(gateLeapSteps(fraction, 1, gatePot('border-detective'))).toBeLessThan(
      gateLeapSteps(fraction, 0, gatePot('border-detective'))
    )
  })

  it('charges a redelivered purchase once and ignores a hint the gate does not sell', async () => {
    const table = await open(
      buildGame([onGate(Date.now() + 40_000), second], { _type: 'group-challenge' })
    )
    await send(table, { event: 'buy-hint', hint: 'iso' })
    await send(table, { event: 'buy-hint', hint: 'iso' })
    await send(table, { event: 'buy-hint', hint: 'fifty-fifty' })
    const { cursor } = await seatA(table)
    expect(cursor.hints).toEqual(['iso'])
    expect(cursor.step).toBe('gate')
    expect(cursor.subject).toBe(seatSubject.gate(1, 5))
  })

  it('refuses a purchase echoing another subject', async () => {
    const table = await open(
      buildGame([onGate(Date.now() + 40_000), second], { _type: 'group-challenge' })
    )
    await table.send('a', { event: 'buy-hint', hint: 'iso', subject: 'gate:w1:t9', seq: 1 })
    expect((await seatA(table)).cursor.hints).toBeUndefined()
  })
})

describe('round hints are charged from the server record', () => {
  const MAX = 10
  const water = {
    _type: 'name-water-challenge',
    featureId: 'baltic',
    featureName: 'Baltic Sea',
    kind: 'sea',
    countries: ['SE', 'FI'],
    maximumGuesses: 3,
    durationSeconds: 40,
    maximumPoints: MAX,
  }

  it('docks a name-that-water answer by the hints bought on its subject', async () => {
    const table = await open(buildGame([testSeat('a', 'round'), testSeat('b', 'round')], water))
    await send(table, { event: 'buy-hint', hint: 'shores' })
    await send(table, { event: 'buy-hint', hint: 'initials' })
    await send(table, {
      event: 'submit-group-challenge-answers',
      ranking: [],
      water: [{ guessedId: 'baltic' }],
    })
    const game = await table.read()
    expect(game.rounds[0]!.playerTurns.a!.points).toEqual({
      scored: MAX - 2 * hintBitePoints(MAX),
      maximum: MAX,
    })
  })
})
