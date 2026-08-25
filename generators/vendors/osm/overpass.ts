/**
 * Shared Overpass client for the OpenStreetMap generators — the city-plan tile
 * extractor (issue #165) and the rail-length sweep (issue #146).
 *
 * Overpass is a shared public instance with no API key and real capacity
 * limits, so this is built to be slow on purpose. Every response is cached to
 * disk by query hash, which makes a re-run free and an interrupted run
 * resumable: re-encoding a roster after a rendering change must never re-hit
 * the endpoint.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const ENDPOINT = 'https://overpass-api.de/api/interpreter'

const CACHE_DIR = `${import.meta.dirname}/.cache`

const USER_AGENT =
  'mondiale-game-generator/1.0 (https://github.com/ikethepike/mondiale; city plans, issue 165)'

/**
 * Minimum gap between requests. Measured: a 2km tile answers in 2-3s, but
 * three back-to-back queries earned a 504 and a 25s pause cleared it. The
 * endpoint is donated capacity — a roster sweep should take hours.
 */
const POLITE_PAUSE_MS = 12_000

/** A hung socket must not stall a several-hundred-tile run indefinitely. */
const REQUEST_TIMEOUT_MS = 240_000

const MAXIMUM_ATTEMPTS = 5

export const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export interface OverpassElement {
  type: 'node' | 'way' | 'relation'
  id: number
  tags?: Record<string, string>
  geometry?: { lat: number; lon: number }[]
  members?: { type: string; role: string; geometry?: { lat: number; lon: number }[] }[]
}

export interface OverpassResponse {
  elements: OverpassElement[]
  osm3s?: { timestamp_osm_base?: string }
}

const cachePath = (query: string): string =>
  `${CACHE_DIR}/${createHash('sha1').update(query).digest('hex')}.json`

let lastRequestAt = 0

/**
 * Run one Overpass QL query, from cache when it has been run before.
 *
 * Returns undefined rather than throwing after repeated failure: a roster sweep
 * should skip the city it could not fetch and report it, not die on tile 140.
 */
export const overpassQuery = async (
  query: string,
  { label = 'query' }: { label?: string } = {}
): Promise<OverpassResponse | undefined> => {
  const path = cachePath(query)
  if (existsSync(path)) {
    return JSON.parse(readFileSync(path, 'utf-8')) as OverpassResponse
  }

  for (let attempt = 1; attempt <= MAXIMUM_ATTEMPTS; attempt++) {
    const sinceLast = Date.now() - lastRequestAt
    if (sinceLast < POLITE_PAUSE_MS) await wait(POLITE_PAUSE_MS - sinceLast)
    lastRequestAt = Date.now()

    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }).catch(() => undefined)

    if (response?.ok) {
      const body = await response.text().catch(() => undefined)
      // A rate-limited Overpass answers 200 with an HTML error page rather than
      // a status code, so the parse is the real success test.
      const parsed = body ? (JSON.parse(body) as OverpassResponse) : undefined
      if (parsed?.elements) {
        mkdirSync(CACHE_DIR, { recursive: true })
        writeFileSync(path, body!)
        return parsed
      }
    }

    if (attempt === MAXIMUM_ATTEMPTS) {
      console.warn(`  ${label}: gave up after ${attempt} attempts (${response?.status ?? 'network'})`)
      return undefined
    }

    const retryAfter = Number(response?.headers.get('retry-after'))
    const backoff =
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : POLITE_PAUSE_MS * attempt * 2
    console.warn(`  ${label}: ${response?.status ?? 'network'}, waiting ${(backoff / 1000).toFixed(0)}s`)
    await wait(backoff)
  }

  return undefined
}

/** Highway classes that draw as the residential grain. */
export const FABRIC_HIGHWAYS = ['residential', 'unclassified', 'living_street', 'pedestrian'] as const

/** Highway classes that draw as the skeleton. */
export const ARTERIAL_HIGHWAYS = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'] as const

export const RAILWAYS = ['rail', 'subway', 'light_rail', 'tram'] as const

/**
 * Everything one tile needs, in a single query.
 *
 * `["service"!~"."]` on the railways excludes yards, sidings and depot spurs.
 * Without it a terminus throat is hundreds of parallel ways — Waterloo alone
 * swamped the whole frame and read as a scribble rather than a railway.
 */
export const tileQuery = ([south, west, north, east]: [number, number, number, number]): string => {
  const box = `${south},${west},${north},${east}`
  const highways = [...FABRIC_HIGHWAYS, ...ARTERIAL_HIGHWAYS].join('|')
  return `[out:json][timeout:180];
(
  way["highway"~"^(${highways})$"](${box});
  way["railway"~"^(${RAILWAYS.join('|')})$"]["service"!~"."](${box});
  way["natural"="water"](${box});
  way["waterway"~"^(river|canal)$"](${box});
  way["natural"="coastline"](${box});
  relation["natural"="water"](${box});
  way["leisure"="park"](${box});
  way["landuse"~"^(cemetery|forest|grass|meadow)$"](${box});
);
out geom;`
}

/** Street length in km inside a box — the coverage floor's probe, cheap enough
 *  to run over many candidate cuts before committing to a full tile pull. */
export const densityQuery = ([south, west, north, east]: [number, number, number, number]): string => {
  const box = `${south},${west},${north},${east}`
  const highways = [...FABRIC_HIGHWAYS, ...ARTERIAL_HIGHWAYS].join('|')
  return `[out:json][timeout:120];
way["highway"~"^(${highways})$"](${box});
make stat km=sum(length())/1000;
out;`
}
