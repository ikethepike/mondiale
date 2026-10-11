/**
 * The seat-cursor acceptance matrix: every cell is a playtest run (its own
 * built server on its own port, PLAYTEST_ROOMS rooms in parallel), and the
 * report rolls every room's summary.json into one verdict — room-hours,
 * incidents by kind, render lags, invariant violations, the server's
 * seat-audit / seat-illegal / seat-unsent lines, and whether every human seat
 * actually played: moved through its subjects, never stalled, and reached the
 * gauntlet where it was forced.
 *
 *   bun run build
 *   bun run scripts/playtest-matrix.ts --rooms 2 --minutes 40 --concurrency 3 --min-hours 10
 *   bun run scripts/playtest-matrix.ts --only forced-final,chronicle --rooms 1
 *   bun run scripts/playtest-matrix.ts --report-only
 *
 * Never on port 3000 — cells take --port-base (3120) upward.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { MIN_ROOM_READ_SHARE, type PlaytestSummary } from '../e2e/playtest-summary'

/** Every acceptance line the report carries; the #174 audit requires each one. */
export const MATRIX_CHECKS = [
  'room-hours',
  'zero render-lag',
  'zero invariant violations',
  'zero seat-audit / seat-illegal / seat-unsent lines',
  'every server log was read',
  'every room answered /debug/rooms',
  'every human seat made progress',
  'zero subject stalls',
  'every forced gauntlet was reached',
  'zero frozen seats',
  'zero view-grammar violations',
  'every cell exited clean',
] as const
export type MatrixCheck = (typeof MATRIX_CHECKS)[number]

export interface MatrixReport {
  roomHours: number
  minHours: number
  rooms: number
  byKind: Record<string, number>
  unfinished: string[]
  checks: { name: MatrixCheck; ok: boolean; value: string }[]
  exits: Record<string, number | undefined>
}

interface Cell {
  name: string
  env: Record<string, string>
}

const CELLS: Cell[] = [
  { name: 'chromium-mixed', env: {} },
  { name: 'webkit-mixed', env: { PLAYTEST_BROWSER: 'webkit' } },
  { name: 'iphone-chaos', env: { PLAYTEST_DEVICE: 'iPhone 14', PLAYTEST_CHAOS: '1' } },
  { name: 'forced-final', env: { FORCE_FINAL_CHALLENGE: '1' } },
  { name: 'chronicle', env: { FORCE_INDIVIDUAL_VARIANT: 'chronicle' } },
  { name: 'stat-detective', env: { FORCE_ROUND_TYPE: 'stat-detective' } },
  { name: 'name-that-water', env: { FORCE_ROUND_TYPE: 'name-that-water' } },
  { name: 'empire', env: { FORCE_ROUND_TYPE: 'empire' } },
  { name: 'trend-race', env: { FORCE_ROUND_TYPE: 'trend-race' } },
]

const arg = (name: string, fallback?: string) => {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? fallback : process.argv[index + 1]
}
const flag = (name: string) => process.argv.includes(`--${name}`)

const ROOMS = arg('rooms', '1')!
const MINUTES = arg('minutes', '40')!
const CONCURRENCY = Number(arg('concurrency', '1'))
const PORT_BASE = Number(arg('port-base', '3120'))
const MIN_HOURS = Number(arg('min-hours', '0'))
const OUT = path.resolve(arg('out', 'test-results/playtest-matrix')!)
const only = arg('only')?.split(',')
const cells = only ? CELLS.filter(cell => only.includes(cell.name)) : CELLS

const runCell = (cell: Cell, port: number) =>
  new Promise<number>(resolve => {
    const out = path.join(OUT, cell.name)
    fs.mkdirSync(out, { recursive: true })
    const log = fs.createWriteStream(path.join(out, 'playwright.log'))
    const child = spawn(
      'bunx',
      ['playwright', 'test', '--config=playwright.playtest.config.ts', '--reporter=line'],
      {
        env: {
          ...process.env,
          ...cell.env,
          PLAYTEST_ROOMS: ROOMS,
          PLAYTEST_MINUTES: MINUTES,
          PLAYTEST_PORT: String(port),
          PLAYTEST_OUT: out,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    )
    child.stdout.pipe(log)
    child.stderr.pipe(log)
    console.log(`[matrix] ${cell.name} started on :${port}`)
    child.on('close', code => {
      console.log(`[matrix] ${cell.name} finished (exit ${code})`)
      resolve(code ?? 1)
    })
  })

const summariesIn = (dir: string): PlaytestSummary[] =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => path.join(dir, entry.name, 'summary.json'))
        .filter(file => fs.existsSync(file))
        .map(file => JSON.parse(fs.readFileSync(file, 'utf8')) as PlaytestSummary)
    : []

const report = (exits: Record<string, number | undefined>) => {
  const perCell = CELLS.map(cell => ({
    cell,
    rooms: summariesIn(path.join(OUT, cell.name)),
  })).filter(entry => entry.rooms.length)
  const rooms = perCell.flatMap(entry => entry.rooms)
  const incidents = rooms.flatMap(room => room.incidents)
  const byKind: Record<string, number> = {}
  for (const incident of incidents) {
    const family = incident.kind.split(':').slice(0, 2).join(':')
    byKind[family] = (byKind[family] ?? 0) + 1
  }
  const roomHours = rooms.reduce((sum, room) => sum + room.minutes, 0) / 60
  const renderLags = incidents.filter(incident => incident.kind.startsWith('render-lag')).length
  const invariants = incidents.filter(incident => incident.kind.startsWith('invariant:')).length
  const serverLines = rooms.reduce((sum, room) => sum + room.serverLines.length, 0)
  const unfinished = rooms.filter(room => !room.finished).map(room => room.gameId)
  const grammar = rooms.reduce((sum, room) => sum + room.grammar.length, 0)
  const frozen = incidents.filter(
    incident => incident.kind !== 'long-task' && incident.selfHealedMs === undefined
  ).length
  const unlogged = rooms
    .filter(room => !room.serverLogChecked)
    .map(room => `${room.gameId}: ${room.serverLogNote ?? 'unlogged'}`)
  const unread = rooms
    .filter(
      room => !room.roomReads || room.roomReads.read < room.roomReads.ticks * MIN_ROOM_READ_SHARE
    )
    .map(room => `${room.gameId}: ${room.roomReads?.read ?? 0}/${room.roomReads?.ticks ?? 0}`)
  const idle = rooms.flatMap(room =>
    !room.progress?.length
      ? [`${room.gameId}: no human seat`]
      : room.progress
          .filter(seat => !seat.victory && seat.subjects < seat.floor)
          .map(seat => `${room.gameId} ${seat.name ?? seat.seat}: ${seat.subjects}/${seat.floor}`)
  )
  const stalls = incidents.filter(incident => incident.kind === 'stall').length
  const finalMissed = rooms
    .filter(room => room.forcedFinal && !room.reachedFinal)
    .map(room => room.gameId)

  const check = (name: MatrixCheck, ok: boolean, value: unknown) => ({
    name,
    ok,
    value: typeof value === 'string' ? value : JSON.stringify(value),
  })
  const checks = [
    check('room-hours', roomHours >= MIN_HOURS, `${roomHours.toFixed(2)} (≥ ${MIN_HOURS})`),
    check('zero render-lag', renderLags === 0, renderLags),
    check('zero invariant violations', invariants === 0, invariants),
    check('zero seat-audit / seat-illegal / seat-unsent lines', serverLines === 0, serverLines),
    check('every server log was read', rooms.length > 0 && !unlogged.length, unlogged),
    check('every room answered /debug/rooms', rooms.length > 0 && !unread.length, unread),
    check('every human seat made progress', rooms.length > 0 && !idle.length, idle),
    check('zero subject stalls', stalls === 0, stalls),
    check('every forced gauntlet was reached', !finalMissed.length, finalMissed),
    check('zero frozen seats', frozen === 0, frozen),
    check('zero view-grammar violations', grammar === 0, grammar),
    check(
      'every cell exited clean',
      Object.values(exits).every(code => code === undefined || code === 0),
      exits
    ),
  ]

  const lines = [
    `# Playtest matrix`,
    '',
    `${rooms.length} rooms across ${perCell.length} cells, ${roomHours.toFixed(2)} room-hours.`,
    '',
    '| cell | rooms | room-hours | finished | incidents |',
    '|---|---|---|---|---|',
    ...perCell.map(
      ({ cell, rooms: cellRooms }) =>
        `| ${cell.name} | ${cellRooms.length} | ${(cellRooms.reduce((sum, room) => sum + room.minutes, 0) / 60).toFixed(2)} | ${cellRooms.filter(room => room.finished).length} | ${cellRooms.reduce((sum, room) => sum + room.incidents.length, 0)} |`
    ),
    '',
    '| acceptance | result | value |',
    '|---|---|---|',
    ...checks.map(({ name, ok, value }) => `| ${name} | ${ok ? 'pass' : '**FAIL**'} | ${value} |`),
    '',
    '## Incidents by kind',
    '',
    ...(Object.keys(byKind).length
      ? Object.entries(byKind).map(([kind, count]) => `- ${kind}: ${count}`)
      : ['- none']),
    ...(unfinished.length
      ? ['', '## Played the full budget without a winner', '', ...unfinished.map(id => `- ${id}`)]
      : []),
  ]
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(path.join(OUT, 'report.md'), lines.join('\n') + '\n')
  const report: MatrixReport = {
    roomHours,
    minHours: MIN_HOURS,
    rooms: rooms.length,
    byKind,
    unfinished,
    checks,
    exits,
  }
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2))
  console.log(lines.join('\n'))
  return checks.every(({ ok }) => ok)
}

const main = async () => {
  const exits: Record<string, number | undefined> = {}
  if (!flag('report-only')) {
    if (!fs.existsSync('.output/server/index.mjs')) {
      console.error('No .output — run `bun run build` first.')
      process.exit(1)
    }
    const queue = cells.map((cell, index) => ({ cell, port: PORT_BASE + index }))
    const workers = Array.from({ length: Math.max(1, CONCURRENCY) }, async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        exits[next.cell.name] = await runCell(next.cell, next.port)
      }
    })
    await Promise.all(workers)
  }
  process.exit(report(exits) ? 0 : 1)
}

if (import.meta.main) void main()
