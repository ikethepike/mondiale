import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { compositionSheetKey } from '~~/lib/composition'
import type { CompositionChallenge } from '~~/types/challenges/group-modes.type'
import type { ClientEventData } from '~~/types/events.types'
import type { Game } from '~~/types/game.types'
import { dropArmedTimersForTests } from './seat-cursor'
import { createTestTable, type TestTable, uniqueGameId, warmDeferredModules } from './test-table'
import { testSeat } from './test-seat'

// Türkiye's real board: Syria leads, Iraq/Germany/Bulgaria/Afghanistan tie.
const challenge: CompositionChallenge = {
  _type: 'composition-challenge',
  country: 'TR',
  shares: [0.5221, 0.0591, 0.0533, 0.051, 0.0486, 0.0293],
  total: 6_826_246,
  options: ['DE', 'IR', 'SY', 'IQ', 'AF', 'BG'],
  strikes: 2,
  showShares: true,
  durationSeconds: 45,
  maximumPoints: 15,
}

let tables: TestTable[] = []
const open = async () => {
  const game = {
    id: uniqueGameId('composition'),
    host: 'a',
    started: true,
    regions: [],
    difficulty: 'normal',
    tiles: [],
    players: { a: testSeat('a', 'round'), b: testSeat('b', 'round') },
    rounds: [{ groupChallenge: challenge, groupAnswers: {}, playerTurns: {} }],
  } as unknown as Game
  const table = await createTestTable(game)
  tables.push(table)
  return table
}

const send = async (table: TestTable, playerId: string, data: Record<string, unknown>) => {
  const { subject, seq } = (await table.read()).players[playerId]!.cursor
  await table.send(playerId, { ...data, subject, seq } as ClientEventData)
}
const drop = (table: TestTable, isoCode: string, slot: number, attempt: number, playerId = 'a') =>
  send(table, playerId, { event: 'submit-composition-drop', isoCode, slot, attempt })
const boards = (table: TestTable) =>
  table.emits.filter(emit => emit.event === 'composition-board').map(emit => emit.payload)
const lastBoard = (table: TestTable) => boards(table).at(-1) as Record<string, unknown>

beforeAll(warmDeferredModules, 60_000)
afterEach(() => {
  dropArmedTimersForTests()
  for (const table of tables) table.dispose()
  tables = []
})

describe('Composition drops are graded by the server', () => {
  it('answers the dropping seat alone, and never puts the key on the snapshot', async () => {
    const table = await open()
    await drop(table, 'SY', 0, 0)
    expect(table.emits.filter(emit => emit.event === 'composition-board')).toMatchObject([
      { target: { playerId: 'a' }, payload: { placed: { 0: 'SY' }, drop: { fits: true } } },
    ])
    expect(lastBoard(table).reveal).toBeUndefined()
    expect(JSON.stringify(await table.read())).not.toContain('"placed"')
  })

  it('spends one strike for a retried miss, not two', async () => {
    const table = await open()
    await drop(table, 'IR', 0, 0)
    await drop(table, 'IR', 0, 0)
    expect(lastBoard(table)).toMatchObject({ attempts: 1, misses: 1, over: false })
  })

  it('ignores a card the round never dealt', async () => {
    const table = await open()
    await drop(table, 'FR', 0, 0)
    expect(lastBoard(table)).toMatchObject({ attempts: 0, misses: 0 })
  })

  it('drops the last card in itself and reveals the crowd once the seat is done', async () => {
    const table = await open()
    const key = ['SY', 'IQ', 'DE', 'BG', 'AF', 'IR']
    for (const [slot, isoCode] of key.slice(0, 5).entries()) await drop(table, isoCode, slot, slot)
    expect(lastBoard(table)).toMatchObject({ attempts: 6, over: true, placed: { 5: 'IR' } })
    expect(
      (lastBoard(table).reveal as { isoCode: string }[]).map(origin => origin.isoCode)
    ).toEqual(key)
  })

  it('restores a seat after a reload, and keeps its strikes', async () => {
    const table = await open()
    await drop(table, 'SY', 0, 0)
    await drop(table, 'IR', 1, 1)
    await table.send('a', { event: 'fetch-composition-board', round: 0 } as ClientEventData)
    expect(lastBoard(table)).toMatchObject({ attempts: 2, misses: 1, placed: { 0: 'SY' } })
    expect(lastBoard(table).reveal).toBeUndefined()
  })

  it('pays the drops the server graded, whatever the submit claims', async () => {
    const table = await open()
    await drop(table, 'SY', 0, 0)
    await send(table, 'a', {
      event: 'submit-group-challenge-answers',
      ranking: [],
      composition: { placements: [1, 2, 3, 4, 5].map(slot => ({ isoCode: 'IR', slot })) },
    })
    const game = await table.read()
    expect(game.rounds[0]!.playerTurns.a?.points).toEqual({ scored: 6, maximum: 15 })
    expect(game.rounds[0]!.groupAnswers.a).toEqual({
      submitted: ['SY'],
      correct: challenge.options,
    })
  })

  it('keeps each seat on its own sheet', async () => {
    const table = await open()
    await drop(table, 'SY', 0, 0, 'a')
    await drop(table, 'IR', 0, 0, 'b')
    const sheet = await table.redis.get(compositionSheetKey(table.id, 0))
    expect(sheet).toEqual({ a: [{ isoCode: 'SY', slot: 0 }], b: [{ isoCode: 'IR', slot: 0 }] })
  })
})
