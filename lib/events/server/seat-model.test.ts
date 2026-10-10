import fc from 'fast-check'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { sample } from '~~/lib/arrays'
import { BOT_ID_PREFIX, createBot } from '~~/lib/bots'
import { createPlayer } from '~~/lib/player'
import { seededRandom } from '~~/lib/random'
import { isClassicGroupRound, seatWindowMsFor } from '~~/lib/round-beats'
import { ROUND_KINDS } from '~~/lib/round-mix'
import { latestRound } from '~~/lib/rounds'
import { seatInvariantViolations } from '~~/lib/seat-invariants'
import { isTerminalStep, RETIREMENT_STEPS } from '~~/lib/seat-transitions'
import { generateTiles } from '~~/lib/tiles'
import {
  HARD_ONLY_ROUND_KINDS,
  MINIMUM_TABLE_BY_KIND,
} from '~~/types/challenges/challenge-groups.type'
import type { ClientEventData, SeatEcho } from '~~/types/events.types'
import type { Game, GameDifficulty } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'
import type { SeatCursor } from '~~/types/seat.types'
import { enqueueGameTask, useServerSideEvents } from '../server-side'
import { armAfkTakeover, armBotPump, composeClassicSubmission, finalAnswerFor } from './bot-brain'
import { joinEventHandler } from './join.event'
import { rearmLiveRound } from './rearm-round'
import { dropArmedTimersForTests } from './seat-cursor'
import { retireSeat } from './seat-exits'
import { createTestTable, type TestTable, uniqueGameId, warmDeferredModules } from './test-table'

/**
 * Model-based: random tables and random interleavings of player input,
 * clock, restarts, reconnects, autopilot and bot retirement, with the seat
 * contract checked after every step — then the table left alone must finish.
 */

const RUNS = Number(process.env.SEAT_MODEL_RUNS ?? 150)
const SEED = process.env.SEAT_MODEL_SEED ? Number(process.env.SEAT_MODEL_SEED) : undefined
const REPLAY_PATH = process.env.SEAT_MODEL_PATH
const EPOCH = 1_800_000_000_000
const RESTART_DOWNTIME_MS = 10_000
const LIVENESS_CHUNK_MS = 30_000
const STALL_LIMIT_MS = 10 * 60_000
const VICTORY_LIMIT_MS = 4 * 60 * 60_000

type HumanRole = 'active' | 'silent' | 'autopilot'
type SeatRole = HumanRole | 'bot'

type Command =
  | { kind: 'act'; seat: number }
  | { kind: 'stale'; seat: number; pick: number }
  | { kind: 'duplicate'; seat: number }
  | { kind: 'wait'; ms: number }
  | { kind: 'restart' }
  | { kind: 'disconnect'; seat: number }
  | { kind: 'join'; seat: number }
  | { kind: 'autopilot'; seat: number }
  | { kind: 'remove-bot'; seat: number }
  | { kind: 'retire'; seat: number }

interface Scenario {
  seed: number
  host: HumanRole
  others: SeatRole[]
  difficulty: GameDifficulty
  forced?: string
  commands: Command[]
}

const FORCEABLE_KINDS = ROUND_KINDS.filter(
  kind => MINIMUM_TABLE_BY_KIND[kind] === undefined && !HARD_ONLY_ROUND_KINDS.has(kind)
)

const seatIndex = fc.nat({ max: 3 })
const commandArb: fc.Arbitrary<Command> = fc.oneof(
  { weight: 6, arbitrary: fc.record({ kind: fc.constant('act' as const), seat: seatIndex }) },
  {
    weight: 6,
    arbitrary: fc.record({
      kind: fc.constant('wait' as const),
      ms: fc.oneof(fc.integer({ min: 0, max: 5_000 }), fc.integer({ min: 5_000, max: 180_000 })),
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({ kind: fc.constant('stale' as const), seat: seatIndex, pick: fc.nat() }),
  },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant('duplicate' as const), seat: seatIndex }) },
  { weight: 1, arbitrary: fc.constant({ kind: 'restart' as const }) },
  {
    weight: 1,
    arbitrary: fc.record({ kind: fc.constant('disconnect' as const), seat: seatIndex }),
  },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant('join' as const), seat: seatIndex }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('autopilot' as const), seat: seatIndex }) },
  {
    weight: 1,
    arbitrary: fc.record({ kind: fc.constant('remove-bot' as const), seat: seatIndex }),
  },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('retire' as const), seat: seatIndex }) }
)

const scenarioArb: fc.Arbitrary<Scenario> = fc.record({
  seed: fc.noBias(fc.integer({ min: 1, max: 0x7fffffff })),
  host: fc.constantFrom<HumanRole>('active', 'silent', 'autopilot'),
  others: fc.array(fc.constantFrom<SeatRole>('active', 'silent', 'autopilot', 'bot', 'bot'), {
    minLength: 1,
    maxLength: 3,
  }),
  difficulty: fc.constantFrom<GameDifficulty>('easy', 'normal', 'hard'),
  forced: fc.oneof(
    { weight: 2, arbitrary: fc.constant(undefined) },
    { weight: 1, arbitrary: fc.constantFrom(...FORCEABLE_KINDS) }
  ),
  commands: fc.array(commandArb, { maxLength: 50 }),
})

const lobby = (scenario: Scenario): { game: Game; roles: Map<string, SeatRole> } => {
  const roles = new Map<string, SeatRole>()
  const seats: Player[] = []
  for (const [index, role] of [scenario.host, ...scenario.others].entries()) {
    if (role === 'bot') {
      seats.push({ ...createBot(seats), id: `${BOT_ID_PREFIX}model-${index}` })
    } else {
      seats.push({
        ...createPlayer(`human-${index}`),
        name: `Human ${index}`,
        ready: true,
        ...(role === 'autopilot' ? { autopilot: { sinceRound: 0 } } : {}),
      })
    }
    roles.set(seats.at(-1)!.id, role)
  }
  const game = {
    id: uniqueGameId('model'),
    host: seats[0]!.id,
    started: false,
    length: 'short',
    variant: 'world',
    difficulty: scenario.difficulty,
    liveGuesses: true,
    challengeOverrides: {},
    tiles: generateTiles('short', `model-${scenario.seed}`),
    rounds: [],
    players: Object.fromEntries(seats.map(seat => [seat.id, seat])),
  } as unknown as Game
  return { game, roles }
}

const echoOf = (cursor: SeatCursor): SeatEcho => ({ subject: cursor.subject, seq: cursor.seq })

/** What a client on this seat's screen would send, or a probe the step must refuse. */
const actFor = async (game: Game, seat: Player): Promise<ClientEventData> => {
  const echo = echoOf(seat.cursor)
  const round = latestRound(game)
  const head = seat.moves[0]?.challenge
  switch (seat.cursor.step) {
    case 'tutorial':
      return { event: 'close-tutorial', ...echo }
    case 'round': {
      if (!round || !isClassicGroupRound(round.groupChallenge)) break
      if (seatWindowMsFor(round.groupChallenge) && seat.cursor.deadline === undefined) {
        return { event: 'round-play', ...echo }
      }
      const submission = await composeClassicSubmission(game, round, seat.id)
      if (!submission) break
      return { event: 'submit-group-challenge-answers', ...submission, ...echo }
    }
    case 'round-verdict':
      return { event: 'round-reveal-done', ...echo }
    case 'scores':
      return { event: 'enter-movement-phase', ...echo }
    case 'gate': {
      if (head?._type !== 'individual-challenge') break
      const isoCode = sample([head.country, ...(head.options ?? [])]) ?? head.country
      return { event: 'submit-individual-challenge-answer', isoCode, hintsUsed: 0, ...echo }
    }
    case 'gate-verdict':
      return { event: 'gate-reveal-done', ...echo }
    case 'final': {
      const question = head?._type === 'final-challenge' ? head.challenges[0] : undefined
      const submittedAnswer = question && (await finalAnswerFor(question, Math.random(), game))
      if (!submittedAnswer) break
      return { event: 'submit-final-challenge-answer', submittedAnswer, ...echo }
    }
  }
  return { event: 'enter-movement-phase', ...echo }
}

const stubSocket = (playerId: string) =>
  ({
    id: `socket-${playerId}`,
    data: {},
    handshake: { auth: { playerId } },
    emit: () => true,
    join: async () => undefined,
    disconnect: () => undefined,
  }) as never

/** The server's own acts no client sends, in the shape production runs them. */
const serverAct = (
  table: TestTable,
  playerId: string,
  act: (game: Game, seat: Player) => boolean
) =>
  enqueueGameTask(table.id, async () => {
    const server = useServerSideEvents(table.ctx(playerId))
    const game = await server.fetchGame(table.id)
    const seat = game?.players[playerId]
    if (!game || !seat || !act(game, seat)) return
    await server.updateGameState(game)
    server.emit({ event: 'table-updated', game }, { gameId: game.id, playerId })
    if (seat.autopilot) armBotPump(table.ctx(playerId), game)
  })

const swap = (stand: {
  random: () => number
  log: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}) => {
  const { random } = Math
  const { log, warn, error } = console
  Math.random = stand.random
  Object.assign(console, { log: stand.log, warn: stand.warn, error: stand.error })
  return () => {
    Math.random = random
    Object.assign(console, { log, warn, error })
  }
}

const runScenario = async (scenario: Scenario) => {
  vi.setSystemTime(EPOCH)
  vi.stubEnv('SEAT_JOURNAL_LOG', '1')
  if (scenario.forced) vi.stubEnv('FORCE_ROUND_TYPE', scenario.forced)
  const illegal: string[] = []
  const crashes: string[] = []
  // Plain swaps, not spies: a spy records every call, and a few hundred games
  // of Math.random calls and journal lines exhaust the heap.
  const restore = swap({
    random: seededRandom(scenario.seed),
    log: (line: unknown) => {
      if (typeof line === 'string' && line.startsWith('seat-illegal')) illegal.push(line)
    },
    warn: () => undefined,
    error: (message: unknown, error?: unknown) => {
      if (typeof message === 'string' && /task failed|tick failed|^seat-unsent/.test(message)) {
        crashes.push(`${message}: ${error instanceof Error ? error.stack : String(error)}`)
      }
    },
  })

  const { game, roles } = lobby(scenario)
  const humans = [...roles].filter(([, role]) => role !== 'bot').map(([id]) => id)
  const actives = [...roles].filter(([, role]) => role === 'active').map(([id]) => id)
  const bots = [...roles].filter(([, role]) => role === 'bot').map(([id]) => id)
  const connected = humans.filter(id => id === game.host || roles.get(id) !== 'autopilot')
  const table = await createTestTable(game, { connected, captureEmits: false })

  const highest = new Map<string, number>()
  const echoes = new Map<string, SeatEcho[]>()
  const lastSent = new Map<string, { data: ClientEventData; moved: boolean }>()

  const check = async (label: string) => {
    const state = await table.read()
    expect(
      seatInvariantViolations(state, { now: Date.now(), armed: table.armed() }),
      label
    ).toEqual([])
    for (const seat of Object.values(state.players)) {
      const before = highest.get(seat.id) ?? 0
      expect(seat.cursor.seq, `${label}: ${seat.id} seq`).toBeGreaterThanOrEqual(before)
      highest.set(seat.id, seat.cursor.seq)
      const seen = echoes.get(seat.id) ?? []
      if (seen.at(-1)?.subject !== seat.cursor.subject) seen.push(echoOf(seat.cursor))
      echoes.set(seat.id, seen)
    }
    expect(illegal, label).toEqual([])
    expect(crashes, label).toEqual([])
    return state
  }

  const cursorOf = async (playerId: string) => (await table.read()).players[playerId]!.cursor

  /** A send the seat's current screen cannot own must leave its cursor exactly as it was. */
  const sendInert = async (playerId: string, data: ClientEventData, label: string) => {
    const before = await cursorOf(playerId)
    await table.send(playerId, data)
    expect(await cursorOf(playerId), label).toEqual(before)
  }

  const run = async (command: Command) => {
    const pick = <T>(list: readonly T[], index: number) =>
      list.length ? list[index % list.length] : undefined
    switch (command.kind) {
      case 'wait':
        return vi.advanceTimersByTimeAsync(command.ms)
      case 'act': {
        const id = pick(actives, command.seat)
        if (!id) return
        const state = await table.read()
        const seat = state.players[id]!
        const data = await actFor(state, seat)
        await table.send(id, data)
        lastSent.set(id, { data, moved: (await cursorOf(id)).seq !== seat.cursor.seq })
        return
      }
      case 'stale': {
        const id = pick(actives, command.seat)
        if (!id) return
        const state = await table.read()
        const seat = state.players[id]!
        const old = (echoes.get(id) ?? []).filter(echo => echo.subject !== seat.cursor.subject)
        const echo = pick(old, command.pick) ?? { subject: 'round:-1', seq: 0 }
        const data = { ...(await actFor(state, seat)), ...echo } as ClientEventData
        return sendInert(id, data, `stale ${data.event} ${echo.subject} on ${seat.cursor.subject}`)
      }
      case 'duplicate': {
        const id = pick(actives, command.seat)
        const sent = id && lastSent.get(id)
        if (!id || !sent) return
        if (sent.moved) return sendInert(id, sent.data, `duplicate ${sent.data.event}`)
        return table.send(id, sent.data)
      }
      case 'restart': {
        const downAt = Date.now()
        dropArmedTimersForTests()
        vi.clearAllTimers()
        vi.setSystemTime(downAt + RESTART_DOWNTIME_MS)
        rearmLiveRound(table.ctx(game.host), await table.read())
        return vi.advanceTimersByTimeAsync(0)
      }
      case 'disconnect': {
        const id = pick(
          humans.filter(human => human !== game.host),
          command.seat
        )
        if (!id || !connected.includes(id)) return
        connected.splice(connected.indexOf(id), 1)
        armAfkTakeover(table.ctx(id), `socket-${id}`)
        return
      }
      case 'join': {
        const id = pick(humans, command.seat)
        if (!id) return
        if (!connected.includes(id)) connected.push(id)
        return enqueueGameTask(table.id, () =>
          joinEventHandler({
            ...table.ctx(id),
            socket: stubSocket(id),
            eventKey: 'join',
            eventData: { event: 'join', variant: 'world' },
          })
        )
      }
      case 'autopilot': {
        const id = pick(humans, command.seat)
        if (!id) return
        return serverAct(table, id, (state, seat) => {
          if (!state.started || seat.autopilot || isTerminalStep(seat.cursor.step)) return false
          seat.autopilot = { sinceRound: state.rounds.length }
          return true
        })
      }
      case 'remove-bot': {
        const id = pick(bots, command.seat)
        if (!id) return
        return table.send(game.host, { event: 'remove-bot', targetId: id })
      }
      case 'retire': {
        const id = pick(bots, command.seat)
        if (!id) return
        return serverAct(table, id, (state, seat) => {
          if (!RETIREMENT_STEPS.includes(seat.cursor.step)) return false
          retireSeat(state, seat)
          return true
        })
      }
    }
  }

  try {
    await table.send(game.host, { event: 'start-game' })
    await check('start')
    for (const [index, command] of scenario.commands.entries()) {
      await run(command)
      await check(`#${index} ${JSON.stringify(command)}`)
    }

    const lastMove = new Map<string, { seq: number; at: number }>()
    const startedAt = Date.now()
    let tableMovedAt = startedAt
    let state = await table.read()
    const mustWin =
      !scenario.forced &&
      Object.values(state.players).some(
        seat => seat.bot && !seat.retiring && !isTerminalStep(seat.cursor.step)
      )
    while (!Object.values(state.players).some(seat => seat.cursor.step === 'victory')) {
      const elapsed = Date.now() - startedAt
      if (mustWin) expect(elapsed, 'victory overdue').toBeLessThan(VICTORY_LIMIT_MS)
      else if (elapsed >= VICTORY_LIMIT_MS) break
      await vi.advanceTimersByTimeAsync(LIVENESS_CHUNK_MS)
      state = await check(`liveness +${elapsed}ms`)
      for (const seat of Object.values(state.players)) {
        const last = lastMove.get(seat.id)
        if (!last || last.seq !== seat.cursor.seq) {
          lastMove.set(seat.id, { seq: seat.cursor.seq, at: Date.now() })
          if (last) tableMovedAt = Date.now()
          continue
        }
        if (isTerminalStep(seat.cursor.step) || seat.cursor.step === 'settled') continue
        expect(Date.now() - last.at, `${seat.id} stalled on ${seat.cursor.step}`).toBeLessThan(
          STALL_LIMIT_MS
        )
      }
      expect(Date.now() - tableMovedAt, 'table stalled').toBeLessThan(STALL_LIMIT_MS)
    }
    expect(
      seatInvariantViolations(state, { now: Date.now(), journal: table.journal }),
      'journal'
    ).toEqual([])
  } finally {
    table.dispose()
    dropArmedTimersForTests()
    vi.clearAllTimers()
    vi.unstubAllEnvs()
    restore()
  }
}

beforeAll(warmDeferredModules, 60_000)
beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('the seat contract under random play', () => {
  it(
    `holds every invariant after every input; left alone, every seat keeps moving and a short game a lobby bot races on the natural mix reaches victory within 4 virtual hours (${RUNS} runs)`,
    async () => {
      await fc.assert(fc.asyncProperty(scenarioArb, runScenario), {
        numRuns: RUNS,
        ...(SEED !== undefined ? { seed: SEED } : {}),
        ...(REPLAY_PATH ? { path: REPLAY_PATH } : {}),
      })
    },
    Math.max(20 * 60_000, RUNS * 2000)
  )
})
