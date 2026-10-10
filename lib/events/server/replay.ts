import type { RoomExport } from '~~/lib/debug-rooms'
import { seatInvariantViolations, type SeatViolation } from '~~/lib/seat-invariants'
import type { ClientEventData } from '~~/types/events.types'
import type { Game } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'
import type { SeatJournalEntry } from '~~/types/seat.types'
import { enqueueGameTask, useServerSideEvents } from '../server-side'
import { setBotBrainEnabled } from './bot-brain'
import { joinEventHandler } from './join.event'
import { setDrawSource, type DrawSource } from './draws'
import { rearmLiveRound } from './rearm-round'
import { retireSeat } from './seat-exits'
import type { SeatEventRecord } from './seat-journal'
import { createTestTable, uniqueGameId } from './test-table'

/**
 * Test scaffolding only — never imported by runtime code. Deterministic
 * replay of a recorded room: start from a round-start checkpoint and its
 * secret side keys, hand every recorded draw back through the draw seam, and play every
 * recorded client event, bot act and server act at its recorded moment
 * through the real handlers and the real timers. The brain sits still; its
 * acts come from the record. Any production incident with an export becomes
 * a regression test.
 */

export interface ReplayClock {
  /** Pin the fake clock to an absolute moment before anything runs. */
  setNow: (at: number) => void
  /** Advance the fake clock (and run every timer due) by `ms`. */
  advance: (ms: number) => Promise<void>
}

export interface ReplayOutcome {
  recorded: SeatJournalEntry[]
  replayed: SeatJournalEntry[]
  /** Per seat, the first transition where replay and record disagree. */
  mismatches: string[]
  /** Invariant violations seen after any replayed input. */
  violations: SeatViolation[]
}

/** A transition's identity for comparison: everything but its clock. */
export const transitionSignature = (entry: SeatJournalEntry) =>
  `${entry.from}>${entry.to} ${entry.cause} ${entry.subject}`

const bySeat = (entries: SeatJournalEntry[]) => {
  const seats = new Map<string, SeatJournalEntry[]>()
  for (const entry of entries) {
    if (entry.progress) continue
    seats.set(entry.seat, [...(seats.get(entry.seat) ?? []), entry])
  }
  return seats
}

/**
 * Per seat, the first transition where replay and record disagree. A replay
 * may run on past the record's horizon — the recording simply ended there —
 * but any extra transition BEFORE it is a divergence.
 */
export const compareJournals = (
  recorded: SeatJournalEntry[],
  replayed: SeatJournalEntry[],
  horizon = Infinity
): string[] => {
  const expected = bySeat(recorded)
  const actual = bySeat(replayed)
  const mismatches: string[] = []
  for (const seat of new Set([...expected.keys(), ...actual.keys()])) {
    const want = (expected.get(seat) ?? []).map(transitionSignature)
    const got = actual.get(seat) ?? []
    const at = want.findIndex(
      (signature, index) => !got[index] || transitionSignature(got[index]) !== signature
    )
    if (at !== -1) {
      const replayedAt = got[at] ? transitionSignature(got[at]) : '(nothing)'
      mismatches.push(`${seat} #${at}: recorded "${want[at]}", replayed "${replayedAt}"`)
      continue
    }
    const extra = got[want.length]
    if (extra && extra.at < horizon) {
      mismatches.push(`${seat} #${want.length}: replay went on to "${transitionSignature(extra)}"`)
    }
  }
  return mismatches
}

/** Recorded draws, handed back in recorded order per label. */
const drawSource = (records: SeatEventRecord[]): DrawSource => {
  const queues = new Map<string, unknown[]>()
  for (const record of records) {
    if (record.kind !== 'deal') continue
    queues.set(record.label, [...(queues.get(record.label) ?? []), record.value])
  }
  return label => {
    const queue = queues.get(label)
    return queue?.length ? { value: queue.shift() } : undefined
  }
}

const replaySocket = (playerId: string) =>
  ({
    data: {},
    handshake: { auth: { playerId } },
    emit: () => true,
    join: async () => undefined,
    disconnect: () => undefined,
  }) as never

export const replayRoom = async (
  bundle: RoomExport,
  clock: ReplayClock
): Promise<ReplayOutcome> => {
  if (!bundle.checkpoint) throw new Error(`Room ${bundle.id} has no checkpoint to replay from`)
  // Its own id: nothing the recorded room still has in flight in this
  // process (queue tasks, journal listeners) can reach the replay.
  const start = { ...(bundle.checkpoint.game as Game), id: uniqueGameId(`replay-${bundle.id}`) }
  clock.setNow(bundle.checkpoint.at)
  setBotBrainEnabled(false)
  setDrawSource(drawSource(bundle.events))
  const table = await createTestTable(start)
  for (const [suffix, value] of Object.entries(bundle.checkpoint.sides)) {
    await table.redis.set(`${start.id}${suffix}`, value)
  }
  const violations: SeatViolation[] = []
  const check = async () => {
    violations.push(
      ...seatInvariantViolations(await table.read(), { now: Date.now(), armed: table.armed() })
    )
  }

  try {
    rearmLiveRound(table.ctx(start.host), start)
    const inputs = bundle.events
      .filter(
        (record): record is Extract<SeatEventRecord, { kind: 'event' }> => record.kind === 'event'
      )
      .sort((a, b) => a.at - b.at)
    for (const record of inputs) {
      await clock.advance(Math.max(0, record.at - Date.now()))
      if (record.actor === 'server') {
        await replayServerAct(table, record)
      } else if (record.event === 'join') {
        await enqueueGameTask(table.id, () =>
          joinEventHandler({
            ...table.ctx(record.actor),
            socket: replaySocket(record.actor),
            eventKey: 'join',
            eventData: record.data as ClientEventData,
          })
        )
      } else {
        await table.send(record.actor, record.data as ClientEventData)
      }
      await check()
    }
    const horizon = Math.max(
      ...bundle.journal.map(entry => entry.at),
      ...bundle.events.map(record => record.at),
      Date.now()
    )
    await clock.advance(horizon - Date.now())
    await check()
    return {
      recorded: bundle.journal,
      replayed: table.journal,
      mismatches: compareJournals(bundle.journal, table.journal, horizon),
      violations,
    }
  } finally {
    setDrawSource(undefined)
    setBotBrainEnabled(true)
    table.dispose()
  }
}

/** The server's own acts that no client sent: the autopilot taking a seat, a bot retiring (or a winner's retirement lifted). */
const replayServerAct = async (
  table: Awaited<ReturnType<typeof createTestTable>>,
  record: Extract<SeatEventRecord, { kind: 'event' }>
) => {
  const { playerId, autopilot } = record.data as {
    playerId: string
    autopilot?: Player['autopilot']
  }
  await enqueueGameTask(table.id, async () => {
    const server = useServerSideEvents(table.ctx(playerId))
    const game = await server.fetchGame(table.id)
    const seat = game?.players[playerId]
    if (!game || !seat) return
    if (record.event === 'autopilot-engage') seat.autopilot = autopilot
    if (record.event === 'retire') retireSeat(game, seat)
    if (record.event === 'retire-clear') delete seat.retiring
    await server.updateGameState(game)
    server.emit({ event: 'table-updated', game }, { gameId: game.id, playerId })
  })
}
