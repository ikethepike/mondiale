import { describe, expect, it } from 'vitest'
import {
  lastOneNews,
  seatSetback,
  tableClock,
  tableNews,
  tableWaitingOn,
  turnRecap,
  waitingTitle,
} from '~~/lib/board-feed'
import { mockSeatCursor } from '~~/lib/harness/mock-cursor'
import { DWELL } from '~~/lib/motion'
import type { Game, Round, Tile } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'
import type { SeatCursor, SeatStep } from '~~/types/seat.types'

const NOW = 1_000_000

const seat = (
  id: string,
  step: SeatStep,
  position: number,
  cursor: Partial<SeatCursor> = {}
): Player =>
  ({
    id,
    name: id,
    ready: true,
    color: '#000',
    cursor: mockSeatCursor(step, { enteredAt: NOW - 5000, ...cursor }),
    moves: [],
    currentPosition: position,
  }) as unknown as Player

const table = (players: Player[], turns: Round['playerTurns'] = {}) =>
  ({
    players: Object.fromEntries(players.map(player => [player.id, player])),
    rounds: [{ playerTurns: turns } as Round],
    tiles: Array.from({ length: 31 }, (_, position) => ({ position, type: 'normal' })) as Tile[],
  }) as Pick<Game, 'players' | 'rounds' | 'tiles'>

describe('tableWaitingOn', () => {
  it('lists the seats still playing, the latest clock first, never the viewer', () => {
    const game = table([
      seat('you', 'settled', 14),
      seat('bo', 'settled', 18),
      seat('kim', 'walk', 9),
      seat('anna', 'gate', 20, { deadline: NOW + 30_000 }),
      seat('gone', 'kicked', 3),
    ])
    expect(tableWaitingOn(game, 'you').map(player => player.id)).toEqual(['anna', 'kim'])
  })
})

describe('tableClock', () => {
  it('reads the latest gate or final clock and ignores reading caps', () => {
    const anna = seat('anna', 'gate', 20, { enteredAt: NOW - 10_000, deadline: NOW + 20_000 })
    const kim = seat('kim', 'scores', 9, { deadline: NOW + 60_000 })
    expect(tableClock([kim, anna], NOW)).toMatchObject({
      player: anna,
      seconds: 20,
      totalSeconds: 30,
    })
    expect(tableClock([kim], NOW)).toBeUndefined()
  })
})

describe('waitingTitle', () => {
  it('names up to three seats, then counts', () => {
    const names = ['A', 'B', 'C', 'D'].map(id => seat(id, 'walk', 1))
    expect(waitingTitle(names.slice(0, 2))).toBe('Waiting on A and B')
    expect(waitingTitle(names)).toBe('Waiting on 4 players')
  })
})

describe('seatSetback', () => {
  it('holds a forfeiting gate on the settled seat for its dwell', () => {
    const you = seat('you', 'settled', 14, { enteredAt: NOW })
    const game = table([you], {
      you: { points: { scored: 5, maximum: 9 }, blocked: { atTile: 15, forfeitedSteps: 3 } },
    })
    expect(seatSetback(game, 'you')).toEqual({ forfeitedSteps: 3, until: NOW + DWELL.setback })
  })

  it('stays quiet for the gauntlet knockout stamp', () => {
    const game = table([seat('you', 'settled', 14)], {
      you: { points: { scored: 5, maximum: 9 }, blocked: { atTile: 15, forfeitedSteps: 0 } },
    })
    expect(seatSetback(game, 'you')).toBeUndefined()
  })
})

describe('turnRecap', () => {
  it('says what the turn earned, where it left you and how far is left', () => {
    const game = table(
      [seat('you', 'settled', 14), seat('anna', 'gate', 20), seat('kim', 'settled', 12)],
      { you: { points: { scored: 7, maximum: 9 } } }
    )
    expect(turnRecap(game, 'you')).toBe(
      '+7 points · 2nd of 3 · 6 tiles behind anna · 16 tiles to the finish'
    )
  })

  it('reads a lead from the front', () => {
    const game = table([seat('you', 'settled', 20), seat('anna', 'walk', 19)], {
      you: { points: { scored: 0, maximum: 9 } },
    })
    expect(turnRecap(game, 'you')).toBe(
      'No points this round · leading by 1 tile · 10 tiles to the finish'
    )
  })
})

describe('tableNews', () => {
  const at = (step: SeatStep, cursor: Partial<SeatCursor> = {}) =>
    mockSeatCursor(step, { seq: 1, ...cursor })

  it('tells a cleared gate with its leap', () => {
    const kim = seat('kim', 'gate-verdict', 8, {
      seq: 2,
      subject: 'gate:w1:t9',
      verdict: {
        kind: 'gate',
        subject: 'gate:w1:t9',
        correct: true,
        timedOut: false,
        steps: 4,
        browsable: false,
      },
    })
    expect(tableNews(at('gate', { subject: 'gate:w1:t9' }), kim, [kim])).toBe(
      'kim cleared a gate and leaps 4 tiles'
    )
  })

  it('tells a gate that held, and a timeout apart from a miss', () => {
    const verdict = (timedOut: boolean) =>
      seat('kim', 'gate-verdict', 8, {
        seq: 2,
        subject: 'gate:w1:t9',
        verdict: {
          kind: 'gate',
          subject: 'gate:w1:t9',
          correct: false,
          timedOut,
          steps: 0,
          browsable: false,
        },
      })
    expect(tableNews(at('gate'), verdict(false), [])).toBe('kim was stopped at a gate')
    expect(tableNews(at('gate'), verdict(true), [])).toBe('kim ran out of time at a gate')
  })

  it('tells reaching the final once, not every question', () => {
    const anna = seat('anna', 'final', 29, { seq: 3 })
    expect(tableNews(at('arrive'), anna, [anna])).toBe('anna reached the final challenge')
    expect(tableNews(at('final-verdict'), anna, [anna])).toBeUndefined()
  })

  it('stays quiet on a walk step or an unchanged cursor', () => {
    const kim = seat('kim', 'walk', 9, { seq: 4 })
    expect(tableNews(at('walk', { seq: 3 }), kim, [kim])).toBeUndefined()
    expect(tableNews(kim.cursor, kim, [kim])).toBeUndefined()
    expect(tableNews(undefined, kim, [kim])).toBeUndefined()
  })
})

describe('lastOneNews', () => {
  it('says what the last seat is doing', () => {
    const anna = seat('anna', 'gate', 20)
    anna.moves = [{ endTile: { position: 27, type: 'normal' } }]
    expect(lastOneNews(anna)).toBe('anna is the last one playing, at a gate with 7 steps banked')
  })
})
