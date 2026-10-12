import { describe, expect, it } from 'vitest'
import {
  FLAG_PICK_GATE,
  testCursor,
  testGauntlet,
  testSeat,
  WITHHELD_FINALS,
  WITHHELD_GATES,
} from '~~/lib/events/server/test-seat'
import type { FinalChallenge } from '~~/types/challenges/final-challenge.type'
import type { IndividualChallenge } from '~~/types/challenges/individual-challenge.type'
import type { Game, PlayerMove } from '~~/types/game.types'
import type { SeatStep } from '~~/types/seat.types'
import {
  finalAnswerOnHand,
  finalQuestion,
  gateAnswerOnHand,
  gateQuestion,
  wireGame,
} from './wire-view'

const gameWith = (step: SeatStep, moves: PlayerMove[]): Game =>
  ({
    id: 'wire',
    host: 'a',
    tiles: [],
    rounds: [],
    regions: [],
    difficulty: 'normal',
    started: true,
    players: { a: testSeat('a', step, { moves, cursor: testCursor(step) }), b: testSeat('b') },
  }) as unknown as Game

const wireMoves = (step: SeatStep, moves: PlayerMove[]) => {
  const game = gameWith(step, moves)
  const saved = structuredClone(game)
  const wired = wireGame(game)
  expect(game, 'the saved game is never touched').toEqual(saved)
  return wired.players.a!.moves
}

const SEALED = { _type: 'sealed-challenge' }
const [ODD_ONE_OUT] = WITHHELD_GATES
const RULERS = WITHHELD_GATES.find(({ name }) => name === 'rulers')!.move

describe('the gates down a walk', () => {
  it.each(['scores', 'walk', 'arrive', 'settled'] as const)(
    'are sealed while the seat is on %s, tiles and all kept for the board',
    step => {
      const moves = [
        ODD_ONE_OUT.move,
        FLAG_PICK_GATE,
        { endTile: { position: 12, type: 'normal' } },
      ]
      const wired = wireMoves(step, moves as PlayerMove[])
      expect(wired.map(move => move.challenge)).toEqual([SEALED, SEALED, undefined])
      expect(wired.map(move => move.endTile)).toEqual(moves.map(move => move.endTile))
    }
  )

  it('stay sealed behind the gate the seat is on', () => {
    for (const step of ['gate', 'gate-verdict'] as const) {
      expect(wireMoves(step, [FLAG_PICK_GATE, ODD_ONE_OUT.move])[1]!.challenge).toEqual(SEALED)
    }
  })
})

describe('the gate a seat is on', () => {
  it.each(WITHHELD_GATES)(
    '$name: the question, then the answer with the verdict',
    ({ move, keys }) => {
      const asked = wireMoves('gate', [move])[0]!.challenge as IndividualChallenge
      for (const key of keys) expect(asked).not.toHaveProperty(key)
      expect(gateAnswerOnHand(asked)).toBe(false)
      expect(asked).toEqual(gateQuestion(move.challenge as IndividualChallenge))

      const judged = wireMoves('gate-verdict', [move])[0]!.challenge as IndividualChallenge
      expect(judged).toEqual(move.challenge)
      expect(gateAnswerOnHand(judged)).toBe(true)
    }
  )

  it('rulers keeps every logo it asks with, and none of the truth', () => {
    const asked = wireMoves('gate', [RULERS])[0]!.challenge as IndividualChallenge
    const { lineup, logos, names } = (RULERS.challenge as IndividualChallenge).rulers!
    expect(asked.rulers).toEqual({ lineup, logos, names })
  })

  it('rides whole when its prompt is its answer', () => {
    expect(wireMoves('gate', [FLAG_PICK_GATE])[0]!.challenge).toEqual(FLAG_PICK_GATE.challenge)
    expect(gateAnswerOnHand(FLAG_PICK_GATE.challenge as IndividualChallenge)).toBe(true)
  })
})

describe('the gauntlet', () => {
  const run = testGauntlet(WITHHELD_FINALS.map(({ item }) => item))
  const [head] = run.challenge!._type === 'final-challenge' ? run.challenge!.challenges : []

  it('shows its progress and none of its questions before the seat is on one', () => {
    for (const step of ['walk', 'arrive'] as const) {
      expect(wireMoves(step, [run])[0]!.challenge).toEqual({ ...run.challenge, challenges: [] })
    }
  })

  it('shows its head alone, answered only once the verdict holds on it', () => {
    const asked = wireMoves('final', [run])[0]!.challenge as FinalChallenge
    expect(asked.challenges).toEqual([finalQuestion(head!)])
    expect(asked).toMatchObject({
      totalCount: WITHHELD_FINALS.length,
      lives: 1,
      answeredCorrect: 0,
    })

    const judged = wireMoves('final-verdict', [run])[0]!.challenge as FinalChallenge
    expect(judged.challenges).toEqual([head])
  })

  it.each(WITHHELD_FINALS)('$name: withholds its answer keys', ({ item, keys }) => {
    const [asked] = (wireMoves('final', [testGauntlet([item])])[0]!.challenge as FinalChallenge)
      .challenges
    for (const key of keys) expect(asked).not.toHaveProperty(key)
    expect(finalAnswerOnHand(asked!)).toBe(false)
    expect(finalAnswerOnHand(item)).toBe(true)
  })
})

describe('a live Two Truths round', () => {
  const sheet = ['true', 'lie', null, 'true'] as const
  const tableWith = (steps: SeatStep[]): Game =>
    ({
      id: 'wire',
      host: 'a',
      tiles: [],
      regions: [],
      difficulty: 'normal',
      started: true,
      players: Object.fromEntries(
        steps.map((step, index) => [`p${index}`, testSeat(`p${index}`, step)])
      ),
      rounds: [
        {
          groupChallenge: { _type: 'two-truths-challenge', country: 'SE', cards: [] },
          groupAnswers: { p0: { submitted: ['SE'], correct: ['SE'], sheet: [...sheet] } },
          playerTurns: {},
        },
      ],
    }) as unknown as Game

  it('carries no banked sheet and no perfect mark while anyone is still stamping', () => {
    const game = tableWith(['round-verdict', 'round'])
    const saved = structuredClone(game)
    const banked = wireGame(game).rounds[0]!.groupAnswers.p0!
    expect(game, 'the saved game is never touched').toEqual(saved)
    expect(banked).not.toHaveProperty('sheet')
    expect(banked.submitted).toEqual([])
  })

  it('shows the sheets once the table is past the round', () => {
    const banked = wireGame(tableWith(['scores', 'scores'])).rounds[0]!.groupAnswers.p0!
    expect(banked.sheet).toEqual(sheet)
  })
})
