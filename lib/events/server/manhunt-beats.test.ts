import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  initialManhuntCandidates,
  legalManhuntMoves,
  manhuntKey,
  MANHUNT_TUNING,
  type ManhuntSecret,
} from '~~/lib/manhunt'
import { latestChallengeOfType } from '~~/lib/rounds'
import type { ManhuntChallenge } from '~~/types/challenges/group-modes.type'
import type { Game } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'
import { startManhunt } from './manhunt-beats'
import { dropArmedTimersForTests } from './seat-cursor'
import { testSeat } from './test-seat'
import { createTestTable, type TestTable, uniqueGameId } from './test-table'

const DESPOT = 'd'
const DETECTIVES = ['a', 'b', 'c']
const VAULTS: ISOCountryCode[] = ['CH', 'SG', 'PA']

const buildGame = (): Game => {
  const tuning = MANHUNT_TUNING.normal
  const challenge: ManhuntChallenge = {
    _type: 'manhunt-challenge',
    turnCount: tuning.turnCount,
    beatSeconds: tuning.beatSeconds,
    claimsPerBeat: 3,
    maximumPoints: 15,
    despotId: DESPOT,
    favours: tuning.favours,
    subpoenas: 1,
    showCandidates: true,
    analysisDelay: tuning.analysisDelay,
    vaults: VAULTS,
    state: {
      briefing: true,
      ready: [],
      turn: 0,
      hop: 1,
      deadline: 0,
      analysisAt: 0,
      detectives: DETECTIVES,
      clues: [],
      moves: [],
      favoursLeft: tuning.favours,
      subpoenasLeft: Object.fromEntries(DETECTIVES.map(id => [id, 1])),
      candidatesBefore: [],
      candidates: [],
      claims: {},
      despotReady: false,
      dragnets: [],
    },
  }
  return {
    id: uniqueGameId('manhunt'),
    host: DESPOT,
    started: true,
    length: 'short',
    regions: [],
    difficulty: 'normal',
    tiles: [],
    players: Object.fromEntries([DESPOT, ...DETECTIVES].map(id => [id, testSeat(id, 'round')])),
    rounds: [{ groupChallenge: challenge, groupAnswers: {}, playerTurns: {} }],
  } as unknown as Game
}

const manhuntOf = async (table: TestTable) =>
  latestChallengeOfType(await table.read(), 'manhunt-challenge')!

const secretOf = async (table: TestTable) =>
  (await table.redis.get(manhuntKey(table.id, 0))) as ManhuntSecret

const despotAt = async (table: TestTable) => {
  const { trail } = await secretOf(table)
  return trail[trail.length - 1]
}

/** A seeded table with the briefing dismissed and the first beat running. */
const openChase = async () => {
  const game = buildGame()
  const table = await createTestTable(game)
  const fresh = await table.read()
  await startManhunt(table.ctx(DESPOT), fresh, latestChallengeOfType(fresh, 'manhunt-challenge')!)
  await table.redis.set(fresh.id, fresh)
  for (const id of [DESPOT, ...DETECTIVES]) await table.send(id, { event: 'manhunt-ready' })
  return table
}

/** Stake out countries that are NOT the hideout (and not vaults). */
const missEverywhere = async (table: TestTable) => {
  const at = await despotAt(table)
  const decoys = initialManhuntCandidates({ regions: [], difficulty: 'normal' }, VAULTS).filter(
    iso => iso !== at && !VAULTS.includes(iso)
  )
  for (const [index, id] of DETECTIVES.entries()) {
    const { turn } = (await manhuntOf(table)).state
    await table.send(id, { event: 'submit-manhunt-claim', isoCode: decoys[index]!, turn })
  }
}

const planGround = async (table: TestTable) => {
  const at = await despotAt(table)
  const { state } = await manhuntOf(table)
  const destination = legalManhuntMoves(at, 0, { regions: [], difficulty: 'normal' }).ground[0]!
  await table.send(DESPOT, { event: 'submit-manhunt-move', isoCode: destination, turn: state.turn })
  return destination
}

describe('the Despot beat engine', () => {
  let table: TestTable | undefined

  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    table?.dispose()
    table = undefined
    dropArmedTimersForTests()
    vi.useRealTimers()
  })

  it('seeds the trail off the snapshot and deals a true opening leak', async () => {
    table = await openChase()
    const challenge = await manhuntOf(table)
    const secret = await secretOf(table)
    expect(challenge.state.briefing).toBe(false)
    expect(challenge.state.clues).toHaveLength(1)
    expect(challenge.state.candidates).toContain(secret.trail[0])
    expect(JSON.stringify(challenge)).not.toContain('"trail"')
  })

  it('carries out the plan and the chosen leak when the beat settles', async () => {
    table = await openChase()
    const destination = await planGround(table)
    const plan = (await secretOf(table)).plan!
    expect(plan.isoCode).toBe(destination)
    expect(plan.options).toHaveLength(2)

    const { state } = await manhuntOf(table)
    await table.send(DESPOT, { event: 'submit-manhunt-leak', index: 1, turn: state.turn })
    expect((await manhuntOf(table)).state.despotReady).toBe(true)
    await missEverywhere(table)

    const after = await manhuntOf(table)
    expect(after.state.hop).toBe(2)
    expect(after.state.dragnets).toHaveLength(1)
    expect(after.state.clues[1]!.text).toBe(plan.options[1]!.text)
    expect(after.state.candidates).toContain(destination)
    expect(after.state.claims).toEqual({})
    expect(await despotAt(table)).toBe(destination)
  })

  it('refuses a second detective on a country already staked out', async () => {
    table = await openChase()
    const { state } = await manhuntOf(table)
    await table.send('a', { event: 'submit-manhunt-claim', isoCode: 'DE', turn: state.turn })
    await table.send('b', { event: 'submit-manhunt-claim', isoCode: 'DE', turn: state.turn })
    expect((await manhuntOf(table)).state.claims).toEqual({ a: 'DE' })
  })

  it('captures on a stakeout of the hideout and scores the table', async () => {
    table = await openChase()
    const at = await despotAt(table)
    const { state } = await manhuntOf(table)
    await table.send('a', { event: 'submit-manhunt-claim', isoCode: at, turn: state.turn })
    await table.send('b', { event: 'submit-manhunt-claim', isoCode: 'JP', turn: state.turn })
    await table.send('c', { event: 'submit-manhunt-claim', isoCode: 'BR', turn: state.turn })
    await planGround(table)
    await table.send(DESPOT, { event: 'submit-manhunt-leak', index: 0, turn: state.turn })

    const caught = await manhuntOf(table)
    expect(caught.state.finished).toBe(true)
    expect(caught.state.outcome).toMatchObject({ kind: 'captured', capturerId: 'a', country: at })

    await vi.advanceTimersByTimeAsync(30_000)
    const settled = await table.read()
    const answers = settled.rounds[0]!.groupAnswers
    expect(Object.keys(answers).sort()).toEqual([DESPOT, ...DETECTIVES].sort())
    expect(await table.redis.get(manhuntKey(table.id, 0))).toBeNull()
  })

  it('shelters the despot on an untouched vault and banks the loot', async () => {
    table = await openChase()
    const secret = await secretOf(table)
    secret.trail = ['CH']
    secret.candidates = ['CH', 'DE', 'FR', 'IT', 'AT']
    await table.redis.set(manhuntKey(table.id, 0), secret)

    const { state } = await manhuntOf(table)
    await table.send('a', { event: 'submit-manhunt-claim', isoCode: 'CH', turn: state.turn })
    await table.send('b', { event: 'submit-manhunt-claim', isoCode: 'DE', turn: state.turn })
    await table.send('c', { event: 'submit-manhunt-claim', isoCode: 'FR', turn: state.turn })
    await table.send(DESPOT, { event: 'submit-manhunt-move', isoCode: 'AT', turn: state.turn })
    await table.send(DESPOT, { event: 'submit-manhunt-leak', index: 0, turn: state.turn })

    const after = await manhuntOf(table)
    expect(after.state.finished).toBeFalsy()
    expect((await secretOf(table)).looted).toEqual(['CH'])
    // A miss on a vault proves nothing, so it never prunes.
    expect(after.state.candidatesBefore.length).toBeGreaterThan(0)
  })

  it('binds a served subpoena to the next leak and credits the asker', async () => {
    table = await openChase()
    const { state } = await manhuntOf(table)
    await table.send('b', { event: 'submit-manhunt-subpoena', topic: 'economy', turn: state.turn })
    expect((await manhuntOf(table)).state.subpoena).toEqual({ by: 'b', topic: 'economy' })

    await planGround(table)
    const plan = (await secretOf(table)).plan!
    expect(plan.options).toHaveLength(1)
    expect(plan.subpoenaBy).toBe('b')
    await table.send(DESPOT, { event: 'submit-manhunt-leak', index: 0, turn: state.turn })
    await missEverywhere(table)

    const after = await manhuntOf(table)
    expect(after.state.subpoena).toBeUndefined()
    expect(after.state.clues[1]!.askedBy).toBe('b')
    expect(after.state.subpoenasLeft.b).toBe(0)
  })

  it('re-binds a plan the subpoena lands on before its leak is chosen', async () => {
    table = await openChase()
    await planGround(table)
    expect((await secretOf(table)).plan!.options).toHaveLength(2)
    const { state } = await manhuntOf(table)
    await table.send('c', { event: 'submit-manhunt-subpoena', topic: 'land', turn: state.turn })
    expect((await secretOf(table)).plan!.options).toHaveLength(1)
  })

  it('moves an idle despot at random when the clock runs out', async () => {
    table = await openChase()
    const before = await despotAt(table)
    const { state } = await manhuntOf(table)
    await vi.advanceTimersByTimeAsync(state.deadline - Date.now() + 5_000)
    const after = await manhuntOf(table)
    expect(after.state.hop).toBe(2)
    expect(after.state.clues).toHaveLength(2)
    expect(await despotAt(table)).not.toBe(before)
  })
})
