/**
 * Capture a room as a replay fixture: its `/debug/rooms/:id/export` bundle,
 * written where `replay.test.ts` globs for fixtures, so a production incident
 * becomes a regression test that replays it transition for transition.
 *
 *   PLAYTEST_DEBUG_TOKEN=… bun run scripts/capture-replay.ts https://pr-180-mondiale.fly.dev beat-nose-month
 *   bun run scripts/capture-replay.ts http://127.0.0.1:3110 <room> --from latest
 */
import fs from 'node:fs'
import path from 'node:path'

const [baseUrl, room] = process.argv.slice(2).filter(value => !value.startsWith('--'))
const fromIndex = process.argv.indexOf('--from')
const from = fromIndex === -1 ? 'earliest' : process.argv[fromIndex + 1]
const token = process.env.PLAYTEST_DEBUG_TOKEN ?? process.env.NUXT_DEBUG_TOKEN

if (!baseUrl || !room || !token) {
  console.error(
    'usage: PLAYTEST_DEBUG_TOKEN=… bun run scripts/capture-replay.ts <baseUrl> <room> [--from earliest|latest]'
  )
  process.exit(1)
}

const response = await fetch(
  `${baseUrl.replace(/\/$/, '')}/debug/rooms/${encodeURIComponent(room)}/export?from=${from}`,
  { headers: { authorization: `Bearer ${token}` } }
)
if (!response.ok) {
  console.error(`export failed: ${response.status} ${await response.text()}`)
  process.exit(1)
}
const bundle = (await response.json()) as {
  checkpoint?: unknown
  journal: unknown[]
  events: unknown[]
}
if (!bundle.checkpoint) {
  console.error(`${room} has no checkpoint in its events ring — nothing to replay from`)
  process.exit(1)
}
const target = path.resolve('lib/events/server/replays', `${room}.json`)
fs.mkdirSync(path.dirname(target), { recursive: true })
fs.writeFileSync(target, JSON.stringify(bundle, null, 2) + '\n')
console.log(
  `${target}: ${bundle.journal.length} transitions, ${bundle.events.length} recorded inputs`
)
