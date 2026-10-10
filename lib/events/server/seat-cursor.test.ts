import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BOARD_TO_CHALLENGE_HOLD_MS,
  FINAL_REVEAL_HOLD_MS,
  GATE_RESULT_HOLD_MS,
  GROUP_SCORES_CAP_MS,
  INDIVIDUAL_GATE_CAP_MS,
  NEW_ROUND_PAUSE_MS,
  revealHoldMsFor,
  SEAT_DEADLINE_GRACE_MS,
  STEP_INTERVAL_MS,
  TUTORIAL_CAP_MS,
  WALK_LEAD_MS,
  WALK_RESUME_LEAD_MS,
} from '~~/lib/round-beats'
import { seatInvariantViolations } from '~~/lib/seat-invariants'
import { seatSubject } from '~~/lib/seat-transitions'
import type { FinalChallenge, FinalChallengeItem } from '~~/types/challenges/final-challenge.type'
import type { RoundChallenge } from '~~/types/challenges/traversal-challenge.type'
import type { ClientEventData } from '~~/types/events.types'
import type { Game, PlayerMove, Tile } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'
import type { SeatStep } from '~~/types/seat.types'
import { unsentRevFor } from '../server-side'
import { setDrawSource } from './draws'
import { rearmSeats, dropArmedTimersForTests } from './seat-cursor'
import {
  createClientMirror,
  createTestTable,
  type TestTable,
  uniqueGameId,
  warmDeferredModules,
} from './test-table'
import { scriptDraws, testCursor } from './test-seat'

const TWO_TRUTHS = {
  _type: 'two-truths-challenge',
  country: 'SE',
  statements: [],
  lieIndex: 0,
  lieSource: 'NO',
  durationSeconds: 25,
  maximumPoints: 10,
} as unknown as RoundChallenge

const tile = (position: number, type: Tile['type'] = 'normal'): Tile => ({ position, type })
const TILES: Tile[] = Array.from({ length: 20 }, (_, index) =>
  index === 0
    ? tile(0, 'start')
    : index === 5 || index === 9
      ? tile(index, 'flag')
      : index === 19
        ? tile(19, 'final')
        : tile(index)
)

const gate = (position: number, country = 'FI'): PlayerMove => ({
  endTile: TILES[position]!,
  challenge: {
    _type: 'individual-challenge',
    id: 'flag',
    country,
    variant: 'find',
  } as PlayerMove['challenge'],
})
const plain = (position: number): PlayerMove => ({ endTile: TILES[position]! })

const regionQuestion = (country: string): FinalChallengeItem =>
  ({ _type: 'region-challenge', country, region: 'europe' }) as unknown as FinalChallengeItem

const seatOn = (id: string, step: SeatStep, extra: Partial<Player> = {}): Player => ({
  id,
  name: id,
  ready: true,
  color: 'blue' as Player['color'],
  cursor: testCursor(step, { walk: 0 }),
  moves: [],
  currentPosition: 0,
  ...extra,
})

const buildGame = (players: Player[]): Game =>
  ({
    id: uniqueGameId('seat'),
    host: players[0]!.id,
    started: true,
    length: 'short',
    variant: 'world',
    difficulty: 'normal',
    tiles: TILES,
    players: Object.fromEntries(players.map(player => [player.id, player])),
    rounds: [
      {
        groupChallenge: TWO_TRUTHS,
        groupAnswers: {},
        playerTurns: Object.fromEntries(
          players
            .filter(player => !['round', 'tutorial', 'lobby'].includes(player.cursor.step))
            .map(player => [player.id, { points: { scored: 4, maximum: 10 } }])
        ),
        playStartsAt: Date.now(),
        deadline: Date.now() + 60_000,
      },
    ],
  }) as unknown as Game

const seatOf = async (table: TestTable, id: string) => (await table.read()).players[id]!
const stepOf = async (table: TestTable, id: string) => (await seatOf(table, id)).cursor.step

/** The subject a client would echo — what is on its screen right now. */
const echo = async (table: TestTable, id: string) => {
  const { subject, seq } = (await seatOf(table, id)).cursor
  return { subject, seq }
}

const answerRound = async (table: TestTable, id: string, correct = true) =>
  table.send(id, {
    event: 'submit-group-challenge-answers',
    ranking: correct ? ['SE'] : ['NO'],
    clientScore: correct ? 10 : 0,
    ...(await echo(table, id)),
  } as ClientEventData)

const expectClean = async (table: TestTable) => {
  const game = await table.read()
  expect(seatInvariantViolations(game, { now: Date.now(), armed: table.armed() })).toEqual([])
  expect(unsentRevFor(table.id)).toBeUndefined()
}

const moveset = new Map<string, PlayerMove[]>()
let tables: TestTable[] = []
const open = async (game: Game) => {
  const table = await createTestTable(game)
  tables.push(table)
  return table
}

beforeAll(warmDeferredModules, 60_000)

beforeEach(() => {
  vi.useFakeTimers()
  moveset.clear()
  scriptDraws({
    moves: seatId => moveset.get(seatId),
    round: () => TWO_TRUTHS,
    finalReplacement: () => regionQuestion('PL'),
  })
})

afterEach(() => {
  setDrawSource(undefined)
  dropArmedTimersForTests()
  for (const table of tables) table.dispose()
  tables = []
  vi.useRealTimers()
})

describe('a seat through a whole turn, on the cursor alone', () => {
  it('answers, walks, lands, passes a gate, settles, and is revealed into the next round', async () => {
    const table = await open(buildGame([seatOn('a', 'round'), seatOn('b', 'round')]))
    moveset.set('a', [gate(5), plain(7)])

    await answerRound(table, 'a')
    expect(await stepOf(table, 'a')).toBe('round-verdict')
    await expectClean(table)

    await vi.advanceTimersByTimeAsync(revealHoldMsFor(TWO_TRUTHS) + 10)
    const scored = await seatOf(table, 'a')
    expect(scored.cursor).toMatchObject({ step: 'scores', subject: seatSubject.scores(0), walk: 1 })
    expect(scored.cursor.deadline).toBeGreaterThan(Date.now() + GROUP_SCORES_CAP_MS - 1000)
    await expectClean(table)

    await table.send('a', { event: 'enter-movement-phase', ...(await echo(table, 'a')) })
    const announce = await seatOf(table, 'a')
    expect(announce.cursor).toMatchObject({ step: 'walk', subject: seatSubject.walk(1, 0), leg: 0 })
    expect(announce.cursor.holdUntil).toBe(Date.now() + WALK_LEAD_MS)

    // The lead, then one tile per beat up to the stop tile before the gate.
    await vi.advanceTimersByTimeAsync(WALK_LEAD_MS + 4 * STEP_INTERVAL_MS + 10)
    const atStop = await seatOf(table, 'a')
    expect(atStop.currentPosition).toBe(4)
    expect(atStop.cursor.step).toBe('arrive')
    expect(atStop.cursor.subject).toBe(seatSubject.gate(1, 5))

    await vi.advanceTimersByTimeAsync(BOARD_TO_CHALLENGE_HOLD_MS + 10)
    const onGate = await seatOf(table, 'a')
    expect(onGate.cursor.step).toBe('gate')
    expect(onGate.cursor.deadline).toBe(onGate.cursor.enteredAt + INDIVIDUAL_GATE_CAP_MS)
    await expectClean(table)

    await table.send('a', {
      event: 'submit-individual-challenge-answer',
      isoCode: 'FI',
      ...(await echo(table, 'a')),
    })
    const judged = await seatOf(table, 'a')
    expect(judged.cursor.step).toBe('gate-verdict')
    expect(judged.cursor.verdict).toMatchObject({ kind: 'gate', correct: true })
    // Nothing is paid out while the verdict holds: the gate is still the head.
    expect(judged.moves[0]?.endTile.position).toBe(5)
    expect(judged.currentPosition).toBe(4)

    await vi.advanceTimersByTimeAsync(GATE_RESULT_HOLD_MS + 10)
    const resumed = await seatOf(table, 'a')
    expect(resumed.cursor).toMatchObject({ step: 'walk', subject: seatSubject.walk(1, 1), leg: 1 })
    expect(resumed.moves).toHaveLength(1)
    expect(resumed.currentPosition).toBeGreaterThan(4)

    await vi.advanceTimersByTimeAsync(WALK_RESUME_LEAD_MS + 10 * STEP_INTERVAL_MS)
    const settled = await seatOf(table, 'a')
    expect(settled.cursor.step).toBe('settled')
    expect(settled.moves).toEqual([])
    // One racer still in the round: no next round is owed yet.
    expect((await table.read()).nextRoundAt).toBeUndefined()
    await expectClean(table)

    moveset.set('b', [plain(2)])
    await answerRound(table, 'b', false)
    await vi.advanceTimersByTimeAsync(revealHoldMsFor(TWO_TRUTHS) + 10)
    await table.send('b', { event: 'enter-movement-phase', ...(await echo(table, 'b')) })
    await vi.advanceTimersByTimeAsync(WALK_LEAD_MS + 3 * STEP_INTERVAL_MS)
    expect(await stepOf(table, 'b')).toBe('settled')

    // The save that settled the last racer stamped the next round — nothing dealt yet.
    const waiting = await table.read()
    expect(waiting.nextRoundAt).toBeDefined()
    expect(waiting.rounds).toHaveLength(1)
    await expectClean(table)

    await vi.advanceTimersByTimeAsync(NEW_ROUND_PAUSE_MS + 10)
    const revealed = await table.read()
    expect(revealed.rounds).toHaveLength(2)
    expect(revealed.nextRoundAt).toBeUndefined()
    for (const id of ['a', 'b']) {
      expect(revealed.players[id]!.cursor).toMatchObject({
        step: 'round',
        subject: seatSubject.round(1),
      })
    }
    expect(table.emits.at(-1)?.event).toBe('new-round')
    await expectClean(table)

    // The journal is the whole story, every seq strictly increasing.
    const aSteps = table.journal.filter(entry => entry.seat === 'a' && !entry.progress)
    expect(aSteps.map(entry => `${entry.from}>${entry.to}:${entry.cause}`)).toEqual([
      'round>round-verdict:event:submit-group-challenge-answers',
      'round-verdict>scores:timer:verdict-hold',
      'scores>walk:event:enter-movement-phase',
      'walk>arrive:timer:walk-step',
      'arrive>gate:timer:landing',
      'gate>gate-verdict:event:submit-individual-challenge-answer',
      'gate-verdict>walk:timer:verdict-hold',
      'walk>settled:timer:walk-step',
      'settled>round:table:reveal',
    ])
    const seqs = table.journal.filter(entry => entry.seat === 'a').map(entry => entry.seq)
    expect(seqs).toEqual([...seqs].sort((x, y) => x - y))
    expect(new Set(seqs).size).toBe(seqs.length)
  })

  it('keeps every client in step with the server after every emit', async () => {
    const game = buildGame([seatOn('a', 'round'), seatOn('b', 'round')])
    const table = await open(game)
    const mirror = createClientMirror('b', await table.read())
    moveset.set('a', [gate(5)])
    moveset.set('b', [plain(3)])

    await answerRound(table, 'a')
    await answerRound(table, 'b')
    await vi.advanceTimersByTimeAsync(revealHoldMsFor(TWO_TRUTHS) + 10)
    await table.send('a', { event: 'enter-movement-phase', ...(await echo(table, 'a')) })
    await table.send('b', { event: 'enter-movement-phase', ...(await echo(table, 'b')) })
    await vi.advanceTimersByTimeAsync(
      WALK_LEAD_MS + 6 * STEP_INTERVAL_MS + BOARD_TO_CHALLENGE_HOLD_MS
    )
    await table.send('a', {
      event: 'submit-individual-challenge-answer',
      isoCode: 'NO',
      ...(await echo(table, 'a')),
    })
    await vi.advanceTimersByTimeAsync(GATE_RESULT_HOLD_MS + NEW_ROUND_PAUSE_MS + 100)

    let previousSeqs: Record<string, number> = {}
    for (const emitted of table.emits) {
      mirror.apply(emitted)
      if (!('game' in emitted.payload)) continue
      const client = mirror.game()
      // The emitting snapshot is the server truth at that instant.
      expect(client.players).toEqual(emitted.payload.game.players)
      for (const [id, seat] of Object.entries(client.players)) {
        expect(seat.cursor.seq).toBeGreaterThanOrEqual(previousSeqs[id] ?? 0)
      }
      previousSeqs = Object.fromEntries(
        Object.entries(client.players).map(([id, seat]) => [id, seat.cursor.seq])
      )
    }
    expect(mirror.game()).toEqual(await table.read())
  })
})

describe('the #170 class, closed by construction', () => {
  it('a blocked seat re-landing on the same gate inside the old cap window is a new subject', async () => {
    const table = await open(
      buildGame([
        seatOn('a', 'gate', {
          currentPosition: 4,
          moves: [gate(5), plain(8)],
          cursor: testCursor('gate', {
            subject: seatSubject.gate(1, 5),
            deadline: Date.now() + INDIVIDUAL_GATE_CAP_MS,
          }),
        }),
        seatOn('b', 'round'),
      ])
    )
    rearmSeats(table.ctx('a'), await table.read())
    const firstSubject = (await echo(table, 'a')).subject

    await table.send('a', {
      event: 'submit-individual-challenge-answer',
      isoCode: 'NO',
      ...(await echo(table, 'a')),
    })
    await vi.advanceTimersByTimeAsync(GATE_RESULT_HOLD_MS + 10)
    expect(await stepOf(table, 'a')).toBe('settled')
    expect((await table.read()).rounds[0]!.playerTurns.a?.blocked).toMatchObject({ atTile: 5 })

    // Next round, seconds later, the seat walks straight back onto gate 5.
    moveset.set('b', [plain(1)])
    await answerRound(table, 'b')
    await vi.advanceTimersByTimeAsync(revealHoldMsFor(TWO_TRUTHS) + 10)
    await table.send('b', { event: 'enter-movement-phase', ...(await echo(table, 'b')) })
    await vi.advanceTimersByTimeAsync(WALK_LEAD_MS + 2 * STEP_INTERVAL_MS)
    expect(await stepOf(table, 'b')).toBe('settled')
    await vi.advanceTimersByTimeAsync(NEW_ROUND_PAUSE_MS + 10)
    expect(await stepOf(table, 'a')).toBe('round')
    moveset.set('a', [gate(5), plain(8)])
    await answerRound(table, 'a')
    await vi.advanceTimersByTimeAsync(revealHoldMsFor(TWO_TRUTHS) + 10)
    await table.send('a', { event: 'enter-movement-phase', ...(await echo(table, 'a')) })
    await vi.advanceTimersByTimeAsync(WALK_LEAD_MS + BOARD_TO_CHALLENGE_HOLD_MS + 100)

    const relanded = await seatOf(table, 'a')
    expect(relanded.cursor.step).toBe('gate')
    expect(relanded.cursor.subject).not.toBe(firstSubject)

    // The old window's moment passes: nothing fires against the new landing.
    await vi.advanceTimersByTimeAsync(30_000)
    expect(await stepOf(table, 'a')).toBe('gate')
    await expectClean(table)

    // Its own cap, measured from its own landing, is what forfeits it.
    const landedAt = relanded.cursor.enteredAt
    await vi.advanceTimersByTimeAsync(
      landedAt + INDIVIDUAL_GATE_CAP_MS + SEAT_DEADLINE_GRACE_MS + 10 - Date.now()
    )
    const capped = await seatOf(table, 'a')
    expect(capped.cursor.step).toBe('gate-verdict')
    expect(capped.cursor.verdict).toMatchObject({ timedOut: true, subject: capped.cursor.subject })
  })

  it('a stale answer echoing a spent gate is dropped with a resync, never judged', async () => {
    const table = await open(
      buildGame([
        seatOn('a', 'gate', {
          currentPosition: 4,
          moves: [gate(5), gate(9)],
          cursor: testCursor('gate', {
            subject: seatSubject.gate(1, 5),
            deadline: Date.now() + 90_000,
          }),
        }),
      ])
    )
    const spent = { subject: seatSubject.gate(1, 3), seq: 0 }
    await table.send('a', { event: 'submit-individual-challenge-answer', isoCode: 'FI', ...spent })
    expect(await stepOf(table, 'a')).toBe('gate')
    expect(table.emits.at(-1)).toMatchObject({ event: 'update', target: { playerId: 'a' } })

    // A redelivered duplicate of the live answer during its verdict is a no-op.
    const live = await echo(table, 'a')
    await table.send('a', { event: 'submit-individual-challenge-answer', isoCode: 'FI', ...live })
    const after = await seatOf(table, 'a')
    await table.send('a', { event: 'submit-individual-challenge-answer', isoCode: 'NO', ...live })
    expect((await seatOf(table, 'a')).cursor).toEqual(after.cursor)
  })

  it('a leap off the walk’s last gate stops short of the final, never past the finish', async () => {
    const game = buildGame([
      seatOn('a', 'gate', {
        currentPosition: 17,
        moves: [gate(18)],
        cursor: testCursor('gate', {
          subject: seatSubject.gate(1, 18),
          deadline: Date.now() + INDIVIDUAL_GATE_CAP_MS,
        }),
      }),
      seatOn('b', 'round'),
    ])
    game.tiles = TILES.map(entry => (entry.position === 18 ? tile(18, 'flag') : entry))
    const table = await open(game)
    rearmSeats(table.ctx('a'), game)

    await table.send('a', {
      event: 'submit-individual-challenge-answer',
      isoCode: 'FI',
      ...(await echo(table, 'a')),
    })
    await vi.advanceTimersByTimeAsync(GATE_RESULT_HOLD_MS + 10)
    const settled = await seatOf(table, 'a')
    expect(settled.cursor.step).toBe('settled')
    expect(settled.currentPosition).toBe(18)
  })

  it('the gauntlet holds the answered question through its verdict, then deals the next', async () => {
    const gauntlet: FinalChallenge = {
      _type: 'final-challenge',
      difficulty: 'normal',
      challenges: [regionQuestion('FR'), regionQuestion('DE')],
      lives: 1,
      totalCount: 2,
      answeredCorrect: 0,
    }
    const table = await open(
      buildGame([
        seatOn('a', 'final', {
          currentPosition: 18,
          moves: [{ endTile: TILES[19]!, challenge: gauntlet }],
          cursor: testCursor('final', {
            subject: seatSubject.final(1, 0),
            deadline: Date.now() + 90_000,
          }),
        }),
      ])
    )
    await table.send('a', {
      event: 'submit-final-challenge-answer',
      submittedAnswer: { _type: 'region-challenge', region: 'asia' },
      ...(await echo(table, 'a')),
    } as ClientEventData)

    const verdict = await seatOf(table, 'a')
    const held = verdict.moves[0]!.challenge as FinalChallenge
    expect(verdict.cursor.step).toBe('final-verdict')
    expect(verdict.cursor.verdict).toMatchObject({ correct: false, knockedOut: false, won: false })
    // The life is spent in the verdict's own save; the question stays on screen.
    expect(held.lives).toBe(0)
    expect(held.challenges[0]).toMatchObject({ country: 'FR' })

    await vi.advanceTimersByTimeAsync(FINAL_REVEAL_HOLD_MS - 100)
    expect(await stepOf(table, 'a')).toBe('final-verdict')
    await vi.advanceTimersByTimeAsync(200)
    const next = await seatOf(table, 'a')
    expect(next.cursor).toMatchObject({ step: 'final', subject: seatSubject.final(1, 1) })
    expect((next.moves[0]!.challenge as FinalChallenge).challenges[0]).toMatchObject({
      country: 'DE',
    })
    await expectClean(table)

    // Out of lives: the knockout holds its verdict, then settles with the descent's record.
    await table.send('a', {
      event: 'submit-final-challenge-answer',
      submittedAnswer: { _type: 'region-challenge', region: 'asia' },
      ...(await echo(table, 'a')),
    } as ClientEventData)
    expect((await seatOf(table, 'a')).cursor.verdict).toMatchObject({ knockedOut: true })
    await vi.advanceTimersByTimeAsync(GATE_RESULT_HOLD_MS + 10)
    const out = await seatOf(table, 'a')
    expect(out.cursor.step).toBe('settled')
    expect(out.moves).toEqual([])
    expect((await table.read()).rounds[0]!.playerTurns.a?.blocked).toMatchObject({
      forfeitedSteps: 0,
    })
  })

  it('a won gauntlet reaches victory only when the winning verdict has held', async () => {
    const table = await open(
      buildGame([
        seatOn('a', 'final', {
          currentPosition: 18,
          moves: [
            {
              endTile: TILES[19]!,
              challenge: {
                _type: 'final-challenge',
                difficulty: 'normal',
                challenges: [regionQuestion('FR')],
                lives: 1,
                totalCount: 1,
                answeredCorrect: 0,
              },
            },
          ],
          cursor: testCursor('final', {
            subject: seatSubject.final(1, 0),
            deadline: Date.now() + 90_000,
          }),
        }),
      ])
    )
    await table.send('a', {
      event: 'submit-final-challenge-answer',
      submittedAnswer: { _type: 'region-challenge', region: 'europe' },
      ...(await echo(table, 'a')),
    } as ClientEventData)
    expect((await seatOf(table, 'a')).cursor.verdict).toMatchObject({ won: true })
    expect(await stepOf(table, 'a')).toBe('final-verdict')
    await vi.advanceTimersByTimeAsync(FINAL_REVEAL_HOLD_MS + 10)
    expect(await stepOf(table, 'a')).toBe('victory')
  })
})

describe('server-owned exits', () => {
  it('every waiting step leaves on its own stamp with no client at all', async () => {
    const table = await open(
      buildGame([
        seatOn('a', 'tutorial', {
          cursor: testCursor('tutorial', { deadline: Date.now() + TUTORIAL_CAP_MS }),
        }),
        seatOn('b', 'scores', {
          moves: [plain(2)],
          cursor: testCursor('scores', { deadline: Date.now() + GROUP_SCORES_CAP_MS }),
        }),
      ])
    )
    rearmSeats(table.ctx('a'), await table.read())
    await vi.advanceTimersByTimeAsync(GROUP_SCORES_CAP_MS + SEAT_DEADLINE_GRACE_MS + 10)
    expect(await stepOf(table, 'a')).toBe('round')
    expect(['walk', 'settled']).toContain(await stepOf(table, 'b'))
    await vi.advanceTimersByTimeAsync(WALK_LEAD_MS + 3 * STEP_INTERVAL_MS)
    expect(await stepOf(table, 'b')).toBe('settled')
  })

  it('a restart that forgets every timer resumes from the cursor alone', async () => {
    const table = await open(
      buildGame([
        seatOn('a', 'scores', {
          moves: [plain(6)],
          cursor: testCursor('scores', { deadline: Date.now() + GROUP_SCORES_CAP_MS }),
        }),
      ])
    )
    await table.send('a', { event: 'enter-movement-phase', ...(await echo(table, 'a')) })
    // The lead, then a step on each beat: three tiles in.
    await vi.advanceTimersByTimeAsync(WALK_LEAD_MS + 2 * STEP_INTERVAL_MS + 10)
    expect((await seatOf(table, 'a')).currentPosition).toBe(3)

    dropArmedTimersForTests()
    vi.clearAllTimers()
    await vi.advanceTimersByTimeAsync(10_000)
    expect((await seatOf(table, 'a')).currentPosition).toBe(3)

    rearmSeats(table.ctx('a'), await table.read())
    // Arming twice is harmless: same seq, one timer.
    rearmSeats(table.ctx('a'), await table.read())
    expect(table.armed().filter(timer => timer.seat === 'a')).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(4 * STEP_INTERVAL_MS + 10)
    const done = await seatOf(table, 'a')
    expect(done.currentPosition).toBe(6)
    expect(done.cursor.step).toBe('settled')
  })
})

describe('guards the old model got wrong', () => {
  it('a set-name after the start never touches a racing seat', async () => {
    const table = await open(buildGame([seatOn('a', 'round')]))
    const before = await seatOf(table, 'a')
    await table.send('a', { event: 'set-name', name: 'Renamed' })
    expect(await seatOf(table, 'a')).toEqual(before)
  })

  it('a group answer for a spent round is never banked', async () => {
    const table = await open(buildGame([seatOn('a', 'settled'), seatOn('b', 'round')]))
    await table.send('a', {
      event: 'submit-group-challenge-answers',
      ranking: ['SE'],
      subject: seatSubject.round(0),
      seq: 1,
    } as ClientEventData)
    expect((await table.read()).rounds[0]!.groupAnswers.a).toBeUndefined()
    expect(await stepOf(table, 'a')).toBe('settled')
  })

  it('an illegal move is refused whole — nothing saved, nothing emitted', async () => {
    const table = await open(buildGame([seatOn('a', 'settled')]))
    const emitted = table.emits.length
    await expect(
      table.send('a', { event: 'gate-reveal-done', subject: seatSubject.settled(0), seq: 1 })
    ).resolves.toBeUndefined()
    expect(table.emits.length).toBe(emitted)
  })
})
