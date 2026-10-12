import { describe, expect, it } from 'vitest'
import { CLAIMS } from '~~/data/claims.gen'
import type { Game } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'
import type { TwoTruthsReceipt, TwoTruthsSheet } from '~~/types/two-truths.types'
import { createTestTable, uniqueGameId } from './test-table'
import { testCursor, testSeat } from './test-seat'

const dealt = [
  ...CLAIMS.filter(claim => claim.truth).slice(0, 2),
  ...CLAIMS.filter(claim => !claim.truth).slice(0, 2),
]
const CHALLENGE = {
  _type: 'two-truths-challenge',
  country: dealt[0]!.subject,
  cards: dealt.map(({ id, family, text, countries }) => ({ id, family, text, countries })),
  durationSeconds: 45,
  maximumPoints: 10,
}
const SHEET: TwoTruthsSheet = ['true', 'true', 'lie', 'lie']

const tableOf = async (players: Player[], answered: string[] = []) => {
  const game = {
    id: uniqueGameId('receipts'),
    host: players[0]!.id,
    tiles: [],
    regions: [],
    difficulty: 'normal',
    started: true,
    players: Object.fromEntries(players.map(player => [player.id, player])),
    rounds: [
      {
        groupChallenge: CHALLENGE,
        groupAnswers: Object.fromEntries(
          answered.map(id => [id, { submitted: [], correct: [], sheet: SHEET }])
        ),
        playerTurns: {},
      },
    ],
  } as unknown as Game
  return createTestTable(game)
}

const receiptsFor = async (table: Awaited<ReturnType<typeof tableOf>>, playerId: string) => {
  await table.send(playerId, { event: 'fetch-two-truths-receipts', round: 0 })
  const emit = table.emits.find(
    candidate => candidate.event === 'two-truths-receipts' && candidate.target.playerId === playerId
  )
  return emit?.payload as
    { receipts: TwoTruthsReceipt[]; sheets: Record<string, TwoTruthsSheet> } | undefined
}

describe('fetch-two-truths-receipts', () => {
  it('tells a seat still stamping nothing', async () => {
    const table = await tableOf([testSeat('a', 'round'), testSeat('b', 'round-verdict')], ['b'])
    expect(await receiptsFor(table, 'a')).toBeUndefined()
  })

  it('checks one card, and no sheets, for a seat that bought the reveal', async () => {
    const buyer = testSeat('a', 'round', { cursor: testCursor('round', { hints: ['reveal'] }) })
    const table = await tableOf([buyer, testSeat('b', 'round-verdict')], ['b'])
    const reply = await receiptsFor(table, 'a')
    expect(reply?.receipts).toHaveLength(1)
    expect(reply?.sheets).toEqual({})
  })

  it("hands a graded seat every card and the table's banked sheets", async () => {
    const table = await tableOf(
      [testSeat('a', 'round-verdict'), testSeat('b', 'round-verdict'), testSeat('c', 'round')],
      ['a', 'b']
    )
    const reply = await receiptsFor(table, 'a')
    expect(reply?.receipts.map(receipt => receipt.truth)).toEqual([true, true, false, false])
    expect(Object.keys(reply?.sheets ?? {}).sort()).toEqual(['a', 'b'])
  })

  it('makes a finished player in the booth wait until nobody is stamping', async () => {
    const live = await tableOf([testSeat('a', 'round'), testSeat('w', 'victory')])
    expect(await receiptsFor(live, 'w')).toBeUndefined()

    const settled = await tableOf([testSeat('a', 'scores'), testSeat('w', 'victory')], ['a'])
    expect((await receiptsFor(settled, 'w'))?.receipts).toHaveLength(4)
  })
})
