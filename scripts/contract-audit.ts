/**
 * The #174 completion audit: every bullet of the issue, mapped to the proof
 * that it is done — a named test that must exist (and, with --run, pass), a
 * file that must say something, a census rule, or a line of the playtest
 * matrix report. A bullet without evidence, or whose evidence is missing,
 * fails the audit. The markdown it prints is the PR's checklist.
 *
 *   bun run scripts/contract-audit.ts              # evidence exists
 *   bun run scripts/contract-audit.ts --run        # …and every cited suite passes
 *   bun run scripts/contract-audit.ts --run --matrix test-results/playtest-matrix/report.json
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'

type Evidence =
  | { test: string; name: string }
  | { file: string; contains?: string | RegExp; absent?: boolean }
  | { matrix: string }
  | { waived: string }
  | { deviation: string }

interface Bullet {
  section: string
  claim: string
  evidence: Evidence[]
}

const CENSUS = 'lib/contract-census.test.ts'
const TABLE = 'lib/seat-transitions.test.ts'
const CURSOR = 'lib/events/server/seat-cursor.test.ts'
const EXITS = 'lib/events/server/seat-exits.test.ts'
const BREADTH = 'lib/events/server/emit-breadth.test.ts'
const BLOCKING = 'lib/events/server/gate-blocking.test.ts'
const REVEAL = 'lib/events/server/reveal-done.test.ts'
const REPLAY = 'lib/events/server/replay.test.ts'
const MODEL = 'lib/events/server/seat-model.test.ts'
const MIGRATE = 'lib/events/server/seat-migrate.test.ts'
const AUDITOR = 'lib/events/server/seat-auditor.test.ts'
const DEBUG = 'lib/debug-rooms.test.ts'
const VIEW = 'lib/seat-view.test.ts'
const CLOCK = 'lib/server-clock.test.ts'
const SNAPSHOT = 'lib/events/client/snapshot-revision.test.ts'
const GATE_SHELL = 'lib/use-gate-challenge.test.ts'

const BULLETS: Bullet[] = [
  // Server rules
  {
    section: 'Server rules',
    claim:
      '1. One transition function: advanceSeat is the only cursor writer, validates against the table, arms the follow-up',
    evidence: [
      {
        test: CENSUS,
        name: 'only the transition table, the legacy migration and the lobby seat assign a cursor',
      },
      { test: CENSUS, name: 'only server code moves a seat' },
      { test: TABLE, name: 'refuses every pair the table does not list' },
      { test: CURSOR, name: 'an illegal move is refused whole' },
      { test: CENSUS, name: 'only the cursor module arms a seat' },
    ],
  },
  {
    section: 'Server rules',
    claim:
      '2. Timers capture seq only; walkSeq / resultBeatUntil / resolving / cap tokens / turn-tile checks are gone',
    evidence: [
      { file: 'lib/events/server/seat-cursor.ts', contains: 'live.cursor.seq !== seq' },
      { test: BLOCKING, name: 'kills a timer armed for an older seq the moment the seat moves on' },
      { test: CENSUS, name: 'walkSeq' },
      { test: CENSUS, name: 'resultBeatUntil' },
      { test: CENSUS, name: 'a seat has no phase and no resolving latch' },
    ],
  },
  {
    section: 'Server rules',
    claim: '3. Submits echo seq and subject; a mismatch is a clean reject (resync)',
    evidence: [
      { test: CENSUS, name: 'every seat event echoes the cursor it answers' },
      { test: CENSUS, name: 'the %s handler refuses any other subject' },
      {
        test: CURSOR,
        name: 'a stale answer echoing a spent gate is dropped with a resync, never judged',
      },
      { test: BREADTH, name: 'a stale answer moves nothing but the resync' },
      { test: CENSUS, name: 'no seat event carries a gateTile, turn or roundIndex echo' },
    ],
  },
  {
    section: 'Server rules',
    claim:
      "4. Never save what you don't send: holds are data, the next question is written when the hold ends",
    evidence: [
      {
        test: CURSOR,
        name: 'the gauntlet holds the answered question through its verdict, then deals the next',
      },
      { test: BREADTH, name: 'the next round is dealt, saved and revealed in one emit' },
      { file: 'lib/events/server-side.ts', contains: 'seat-unsent' },
      { test: CENSUS, name: 'pendingRoundStart' },
    ],
  },
  {
    section: 'Server rules',
    claim:
      '5. Rearm is uniform: one timer per seat from its cursor; rearm* seat functions and join heals collapse',
    evidence: [
      {
        test: EXITS,
        name: 'arms exactly one timer for every step with a timer exit, and none otherwise',
      },
      { test: CURSOR, name: 'a restart that forgets every timer resumes from the cursor alone' },
      { test: CENSUS, name: 'rearmSeatExits' },
      { test: CENSUS, name: 'strandedSubmitter' },
      { test: MODEL, name: 'restart' },
    ],
  },
  // Client rules
  {
    section: 'Client rules',
    claim: '1. The view is a pure function of (cursor, serverNow); components key on subject',
    evidence: [
      { test: VIEW, name: 'subject' },
      { file: 'components/view/dispatch.ts', contains: 'resolveSeatView' },
      { test: GATE_SHELL, name: 'latches the head gate at mount; the next gate is a fresh mount' },
    ],
  },
  {
    section: 'Client rules',
    claim:
      '2. No inference: verdicts render from cursor.verdict for the current subject; a local grade only previews the same subject',
    evidence: [
      { test: VIEW, name: 'seatVerdictOn' },
      { test: VIEW, name: 'previewOn' },
      { test: GATE_SHELL, name: 'reads the verdict and its hold off the cursor' },
      { test: CENSUS, name: 'finalBeats' },
      { test: CENSUS, name: 'latestBeatFor' },
    ],
  },
  {
    section: 'Client rules',
    claim:
      '3. No beat-ending timers: useServerNow renders holds and countdowns; armBeatFallback, wire graces and park timers deleted',
    evidence: [
      { test: CENSUS, name: 'no timer submits, emits or advances anything' },
      { test: CENSUS, name: 'client deadlines read the server clock, never the local one' },
      { test: CENSUS, name: 'no view arithmetic on a deadline against the local clock' },
      { test: CLOCK, name: 'stays within half the tightest round trip under asymmetric jitter' },
      { test: GATE_SHELL, name: 'arms no local timer for the beat' },
      { test: CENSUS, name: 'armBeatFallback' },
      { test: CENSUS, name: '_WIRE_GRACE_MS' },
      { test: CENSUS, name: 'CHALLENGE_SWAP_VERIFY_MS' },
    ],
  },
  {
    section: 'Client rules',
    claim:
      '4. No optimistic writes to server-owned fields; buttons latch locally and the next seq swaps the view',
    evidence: [
      {
        test: CENSUS,
        name: 'only the transition table, the legacy migration and the lobby seat assign a cursor',
      },
      {
        test: 'lib/events/server/round-advance.test.ts',
        name: 'lets no view send the group submit outside submitOnce',
      },
    ],
  },
  {
    section: 'Client rules',
    claim:
      '5. Ordering: snapshots apply only on a rising rev; a seat patch never moves cursor.seq backwards',
    evidence: [
      { test: SNAPSHOT, name: 'drops a strictly older snapshot of the same game' },
      { test: SNAPSHOT, name: 'drops a slice that would move the seat’s cursor backwards' },
      { test: CURSOR, name: 'keeps every client in step with the server after every emit' },
    ],
  },
  // Verification
  {
    section: 'Verification',
    claim:
      '1. Transition table as data, asserted by advanceSeat, exhaustiveness + property tests replacing the escapability matrix',
    evidence: [
      { file: 'lib/seat-transitions.ts', contains: 'SEAT_TRANSITIONS' },
      { test: TABLE, name: 'reaches every step from the lobby' },
      { test: TABLE, name: 'lets every non-terminal step reach victory' },
      { test: TABLE, name: 'gives every step a server-owned exit, and terminal steps none' },
      { test: MODEL, name: 'fc.' },
      { file: 'lib/events/server/round-advance.test.ts', contains: /escapab/i, absent: true },
    ],
  },
  {
    section: 'Verification',
    claim:
      '2. Append-only seat journal: one structured log line per advanceSeat, plus a per-game Redis ring',
    evidence: [
      { file: 'lib/events/server/seat-journal.ts', contains: "logSeatLine('seat-journal'" },
      { file: 'lib/events/server/seat-journal.ts', contains: 'journalKey' },
      { test: DEBUG, name: 'journal' },
    ],
  },
  {
    section: 'Verification',
    claim: '3. Client render acks (seat-rendered) + a read-only auditor logging stale-render',
    evidence: [
      { file: 'lib/use-seat-render-ack.ts', contains: "event: 'seat-rendered'" },
      { file: 'lib/events/server/seat-auditor.ts', contains: "logSeatLine('seat-audit'" },
      { test: AUDITOR, name: 'stale' },
      {
        deviation:
          'Acks live per viewer in a `${gameId}:renders` side key, not on a seat field — a seat field would bump rev and ride every snapshot on each ack, and the booth’s acks must never touch the racer.',
      },
    ],
  },
  {
    section: 'Verification',
    claim:
      '4. Shared invariants run in unit tests, emit-breadth, the playtest and the production auditor',
    evidence: [
      { file: 'lib/seat-invariants.ts', contains: 'export const seatInvariantViolations' },
      { file: 'lib/events/server/seat-auditor.ts', contains: 'seatInvariantViolations' },
      { file: 'lib/debug-rooms.ts', contains: 'seatInvariantViolations' },
      { file: 'e2e/playtest.spec.ts', contains: 'room.violations' },
      { file: MODEL, contains: 'seatInvariantViolations' },
      { file: REPLAY.replace('.test', ''), contains: 'seatInvariantViolations' },
    ],
  },
  {
    section: 'Verification',
    claim:
      '5. Deterministic replay of recorded events, timer fires and draws through the real handlers',
    evidence: [
      {
        test: REPLAY,
        name: 'plays a recorded game back through the real handlers, transition for transition',
      },
      { file: 'lib/events/server/draws.ts', contains: 'recordedDraw' },
      { file: 'scripts/capture-replay.ts' },
    ],
  },
  {
    section: 'Verification',
    claim:
      '6. /debug/rooms and /debug/rooms/:id, token-gated: cursors with age, rendered seq, armed timer, journal tail',
    evidence: [
      { file: 'server/routes/debug/rooms.get.ts' },
      { file: 'server/routes/debug/rooms/[id].get.ts' },
      { file: 'server/routes/debug/rooms/[id]/export.get.ts' },
      { test: DEBUG, name: 'debugAccess' },
      { test: DEBUG, name: 'describeRoom' },
    ],
  },
  {
    section: 'Verification',
    claim: '7. The playtest is a spec checker; a CI playtest job runs on PRs labelled `contract`',
    evidence: [
      { file: 'e2e/playtest.spec.ts', contains: 'render-lag' },
      {
        file: 'e2e/playtest.spec.ts',
        contains: /phase-lag|stale-verdict|park-stuck|residue/,
        absent: true,
      },
      {
        file: '.github/workflows/playtest.yml',
        contains: "contains(github.event.pull_request.labels.*.name, 'contract')",
      },
      { file: '.github/workflows/playtest.yml', contains: "FORCE_FINAL_CHALLENGE: '1'" },
      {
        waived:
          'Nightly run against the preview — dropped by Isaac; the job runs on labelled PRs and workflow_dispatch.',
      },
    ],
  },
  // Migration phases
  {
    section: 'Migration',
    claim: '0. Instrument first: journal, seat-rendered, auditor, debug endpoint',
    evidence: [
      { file: 'lib/events/server/seat-journal.ts' },
      { file: 'lib/events/server/seat-auditor.ts' },
      { file: 'server/routes/debug/rooms.get.ts' },
      {
        deviation:
          'Landed in one PR with the cursor rather than against the legacy model first; no legacy-phase baseline journals exist, so replay fixtures are captured from the new model.',
      },
    ],
  },
  {
    section: 'Migration',
    claim: '1. Shadow cursor',
    evidence: [
      {
        deviation:
          'No shadow period: one big PR replaced the model outright (Isaac: "no hybrid, full migration"). In-flight games migrate on load instead.',
      },
      { test: MIGRATE, name: 'stamps an all-settled table the moment it is loaded' },
    ],
  },
  {
    section: 'Migration',
    claim:
      '2. Gates and gauntlet on the cursor: armBeatFallback, finalBeats, resultBeatUntil, gateTile/turn echoes, clearFinalResultBeat deleted',
    evidence: [
      { test: CENSUS, name: 'armBeatFallback' },
      { test: CENSUS, name: 'finalBeats' },
      { test: CENSUS, name: 'resultBeatUntil' },
      { test: CENSUS, name: 'no seat event carries a gateTile, turn or roundIndex echo' },
      { test: CENSUS, name: 'clearFinalResultBeat' },
    ],
  },
  {
    section: 'Migration',
    claim:
      '3. Walk, scorecard, round entry: dispatcher reads step; park timers, walk announce grace, pendingRoundStart gone',
    evidence: [
      { test: CENSUS, name: 'presentedView' },
      { test: CENSUS, name: 'pendingRoundStart' },
      { test: CENSUS, name: 'scheduleMovementPhase' },
      {
        test: CURSOR,
        name: 'answers, walks, lands, passes a gate, settles, and is revealed into the next round',
      },
    ],
  },
  {
    section: 'Migration',
    claim:
      '4. Group rounds: subject round:N, engines settle through advanceSeat, per-engine seat follow-ups fold into the cursor',
    evidence: [
      { test: CURSOR, name: 'a group answer for a spent round is never banked' },
      { test: BREADTH, name: 'a verdict hold, its end, and the settle sweeping an absentee' },
      { test: CENSUS, name: 'scheduleRevealFlip' },
      { test: CENSUS, name: 'armGroupScoresCaps' },
      { test: REVEAL, name: 'ends a browsable round reveal early onto the scorecard' },
    ],
  },
  {
    section: 'Migration',
    claim: '5. Legacy tokens and join heals deleted; CLAUDE.md single-source table updated',
    evidence: [
      { test: CENSUS, name: 'PlayerPhase' },
      { test: CENSUS, name: 'orphanedInChallenge' },
      { file: 'CLAUDE.md', contains: 'advanceSeat' },
      { file: 'CLAUDE.md', contains: 'useServerNow' },
      { file: 'CLAUDE.md', contains: 'seat-transitions' },
      { file: 'CLAUDE.md', contains: 'seat-journal' },
      {
        file: 'CLAUDE.md',
        contains: /scheduleMovementPhase|SETTLED_PHASES|walkIntro/,
        absent: true,
      },
    ],
  },
  // Acceptance
  {
    section: 'Acceptance',
    claim: 'advanceSeat is the only writer of seat step/cursor, enforced by a test',
    evidence: [
      {
        test: CENSUS,
        name: 'only the transition table, the legacy migration and the lobby seat assign a cursor',
      },
    ],
  },
  {
    section: 'Acceptance',
    claim:
      "Every server timer's staleness check is cursor.seq; walkSeq, resultBeatUntil, gateTile/turn echoes and beat turn-matching are gone",
    evidence: [
      { test: CENSUS, name: 'every timer has a named owner, and the counts are reviewed' },
      { test: CENSUS, name: "each engine's table wait names the token that kills it" },
      { test: CENSUS, name: 'walkSeq' },
      { test: CENSUS, name: 'latestBeatFor' },
    ],
  },
  {
    section: 'Acceptance',
    claim: 'No client setTimeout gates a phase, verdict or submit, enforced by a test',
    evidence: [
      { test: CENSUS, name: 'every client timer is reviewed and counted' },
      { test: CENSUS, name: 'no timer submits, emits or advances anything' },
    ],
  },
  {
    section: 'Acceptance',
    claim:
      'Transition table, journal, render acks, auditor, invariants and replay harness in place and used by tests, the playtest and production',
    evidence: [
      { file: 'server/middleware/socket.server.ts', contains: 'startSeatAuditor' },
      { file: 'server/middleware/socket.server.ts', contains: 'recordSeatRender' },
      { test: REPLAY, name: 'plays a recorded game back' },
      { test: AUDITOR, name: 'once' },
    ],
  },
  {
    section: 'Acceptance',
    claim: '/debug/rooms is live behind a token, and a CI playtest job runs on labelled PRs',
    evidence: [
      { test: DEBUG, name: 'debugAccess' },
      { file: 'nuxt.config.ts', contains: 'debugToken' },
      { file: '.github/workflows/playtest.yml', contains: 'workflow_dispatch' },
      { waived: 'Nightly — dropped by Isaac.' },
    ],
  },
  {
    section: 'Acceptance',
    claim:
      'Playtest matrix green with zero stale-render across ≥10 room-hours, including chaos + WebKit + forced gauntlet',
    evidence: [
      { matrix: 'room-hours ≥ 10' },
      { matrix: 'zero render-lag' },
      { matrix: 'zero invariant violations' },
      { matrix: 'zero seat-audit / seat-illegal / seat-unsent lines' },
      { matrix: 'every room played to victory or its full budget' },
    ],
  },
  // Open questions
  {
    section: 'Open questions',
    claim: 'Clock skew: explicit time-sync ping plus serverNow on every snapshot and ack',
    evidence: [
      { file: 'plugins/socket.client.ts', contains: 'syncClock' },
      { file: 'server/middleware/socket.server.ts', contains: "'time-sync'" },
      { test: CLOCK, name: 'trusts the tightest round trip in the window' },
    ],
  },
  {
    section: 'Open questions',
    claim: "Spectator booth: render acks per viewer, never in the racer's journal or audit",
    evidence: [
      { file: 'components/view/ViewSpectate.vue', contains: 'useSeatRenderAck' },
      {
        file: 'lib/seat-invariants.ts',
        contains: 'entry.viewer === seat.id && entry.seat === seat.id',
      },
      { file: 'e2e/playtest.spec.ts', contains: 'Booth' },
    ],
  },
  {
    section: 'Open questions',
    claim: 'Bots and autopilot act on the cursor (step / subject / seq) through the real handlers',
    evidence: [
      { file: 'lib/events/server/bot-brain.ts', contains: 'cursor.seq' },
      { file: 'lib/events/server/bot-brain.ts', contains: 'SERVER_SIDE_EVENT_HANDLERS' },
      { test: REPLAY, name: 'plays a recorded game back' },
    ],
  },
  {
    section: 'Open questions',
    claim: 'Payload: seat patches carry the full cursor',
    evidence: [
      {
        file: 'lib/events/client/seat-advanced.event.ts',
        contains: 'gameStore.game.players[playerId] = game.players[playerId]',
      },
    ],
  },
  {
    section: 'Open questions',
    claim: 'In-flight games across the deploy are migrated on load',
    evidence: [
      { file: 'lib/events/server/seat-cursor.ts', contains: 'migrateLegacySeats(game)' },
      { test: MIGRATE, name: 'idempotent' },
    ],
  },
]

const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : process.argv[index + 1]
}
const RUN = process.argv.includes('--run')
const MATRIX = arg('matrix') ?? 'test-results/playtest-matrix/report.json'

const read = (file: string) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined)
const matrix = (() => {
  const raw = read(MATRIX)
  return raw ? (JSON.parse(raw) as { checks: [string, boolean, unknown][] }) : undefined
})()

const suites = new Set(
  BULLETS.flatMap(bullet => bullet.evidence.flatMap(item => ('test' in item ? [item.test] : [])))
)
const failedSuites = new Set<string>()
if (RUN) {
  const run = spawnSync('bunx', ['vitest', 'run', ...suites, '--reporter=json'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  const json = run.stdout.slice(run.stdout.indexOf('{'))
  const results = JSON.parse(json) as { testResults: { name: string; status: string }[] }
  for (const result of results.testResults) {
    if (result.status !== 'passed') failedSuites.add(result.name.replace(`${process.cwd()}/`, ''))
  }
  for (const suite of suites) {
    if (!results.testResults.some(result => result.name.endsWith(suite))) failedSuites.add(suite)
  }
}

const check = (item: Evidence): { ok: boolean | 'waived' | 'deviation'; note: string } => {
  if ('waived' in item) return { ok: 'waived', note: item.waived }
  if ('deviation' in item) return { ok: 'deviation', note: item.deviation }
  if ('matrix' in item) {
    const line = matrix?.checks.find(([name]) => name === item.matrix)
    if (!line) return { ok: false, note: `matrix: no "${item.matrix}" in ${MATRIX}` }
    return { ok: line[1], note: `matrix: ${item.matrix} = ${String(line[2])}` }
  }
  if ('test' in item) {
    const source = read(item.test)
    if (!source) return { ok: false, note: `${item.test} missing` }
    if (!source.includes(item.name)) return { ok: false, note: `${item.test}: no "${item.name}"` }
    if (RUN && failedSuites.has(item.test)) return { ok: false, note: `${item.test} fails` }
    return { ok: true, note: `\`${item.test}\` › ${item.name}` }
  }
  const source = read(item.file)
  if (source === undefined) return { ok: false, note: `${item.file} missing` }
  if (item.contains === undefined) return { ok: true, note: `\`${item.file}\`` }
  const found =
    typeof item.contains === 'string' ? source.includes(item.contains) : item.contains.test(source)
  const ok = item.absent ? !found : found
  return {
    ok,
    note: `\`${item.file}\` ${item.absent ? 'has no' : 'has'} ${String(item.contains)}`,
  }
}

let failed = 0
const lines: string[] = ['## #174 completion audit', '']
let section = ''
for (const bullet of BULLETS) {
  if (bullet.section !== section) {
    section = bullet.section
    lines.push('', `### ${section}`, '')
  }
  const results = bullet.evidence.map(check)
  const proven = results.some(result => result.ok === true)
  const broken = results.some(result => result.ok === false)
  const done =
    !broken &&
    (proven || results.every(result => result.ok === 'waived' || result.ok === 'deviation'))
  if (!done) failed++
  lines.push(`- [${done ? 'x' : ' '}] ${bullet.claim}`)
  for (const result of results) {
    const mark =
      result.ok === true
        ? '✓'
        : result.ok === 'waived'
          ? 'waived:'
          : result.ok === 'deviation'
            ? 'deviation:'
            : '✗'
    lines.push(`  - ${mark} ${result.note}`)
  }
}
lines.push(
  '',
  failed ? `**${failed} bullet(s) without evidence.**` : '**Every bullet has evidence.**'
)
console.log(lines.join('\n'))
process.exit(failed ? 1 : 0)
