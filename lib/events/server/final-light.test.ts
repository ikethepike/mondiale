import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { CITY_LIGHTS } from '~~/data/cities.gen'
import { FINAL_REVEAL_HOLD_MS, SEAT_DEADLINE_GRACE_MS, TIMEOUT_SLACK_MS } from '~~/lib/round-beats'
import { seatSubject } from '~~/lib/seat-transitions'
import { sunsetSchedule, sunsetSeconds } from '~~/lib/sunset-pace'
import type { FinalChallenge, FinalChallengeItem } from '~~/types/challenges/final-challenge.type'
import type { ClientEventData } from '~~/types/events.types'
import type { Game } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'
import { finalAnswerFor } from './bot-brain'
import { setDrawSource } from './draws'
import { dropArmedTimersForTests, rearmSeats } from './seat-cursor'
import { createTestTable, type TestTable, uniqueGameId, warmDeferredModules } from './test-table'
import { scriptDraws, testCursor, testSeat } from './test-seat'

const FIELD = ['NO', 'SE', 'FI', 'DK']
const sunset = {
  _type: 'sunset-blitz-challenge',
  frame: [0, 0, 100, 100],
  countries: FIELD,
  quotaRatio: 0.5,
  durationSeconds: sunsetSeconds(FIELD.length, 'normal'),
} as unknown as FinalChallengeItem

const CITIES = (CITY_LIGHTS.FR ?? []).slice(0, 5).map(city => city.name)
const nocturne = {
  _type: 'city-nocturne-challenge',
  country: 'FR',
  cityCount: 5,
  quota: 2,
  durationSeconds: 30,
} as unknown as FinalChallengeItem

const stageSeconds = (item: FinalChallengeItem) =>
  item._type === 'sunset-blitz-challenge' ? sunsetSeconds(FIELD.length, 'normal') : 30

const onStage = (item: FinalChallengeItem): Player => {
  const gauntlet: FinalChallenge = {
    _type: 'final-challenge',
    difficulty: 'normal',
    challenges: [item, item],
    lives: 2,
    totalCount: 2,
    answeredCorrect: 0,
  }
  return testSeat('a', 'final', {
    currentPosition: 9,
    moves: [{ endTile: { position: 10, type: 'final' }, challenge: gauntlet }],
    cursor: testCursor('final', {
      subject: seatSubject.final(1, 0),
      deadline: Date.now() + stageSeconds(item) * 1000,
    }),
  })
}

const buildGame = (item: FinalChallengeItem): Game =>
  ({
    id: uniqueGameId('lights'),
    host: 'a',
    started: true,
    regions: [],
    difficulty: 'normal',
    tiles: Array.from({ length: 11 }, (_, position) => ({
      position,
      type: position === 10 ? 'final' : 'normal',
    })),
    players: { a: onStage(item), b: testSeat('b', 'round') },
    rounds: [{ groupChallenge: { _type: 'group-challenge' }, groupAnswers: {}, playerTurns: {} }],
  }) as unknown as Game

let tables: TestTable[] = []
const open = async (item: FinalChallengeItem) => {
  const game = buildGame(item)
  const table = await createTestTable(game)
  tables.push(table)
  rearmSeats(table.ctx('a'), game)
  return table
}
const cursorA = async (table: TestTable) => (await table.read()).players.a!.cursor
const send = async (table: TestTable, data: Record<string, unknown>) => {
  const { subject, seq } = await cursorA(table)
  await table.send('a', { ...data, subject, seq } as ClientEventData)
}

beforeAll(warmDeferredModules, 60_000)
beforeEach(() => {
  vi.useFakeTimers()
  scriptDraws({ moves: () => undefined, round: () => undefined, finalReplacement: () => sunset })
})
afterEach(() => {
  setDrawSource(undefined)
  dropArmedTimersForTests()
  for (const table of tables) table.dispose()
  tables = []
  vi.useRealTimers()
})

describe('Sunset Blitz counts only the names the server took before dark', () => {
  const firstDark = sunsetSchedule(FIELD.length, 'normal')[0]! * 1000

  it('drops a country lit after the night took it', async () => {
    const table = await open(sunset)
    await vi.advanceTimersByTimeAsync(firstDark + TIMEOUT_SLACK_MS + 50)
    await send(table, { event: 'final-light', name: 'NO' })
    await send(table, { event: 'final-light', name: 'SE' })
    expect((await cursorA(table)).lit).toEqual(['SE'])
    expect(table.emits.filter(emit => emit.event === 'final-light-refused')).toMatchObject([
      { payload: { name: 'NO', subject: seatSubject.final(1, 0) } },
    ])
  })

  it('scores a submitted set with no lights behind it as a miss', async () => {
    const table = await open(sunset)
    await send(table, {
      event: 'submit-final-challenge-answer',
      submittedAnswer: { _type: 'sunset-blitz-challenge', namedCountries: FIELD },
    })
    expect((await cursorA(table)).verdict).toMatchObject({ correct: false })
  })

  it('passes on the lights alone, whatever the submit carries', async () => {
    const table = await open(sunset)
    await send(table, { event: 'final-light', name: 'SE' })
    await send(table, { event: 'final-light', name: 'FI' })
    await send(table, { event: 'final-light', name: 'XX' })
    await send(table, {
      event: 'submit-final-challenge-answer',
      submittedAnswer: { _type: 'sunset-blitz-challenge', namedCountries: [] },
    })
    expect((await cursorA(table)).verdict).toMatchObject({
      correct: true,
      submittedAnswer: { namedCountries: ['SE', 'FI'] },
    })
  })
})

describe('the lit record at the question cap and beyond', () => {
  it('passes a stage whose quota was lit when the clock closes unanswered', async () => {
    const table = await open(sunset)
    await send(table, { event: 'final-light', name: 'SE' })
    await send(table, { event: 'final-light', name: 'FI' })
    await vi.advanceTimersByTimeAsync(stageSeconds(sunset) * 1000 + SEAT_DEADLINE_GRACE_MS + 50)
    expect((await cursorA(table)).verdict).toMatchObject({
      correct: true,
      timedOut: false,
      submittedAnswer: { namedCountries: ['SE', 'FI'] },
    })
  })

  it('clears the record when the next question opens', async () => {
    const table = await open(sunset)
    await send(table, { event: 'final-light', name: 'SE' })
    await send(table, {
      event: 'submit-final-challenge-answer',
      submittedAnswer: { _type: 'sunset-blitz-challenge', namedCountries: [] },
    })
    expect((await cursorA(table)).lit).toEqual(['SE'])
    await vi.advanceTimersByTimeAsync(FINAL_REVEAL_HOLD_MS + 50)
    const next = await cursorA(table)
    expect(next.subject).toBe(seatSubject.final(1, 1))
    expect(next.lit).toBeUndefined()
  })
})

describe('City Nocturne counts only names inside the stage clock', () => {
  it('drops a city lit after the clock ran out, and grades the record', async () => {
    const table = await open(nocturne)
    await send(table, { event: 'final-light', name: CITIES[0] })
    await send(table, { event: 'final-light', name: 'Atlantis' })
    await vi.advanceTimersByTimeAsync(30_000 + TIMEOUT_SLACK_MS + 50)
    await send(table, { event: 'final-light', name: CITIES[1] })
    expect((await cursorA(table)).lit).toEqual([CITIES[0]])
    await send(table, {
      event: 'submit-final-challenge-answer',
      submittedAnswer: { _type: 'city-nocturne-challenge', namedCities: CITIES },
    })
    expect((await cursorA(table)).verdict).toMatchObject({ correct: false })
  })
})

describe("the brain's sunset answer", () => {
  it('names only countries the night has not taken yet', async () => {
    const schedule = sunsetSchedule(FIELD.length, 'normal')
    const deadline = Date.now() + (stageSeconds(sunset) - schedule[1]! - 0.5) * 1000
    const game = { difficulty: 'normal', regions: [] } as unknown as Game
    const answer = await finalAnswerFor(sunset, 1, game, deadline)
    expect(answer).toMatchObject({ _type: 'sunset-blitz-challenge' })
    const named = (answer as { namedCountries: string[] }).namedCountries
    expect(named.length).toBe(2)
    expect(named.every(isoCode => FIELD.indexOf(isoCode) >= 2)).toBe(true)
  })
})
