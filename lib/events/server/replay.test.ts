import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { exportRoom, type RoomExport } from '~~/lib/debug-rooms'
import { createBot } from '~~/lib/bots'
import { createPlayer } from '~~/lib/player'
import { generateTiles } from '~~/lib/tiles'
import type { Game } from '~~/types/game.types'
import { compareJournals, replayRoom, type ReplayClock } from './replay'
import { dropArmedTimersForTests } from './seat-cursor'
import { createTestTable, uniqueGameId, warmDeferredModules } from './test-table'

const REPLAYS_DIR = fileURLToPath(new URL('./replays/', import.meta.url))

const clock: ReplayClock = {
  setNow: at => {
    vi.setSystemTime(at)
  },
  advance: async ms => {
    await vi.advanceTimersByTimeAsync(ms)
  },
}

/** A lobby the brain can play end to end: two bots and a human it covers. */
const autopilotTable = (): Game => {
  const id = uniqueGameId('replay')
  const human = { ...createPlayer('human'), name: 'Human', ready: true, autopilot: { sinceRound: 0 } }
  const bots = [createBot([human]), createBot([human])]
  bots[1]!.name = `${bots[1]!.name}-2`
  return {
    id,
    host: human.id,
    started: false,
    length: 'short',
    variant: 'world',
    difficulty: 'normal',
    liveGuesses: true,
    challengeOverrides: {},
    tiles: generateTiles('short', id),
    rounds: [],
    players: Object.fromEntries([human, ...bots].map(seat => [seat.id, seat])),
  } as unknown as Game
}

beforeAll(warmDeferredModules, 60_000)

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubEnv('FORCE_ROUND_TYPE', 'two-truths')
})
afterEach(() => {
  vi.unstubAllEnvs()
  dropArmedTimersForTests()
  vi.useRealTimers()
})

describe('deterministic replay', () => {
  it('plays a recorded game back through the real handlers, transition for transition', async () => {
    const game = autopilotTable()
    const live = await createTestTable(game, { connected: [game.host] })
    await live.send(game.host, { event: 'start-game' })
    await vi.advanceTimersByTimeAsync(8 * 60_000)
    live.dispose()

    const bundle = await exportRoom(live.redis, game.id, 'earliest')
    expect(bundle.checkpoint).toBeDefined()
    expect(bundle.events.some(record => record.kind === 'event' && record.bot)).toBe(true)
    const moved = bundle.journal.filter(entry => !entry.progress)
    expect(new Set(moved.map(entry => entry.to)).size).toBeGreaterThan(5)

    dropArmedTimersForTests()
    vi.clearAllTimers()
    const outcome = await replayRoom(bundle, clock)
    expect(outcome.mismatches).toEqual([])
    expect(outcome.violations).toEqual([])
  }, 60_000)

  it('names the first divergent transition per seat', () => {
    const entry = (seat: string, to: string, seq: number) => ({
      game: 'g',
      seat,
      seq,
      from: 'round' as const,
      to: to as 'scores',
      subject: 's',
      cause: 'c',
      at: seq,
    })
    expect(compareJournals([entry('a', 'scores', 1)], [entry('a', 'round-verdict', 1)])).toEqual([
      'a #0: recorded "round>scores c s", replayed "round>round-verdict c s"',
    ])
    expect(compareJournals([entry('a', 'scores', 1)], [entry('a', 'scores', 1)])).toEqual([])
  })

  const fixtures = fs.existsSync(REPLAYS_DIR)
    ? fs.readdirSync(REPLAYS_DIR).filter(name => name.endsWith('.json'))
    : []
  it.each(fixtures)('replays the captured room %s without a divergence', async name => {
    const bundle = JSON.parse(fs.readFileSync(path.join(REPLAYS_DIR, name), 'utf8')) as RoomExport
    const outcome = await replayRoom(bundle, clock)
    expect(outcome.mismatches).toEqual([])
    expect(outcome.violations).toEqual([])
  }, 120_000)
})
