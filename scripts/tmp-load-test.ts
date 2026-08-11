/**
 * Real-world load/crash harness for the socket server. Self-contained on
 * purpose: standalone scripts cannot ride the app's `~~/` alias chains, so the
 * few event shapes it needs are declared locally.
 *
 *   bun run scripts/tmp-load-test.ts --mode crash --url http://127.0.0.1:3101 --pid 12345
 *   bun run scripts/tmp-load-test.ts --mode soak  --url http://127.0.0.1:3100 --pid 12345 \
 *     --rooms 10 --players 4 --minutes 12 --out /path/to/scratchpad
 *   bun run scripts/tmp-load-test.ts --mode http  --url http://127.0.0.1:3100
 *
 * Modes:
 * - crash: bursts of abrupt client resets (mid-handshake and mid-game) that
 *   raise ECONNRESET server-side, probing PID + /health after each burst.
 *   Exits non-zero the moment the server dies — run it against unfixed code
 *   to reproduce the dev-server crash, against fixed code to prove survival.
 * - soak: N rooms x M players of headless socket.io clients playing (badly):
 *   join/create, start-game, guess/cheer relays, an answer per round, abrupt
 *   disconnect+reconnect churn. Samples server RSS to CSV and reports ack
 *   round-trip percentiles. Boot the server with FORCE_ROUND_TYPE=ranking so
 *   every round accepts the ranking answer shape.
 *
 *   Without that env the natural mix deals turn-based kinds (atlas,
 *   border-chain, timeline, unique-or-bust) whose answers ride their OWN
 *   events, and this client's blanket `submit-group-challenge-answers` is
 *   correctly refused by `gradeGroupAnswer`'s named guard — expect a run of
 *   "No scoring arm for round kind: …" throws answered with an `error` ack.
 *   That is the harness being blunt, not the server misbehaving: it is still
 *   a useful shape to run, because it exercises the handler-throw path under
 *   load (the process must stay flat through it).
 * - http: light-concurrency latency on /health, / and a room page.
 *
 * Target discipline: never point this at port 3000 (the live dev server).
 */
import { connect, type Socket as NetSocket } from 'node:net'
import { execFile } from 'node:child_process'
import { appendFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { io, type Socket } from 'socket.io-client'

interface ClientEventTarget {
  gameId: string
  playerId: string
}
type ClientEventAck = { ok: true } | { ok: false; reason: string }

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const mode = arg('mode') ?? 'crash'
const baseUrl = arg('url') ?? 'http://127.0.0.1:3100'
const serverPid = arg('pid') ? Number(arg('pid')) : undefined
const roomCount = Number(arg('rooms') ?? 10)
const playersPerRoom = Number(arg('players') ?? 4)
const minutes = Number(arg('minutes') ?? 12)
const outDir = arg('out') ?? join(tmpdir(), 'mondiale-load-test')

if (new URL(baseUrl).port === '3000') {
  console.error('Refusing to target port 3000 — that is the live dev server.')
  process.exit(2)
}
mkdirSync(outDir, { recursive: true })

const { hostname, port } = new URL(baseUrl)
const runId = `perf-${Date.now().toString(36)}`
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const pidAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** RSS of the pid AND its descendants — `nuxt dev` runs the heavy Vite/Nitro
 *  work in child processes, so the root pid alone under-reports wildly. */
const readRss = (pid: number): Promise<number | undefined> =>
  new Promise(resolve => {
    execFile('ps', ['ax', '-o', 'pid=,ppid=,rss='], (error, stdout) => {
      if (error) return resolve(undefined)
      const rows = stdout
        .trim()
        .split('\n')
        .map(line => line.trim().split(/\s+/).map(Number))
      const children = new Map<number, number[]>()
      for (const [child, parent] of rows) {
        children.set(parent, [...(children.get(parent) ?? []), child])
      }
      const family = new Set<number>()
      const queue = [pid]
      while (queue.length) {
        const next = queue.pop() as number
        if (family.has(next)) continue
        family.add(next)
        queue.push(...(children.get(next) ?? []))
      }
      const kb = rows.filter(([p]) => family.has(p)).reduce((sum, row) => sum + row[2], 0)
      resolve(kb ? Math.round(kb / 1024) : undefined)
    })
  })

/** A long-lived connection with real-client semantics (auto-reconnect): the
 *  dev server can restart IN PLACE on an escaped rejection (same pid, HTTP
 *  still answers), and a canary that cannot re-establish is what catches it.
 *  A momentary drop that heals is a dev-proxy blip, not a dead server. */
let canary: Socket | undefined

const canaryHealthy = async (): Promise<boolean> => {
  if (!canary) return true
  for (let attempt = 0; attempt < 16; attempt++) {
    if (canary.connected) return true
    await sleep(500)
  }
  return false
}

/** Alive = the process exists, the canary is still connected, and HTTP
 *  answers at all (any status — a dev server's odd replies still prove the
 *  process took the request). */
const probeServer = async (label: string): Promise<boolean> => {
  if (serverPid !== undefined && !pidAlive(serverPid)) {
    console.error(`✗ [${label}] server pid ${serverPid} is DEAD`)
    return false
  }
  if (!(await canaryHealthy())) {
    console.error(`✗ [${label}] canary cannot re-establish — the server restarted or died`)
    return false
  }
  try {
    const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(5000) })
    console.log(`✓ [${label}] pid alive, /health ${response.status}`)
    return true
  } catch (error) {
    console.error(`✗ [${label}] HTTP probe failed: ${(error as Error).message}`)
    return false
  }
}

const percentile = (sorted: number[], p: number): number =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0

const summarize = (label: string, samples: number[]) => {
  const sorted = [...samples].sort((a, b) => a - b)
  console.log(
    `${label}: n=${sorted.length} p50=${percentile(sorted, 50)}ms ` +
      `p95=${percentile(sorted, 95)}ms max=${sorted[sorted.length - 1] ?? 0}ms`
  )
}

// ---------------------------------------------------------------- clients

interface PlayerHandle {
  socket: Socket
  target: ClientEventTarget
  ackLatencies: number[]
}

const connectPlayer = (gameId: string, playerId: string, secret: string): PlayerHandle => {
  const socket = io(baseUrl, {
    transports: ['websocket'],
    auth: { playerId, secret, gameId },
    query: { gameId },
    reconnection: false,
    timeout: 10_000,
  })
  return { socket, target: { gameId, playerId }, ackLatencies: [] }
}

const emitWithAck = async (
  handle: PlayerHandle,
  eventData: Record<string, unknown>,
  timeoutMs = 8000
): Promise<ClientEventAck | undefined> => {
  const started = Date.now()
  try {
    const ack = (await handle.socket
      .timeout(timeoutMs)
      .emitWithAck(eventData.event as string, eventData, handle.target)) as ClientEventAck
    handle.ackLatencies.push(Date.now() - started)
    return ack
  } catch {
    return undefined
  }
}

const rawSocketOf = (socket: Socket): NetSocket | undefined => {
  const transport = (
    socket.io as unknown as { engine?: { transport?: { ws?: { _socket?: NetSocket } } } }
  ).engine?.transport
  return transport?.ws?._socket
}

const joinRoom = async (handle: PlayerHandle): Promise<boolean> => {
  const joined = new Promise<boolean>(resolve => {
    const timer = setTimeout(() => resolve(false), 8000)
    handle.socket.on('player-joined', () => {
      clearTimeout(timer)
      resolve(true)
    })
  })
  handle.socket.emit('join', { event: 'join', variant: 'world' }, handle.target)
  return joined
}

// ---------------------------------------------------------------- crash mode

/** A client that vanishes with a TCP RST at a nasty moment. `phase` picks the
 *  moment: raw connect, half-written upgrade request, or full headers then a
 *  beat of silence (mid websocket handshake). */
const rstDuringHandshake = (phase: 0 | 1 | 2): Promise<void> =>
  new Promise(resolve => {
    const socket = connect(Number(port), hostname)
    const done = () => {
      socket.resetAndDestroy()
      resolve()
    }
    socket.on('error', () => resolve())
    socket.on('connect', () => {
      if (phase === 0) return done()
      const path = `/socket.io/?EIO=4&transport=websocket&gameId=${runId}-rst`
      const head =
        `GET ${path} HTTP/1.1\r\nHost: ${hostname}:${port}\r\n` +
        `Connection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\n` +
        `Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n`
      if (phase === 1) {
        socket.write(head.slice(0, 60))
        setTimeout(done, 20)
        return
      }
      socket.write(`${head}\r\n`)
      setTimeout(done, 120)
    })
  })

const rstMidGame = async (index: number): Promise<void> => {
  const handle = connectPlayer(`${runId}-game-${index % 4}`, crypto.randomUUID(), 'perf-secret')
  const connected = new Promise<boolean>(resolve => {
    const timer = setTimeout(() => resolve(false), 6000)
    handle.socket.on('connect', () => {
      clearTimeout(timer)
      resolve(true)
    })
  })
  if (!(await connected)) {
    handle.socket.disconnect()
    return
  }
  await joinRoom(handle)
  const raw = rawSocketOf(handle.socket)
  if (raw) raw.resetAndDestroy()
  else handle.socket.disconnect()
}

const crashMode = async (): Promise<number> => {
  console.log(`crash mode against ${baseUrl} (pid ${serverPid ?? 'unknown'})`)
  canary = io(baseUrl, { transports: ['websocket'], reconnection: true, timeout: 10_000 })
  const canaryUp = new Promise<boolean>(resolve => {
    const timer = setTimeout(() => resolve(false), 10_000)
    canary?.on('connect', () => {
      clearTimeout(timer)
      resolve(true)
    })
  })
  if (!(await canaryUp)) {
    console.error('✗ canary socket never connected')
    return 1
  }
  if (!(await probeServer('pre'))) return 1

  for (let round = 0; round < 5; round++) {
    await Promise.all(
      Array.from({ length: 10 }, (_, i) => rstDuringHandshake((i % 3) as 0 | 1 | 2))
    )
    await sleep(300)
    if (!(await probeServer(`handshake-burst-${round + 1}`))) return 1
  }

  for (let round = 0; round < 4; round++) {
    await Promise.all(Array.from({ length: 5 }, (_, i) => rstMidGame(round * 5 + i)))
    await sleep(500)
    if (!(await probeServer(`midgame-burst-${round + 1}`))) return 1
  }

  await sleep(1500)
  if (!(await probeServer('final'))) return 1
  canary?.disconnect()
  console.log('crash mode PASSED — server survived 50 handshake + 20 mid-game resets')
  return 0
}

// ---------------------------------------------------------------- soak mode

const RANKING_GUESS: string[] = ['FR', 'DE', 'ES', 'IT', 'PT', 'NL', 'BE', 'SE']

const runRoom = (roomIndex: number, stopAt: number, ackLatencies: number[]): Promise<void>[] => {
  const gameId = `${runId}-soak-${roomIndex}`
  const players = Array.from({ length: playersPerRoom }, (_, i) => ({
    playerId: crypto.randomUUID(),
    secret: crypto.randomUUID(),
    isHost: i === 0,
  }))

  return players.map(async ({ playerId, secret, isHost }, seatIndex) => {
    // Stagger joins so the host's create lands first.
    await sleep(seatIndex * 400)
    let handle = connectPlayer(gameId, playerId, secret)
    let roundsSeen = 0

    const wire = (h: PlayerHandle) => {
      const answerRound = (payload: { game?: { rounds?: unknown[] } }) => {
        const roundIndex = (payload.game?.rounds?.length ?? 1) - 1
        roundsSeen++
        // Answer after a human-ish think, wrong answers welcome — the full
        // grade/settle path runs either way.
        setTimeout(
          () =>
            emitWithAck(h, {
              event: 'submit-group-challenge-answers',
              ranking: RANKING_GUESS.slice(0, 3 + (seatIndex % 3)),
              roundIndex,
            }),
          3000 + Math.random() * 5000
        )
      }
      // Round 1 rides the start-game payload — 'new-round' only fires later.
      h.socket.on('game-started', answerRound)
      h.socket.on('new-round', answerRound)
      h.socket.on('group-challenge-scored', () => {
        setTimeout(() => emitWithAck(h, { event: 'enter-movement-phase' }), 1500)
      })
    }

    wire(handle)
    await joinRoom(handle)
    await emitWithAck(handle, { event: 'set-name', name: `Perf ${roomIndex}.${seatIndex}` })
    if (isHost) {
      await sleep(playersPerRoom * 400 + 500)
      await emitWithAck(handle, { event: 'start-game' })
    }
    await sleep(1000)
    await emitWithAck(handle, { event: 'close-tutorial' })

    while (Date.now() < stopAt) {
      await sleep(2000 + Math.random() * 1000)
      if (!handle.socket.connected) {
        handle.ackLatencies.forEach(sample => ackLatencies.push(sample))
        handle = connectPlayer(gameId, playerId, secret)
        wire(handle)
        await joinRoom(handle)
        continue
      }
      handle.socket.emit(
        'player-guessing',
        { event: 'player-guessing', kind: 'presence' },
        {
          gameId,
          playerId,
        }
      )
      if (Math.random() < 0.2) {
        const other = players[Math.floor(Math.random() * players.length)]
        handle.socket.emit(
          'player-cheering',
          {
            event: 'player-cheering',
            targetPlayerId: other.playerId,
            emoji: '🔥',
          },
          { gameId, playerId }
        )
      }
      // Abrupt churn: roughly one RST per player every ~30s.
      if (Math.random() < 0.07) rawSocketOf(handle.socket)?.resetAndDestroy()
    }

    handle.ackLatencies.forEach(sample => ackLatencies.push(sample))
    handle.socket.disconnect()
    console.log(`room ${roomIndex} seat ${seatIndex}: ${roundsSeen} rounds seen`)
  })
}

const soakMode = async (): Promise<number> => {
  console.log(
    `soak mode: ${roomCount} rooms x ${playersPerRoom} players for ${minutes}min against ${baseUrl}`
  )
  if (!(await probeServer('pre'))) return 1
  const csvPath = join(outDir, `soak-rss-${runId}.csv`)
  appendFileSync(csvPath, 'elapsed_s,rss_mb\n')
  const started = Date.now()
  const stopAt = started + minutes * 60_000
  const rssSamples: { at: number; mb: number }[] = []

  const sampler = setInterval(async () => {
    if (serverPid === undefined) return
    const mb = await readRss(serverPid)
    if (mb === undefined) return
    const at = Math.round((Date.now() - started) / 1000)
    rssSamples.push({ at, mb })
    appendFileSync(csvPath, `${at},${mb}\n`)
  }, 5000)

  const ackLatencies: number[] = []
  const seats = Array.from({ length: roomCount }, (_, i) => runRoom(i, stopAt, ackLatencies)).flat()
  await Promise.allSettled(seats)
  clearInterval(sampler)

  if (!(await probeServer('post-soak'))) return 1
  summarize('ack round-trip', ackLatencies)
  if (rssSamples.length >= 4) {
    const first = rssSamples[0]
    const midpoint = rssSamples[Math.floor(rssSamples.length / 2)]
    const last = rssSamples[rssSamples.length - 1]
    const slope = ((last.mb - midpoint.mb) / Math.max(1, last.at - midpoint.at)) * 60
    console.log(
      `rss: start=${first.mb}MB mid=${midpoint.mb}MB end=${last.mb}MB ` +
        `final-half slope=${slope.toFixed(1)}MB/min (csv: ${csvPath})`
    )
  }
  return 0
}

// ---------------------------------------------------------------- http mode

const httpMode = async (): Promise<number> => {
  const routes = ['/health', '/', `/room/${runId}-http`]
  for (const route of routes) {
    const latencies: number[] = []
    const worker = async () => {
      const stopAt = Date.now() + 30_000
      while (Date.now() < stopAt) {
        const started = Date.now()
        try {
          await fetch(`${baseUrl}${route}`, { signal: AbortSignal.timeout(10_000) })
          latencies.push(Date.now() - started)
        } catch {
          latencies.push(10_000)
        }
      }
    }
    await Promise.all(Array.from({ length: 10 }, worker))
    summarize(`GET ${route} (concurrency 10, 30s)`, latencies)
  }
  return 0
}

const main = async () => {
  const run = mode === 'crash' ? crashMode : mode === 'soak' ? soakMode : httpMode
  process.exit(await run())
}

void main()
