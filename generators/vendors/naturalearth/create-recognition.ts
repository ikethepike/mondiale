/**
 * Generates data/recognition.gen.ts and data/recognition-flags.gen.ts — the
 * contested territories behind the "Ghost States" and "No Man's Land" round
 * modes — from Natural Earth 1:10m `admin_0_disputed_areas` (public domain).
 *
 * The layer's real value is its 33 point-of-view columns. For every contested
 * feature NE records, per government, both *how* that government classifies it
 * (FCLASS_<POV>) and *whose territory they say it is* (ADM0_A3_<POV>). That is
 * a recognition matrix: not "is this disputed", but who says what.
 *
 *   Kosovo        18 governments call it a country; Russia and India call it a
 *                 province of Serbia; 11 say nothing is there.
 *   Somaliland    exactly one recognizer — Taiwan, itself contested.
 *   N. Cyprus     exactly one — Turkey. The US alone refuses "unrecognized".
 *   Transnistria  zero. Not even Russia, which recognizes Abkhazia and
 *                 South Ossetia but drew the line here.
 *
 * Geometry is projected with the SAME fitted Robinson as the country map
 * (MAP_PROJECTION from data/map.gen.ts), so outlines overlay the world exactly.
 *
 * Two outputs, deliberately split: the metadata+geometry file is imported by
 * the round dealer, while the flags file (36 KB of Somaliland calligraphy
 * alone) is imported only by the View that renders one. Mirrors the
 * flags-wide.gen lazy split in lib/country.ts.
 *
 *   bun run generate:recognition   (after generate:map — projection dependency)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { geoRobinson } from 'd3-geo-projection'
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'
import { COUNTRIES } from '../../../data/countries.gen'
import { ISOCountryCodes } from '../../../data/iso-codes.gen'
import { MAP_PROJECTION } from '../../../data/map.gen'
import { RECOGNITION_CORRECTIONS } from '../../../data/static/recognition-corrections'
import {
  CAST_B_ARMISTICE_EXCLUSIONS,
  CAST_B_TONAL_EXCLUSIONS,
  EXCLUDED_TERRITORIES,
  SELF_ADMIN_PREDICATE,
  TERRA_NULLIUS,
} from '../../../data/static/recognition-filter'
import type { ISOCountryCode } from '../../../types/geography.types'

const NE_TAG = 'v5.1.2'
const CACHE_DIR = `${import.meta.dirname}/.cache`
const LAYER = 'ne_10m_admin_0_disputed_areas'
const FLAGS_DIR = 'data/static/flags'
const OUT_FILE = 'data/recognition.gen.ts'
const FLAGS_OUT_FILE = 'data/recognition-flags.gen.ts'

/** Keep projected points at least this far apart (viewBox units). */
const DECIMATE_UNITS = 0.35
/**
 * Below this projected footprint a territory cannot be drawn as an outline —
 * Rockall spans 0.0037° of longitude, a few hundred metres, which is a small
 * fraction of one viewBox unit. It gets a marker instead, exactly as
 * MICRO_COUNTRIES does in create-map.ts.
 */
const MICRO_FOOTPRINT = 1.5

type Point = [number, number]

export type RecognitionAssignment = ISOCountryCode | 'SELF' | 'NONE'
export type RecognitionClass =
  'country' | 'admin1' | 'unrecognized' | 'breakaway' | 'dependency' | 'lease' | 'claim-area'

/** Cast A plays as "Ghost States", Cast B as "No Man's Land". */
export type RecognitionCast = 'ghost-state' | 'no-mans-land'

export interface RecognitionTerritory {
  id: string
  name: string
  cast: RecognitionCast
  /** Projected outline in map space, same coordinates as MAP_PATHS. */
  d: string
  bounds: [number, number, number, number]
  /**
   * Set when the territory is too small to draw — a rock, a reef, a sandbank.
   * Rockall spans ~300m. The View renders a marker here, not the outline.
   */
  micro?: { x: number; y: number }
  /** Verbatim NE status line: "Self admin.; Claimed by Georgia". Reveal copy. */
  status: string
  /** Ghost States: the state that claims it — the answer to "where is this?". */
  parent?: ISOCountryCode
  /** No Man's Land: administrator ∪ claimants. Empty only for Bir Tawil. */
  claimants: ISOCountryCode[]
  administrator?: ISOCountryCode
  /**
   * POV ISO-2 → what that government says. The whole point of this file.
   * `assignment` is cartographic (whose shape they draw it inside);
   * `recognizes` is diplomatic. Only the latter means statehood.
   */
  povs: Record<
    string,
    { assignment: RecognitionAssignment; fclass: RecognitionClass; recognizes: boolean }
  >
  /** NE estimate. Rough, and absent where NE stores its -99 sentinel. */
  pop?: number
  gdpMd?: number
}

const projection = geoRobinson().scale(MAP_PROJECTION.scale).translate(MAP_PROJECTION.translate)
const project = ([lon, lat]: Point): Point => projection([lon, lat]) as Point
const playable = new Set<string>(ISOCountryCodes as unknown as string[])
const isPlayable = (code: string | null): code is ISOCountryCode =>
  code !== null && playable.has(code)

const fetchLayer = async (file: string): Promise<FeatureCollection> => {
  const cachePath = `${CACHE_DIR}/${file}.geojson`
  if (!existsSync(cachePath)) {
    const url = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NE_TAG}/geojson/${file}.geojson`
    console.info(`Downloading ${url}`)
    const response = await fetch(url)
    if (!response.ok)
      throw new Error(`Natural Earth download failed: ${response.status} for ${file}`)
    mkdirSync(CACHE_DIR, { recursive: true })
    writeFileSync(cachePath, await response.text())
  }
  return JSON.parse(readFileSync(cachePath, 'utf-8'))
}

const roundTo = (value: number, decimals = 2) => Number(value.toFixed(decimals))

const decimate = (points: Point[], minGap = DECIMATE_UNITS): Point[] => {
  const output: Point[] = []
  for (const point of points) {
    const previous = output[output.length - 1]
    if (previous && Math.hypot(point[0] - previous[0], point[1] - previous[1]) < minGap) continue
    output.push([roundTo(point[0]), roundTo(point[1])])
  }
  return output
}

const boundsOf = (rings: Point[][]): [number, number, number, number] => {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const ring of rings)
    for (const [x, y] of ring) {
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  return [roundTo(minX), roundTo(minY), roundTo(maxX - minX), roundTo(maxY - minY)]
}

const pathFromRings = (rings: Point[][]): string =>
  rings
    .filter(ring => ring.length >= 3)
    .map(ring => `M ${ring.map(([x, y]) => `${x},${y}`).join(' L ')} z`)
    .join(' ')

/** Projected but not decimated — needed to measure a feature before deciding
 *  whether decimation would erase it. */
const rawRingsOf = (geometry: Polygon | MultiPolygon): Point[][] => {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  const rings: Point[][] = []
  for (const polygon of polygons)
    for (const ring of polygon) {
      const projected = ring.map(point => {
        const [x, y] = project(point as Point)
        return [roundTo(x), roundTo(y)] as Point
      })
      if (projected.length >= 3) rings.push(projected)
    }
  return rings
}

const ringsOf = (geometry: Polygon | MultiPolygon): Point[][] => {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  const rings: Point[][] = []
  for (const polygon of polygons)
    for (const ring of polygon) {
      const projected = decimate(ring.map(point => project(point as Point)))
      if (projected.length >= 3) rings.push(projected)
    }
  return rings
}

/** NE names carry a stray BOM on two features; NOTE_BRK casing is inconsistent. */
const clean = (value: unknown) =>
  String(value ?? '')
    .replace(/^\uFEFF/, '')
    .trim()

const nameOf = (feature: Feature) =>
  clean((feature.properties as Record<string, unknown>).BRK_NAME) ||
  clean((feature.properties as Record<string, unknown>).NAME)

/** Stable, filename-safe id used as the challenge payload and the flag key. */
const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[.']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const NAME_TO_ISO: Record<string, string> = {}
for (const iso of playable) {
  const english = COUNTRIES[iso as ISOCountryCode]?.name?.english
  if (english) NAME_TO_ISO[english.toLowerCase()] = iso
}

/** NE writes country names in prose, abbreviated and inconsistently. */
const ALIASES: Record<string, string> = {
  'u.s.a': 'US',
  'united states': 'US',
  'u.k': 'GB',
  'united kingdom': 'GB',
  azer: 'AZ',
  uae: 'AE',
  philippines: 'PH',
  seychelles: 'SC',
  tokelau: 'TK',
  'south korea': 'KR',
  'north korea': 'KP',
  russia: 'RU',
  china: 'CN',
  vietnam: 'VN',
  taiwan: 'TW',
  'marshall islands': 'MH',
  'equatorial guinea': 'GQ',
  'south sudan': 'SS',
  'saudi arabia': 'SA',
}

/** Trailing period and a leading "the" must go before the alias lookup. */
const normalizeName = (raw: string) =>
  raw
    .trim()
    .replace(/\.$/, '')
    .replace(/^the\s+/i, '')
    .toLowerCase()

const resolveCountry = (raw: string): string | null => {
  const key = normalizeName(raw)
  if (!key) return null
  return ALIASES[key] ?? NAME_TO_ISO[key] ?? null
}

/**
 * NOTE_BRK is prose with a small grammar:
 *   "Self admin.; Claimed by Georgia"
 *   "Admin. by Denmark; Claimed by Canada"
 *   "Admin. by New Caledonia for France; Claimed by Vanuatu"
 *   "Leased to U.S.A by U.K.; Claimed by Mauritius and Seychelles"
 *   "Between Egypt and Sudan"                     ← Bir Tawil: no claim clause
 */
const parseNote = (note: string) => {
  // Stop at " for " so "New Caledonia for France" yields New Caledonia, which
  // is not playable, and the feature is dropped rather than mis-attributed.
  const adminRaw = note.match(/Admin(?:\.|istered)?\s+[Bb]y\s+([^;]+?)(?:\s+for\s+|;|$)/i)?.[1]
  const claimClause = note.match(/Claimed by ([^;]+)/i)
  const tokens = claimClause
    ? claimClause[1]
        .split(/,\s*and\s+|,\s*|\s+and\s+/i)
        .map(part => part.trim())
        .filter(Boolean)
    : []
  return {
    administrator: adminRaw ? resolveCountry(adminRaw) : null,
    hasClaimClause: Boolean(claimClause),
    tokens,
    resolved: tokens.map(resolveCountry),
  }
}

/**
 * NE splits a point of view across two columns, and they mean DIFFERENT things.
 * Conflating them is the central trap of this dataset.
 *
 *   ADM0_A3_<POV>  whose shape that government's cartographers draw it inside.
 *                  Always populated. This is a MAPPING choice, not a
 *                  diplomatic one — the US and UK draw Abkhazia as its own
 *                  outline (the de-facto line) while emphatically not
 *                  recognizing it. Call this "drawn apart".
 *
 *   FCLASS_<POV>   how that government CLASSIFIES it. Sparse by design: it
 *                  records only deviations, so a null means "no special
 *                  opinion", i.e. follows the norm. `Admin-0 country` is the
 *                  one value that asserts statehood. Call this "recognition".
 *
 * Recognition is therefore the strict test, and it is the only one that gets
 * every frozen conflict right:
 *
 *   FCLASS_<POV> === 'Admin-0 country'
 *     → Somaliland: TW alone.  N. Cyprus: TR alone.
 *     → Abkhazia and South Ossetia: RU alone, of the 33 POVs. (In the wider
 *       world four more UN members recognize them — Nicaragua 2008, Venezuela
 *       2009, Nauru 2009, Syria 2018 — but none is a POV column here.)
 *     → Transnistria and Artsakh: nobody. Moscow keeps ~1,500 troops in
 *       Transnistria guarding the Cobasna depot and still draws it inside
 *       Moldova; it never extended the August 2008 Abkhazia / South Ossetia
 *       recognition here. Control and recognition are not the same thing, and
 *       this dataset only ever measures the second.
 *
 * The loose ownership test (ADM0_A3_<POV> !== the parent) is NOT recognition.
 * It reports three recognizers for Abkhazia (RU, plus a cartographic US and
 * GB) and twenty-two for W. Sahara, where drawing the territory separately is
 * the mainstream position rather than a recognition of the SADR.
 *
 * Both are worth keeping: `assignment` records who they draw it inside,
 * `fclass` records what they call it. Only `fclass` may be read as recognition.
 *
 * Two mirror traps, for the next reader:
 *   - Matching ADM0_A3_<POV> against the feature's own ADM0_A3 fails, because
 *     NE sets that to the PARENT for some breakaways (Transnistria → MDA,
 *     Artsakh → AZE) and to the entity for others (Taiwan → TWN). Transnistria
 *     would read 31/33 recognizers.
 *   - BRK_A3 is a breakaway code (B36, B77) the POV columns never use, so
 *     matching on it reads 0/33 for everyone.
 *
 * The parent comes from NOTE_BRK's "Claimed by X" clause.
 */
const FCLASS_MAP: Record<string, RecognitionClass> = {
  'Admin-0 country': 'country',
  'Admin-1 region': 'admin1',
  'Admin-1 states provinces': 'admin1',
  Unrecognized: 'unrecognized',
  'Admin-0 breakaway and disputed': 'breakaway',
  'Admin-0 claim area': 'claim-area',
  'Admin-0 dependency': 'dependency',
  'Admin-0 lease': 'lease',
}

/** The NE alpha-3s that appear as owners in ADM0_A3_<POV> for our territories. */
const A3_TO_ISO2: Record<string, string> = {
  SRB: 'RS',
  CHN: 'CN',
  TWN: 'TW',
  SOM: 'SO',
  CYP: 'CY',
  MAR: 'MA',
  IND: 'IN',
  PAK: 'PK',
  ISR: 'IL',
  PSX: 'PS',
  GEO: 'GE',
  MDA: 'MD',
  AZE: 'AZ',
  UKR: 'UA',
  RUS: 'RU',
  ARG: 'AR',
  CHL: 'CL',
  EGY: 'EG',
  SDN: 'SD',
  DNK: 'DK',
  CAN: 'CA',
  GBR: 'GB',
  USA: 'US',
  CUB: 'CU',
  BRA: 'BR',
  URY: 'UY',
  KAZ: 'KZ',
  SYR: 'SY',
  IRQ: 'IQ',
  BIH: 'BA',
  KEN: 'KE',
  SSD: 'SS',
  NPL: 'NP',
  SUR: 'SR',
  GUY: 'GY',
  VEN: 'VE',
  FRA: 'FR',
  ESP: 'ES',
  JPN: 'JP',
  KOR: 'KR',
  VNM: 'VN',
}

const ISO2_TO_A3: Record<string, string> = Object.fromEntries(
  Object.entries(A3_TO_ISO2).map(([a3, iso2]) => [iso2, a3])
)

/** ISO and TLC are NE's own editorial columns, not governments. */
const povColumns = (properties: Record<string, unknown>) =>
  Object.keys(properties)
    .filter(key => key.startsWith('FCLASS_'))
    .map(key => key.slice('FCLASS_'.length))
    .filter(pov => pov !== 'ISO' && pov !== 'TLC')

/**
 * For one POV: whose shape do they draw it inside, how do they classify it,
 * and — the only diplomatically meaningful bit — do they recognize it?
 *
 *   assignment  'SELF'  drawn as its own outline, not folded into the parent
 *               ISO-2   drawn inside that country (usually the parent)
 *               'NONE'  drawn as nobody's (NE's -99), or a private refusal
 *                       code — the US gives the Siachen Glacier `B45` rather
 *                       than pick between India and Pakistan
 *
 *   recognizes  true only when FCLASS_<POV> explicitly says `Admin-0 country`.
 *               A drawn-apart outline is a cartographic act, not recognition:
 *               the US and UK draw Abkhazia separately and do not recognize it.
 */
const povEntry = (
  properties: Record<string, unknown>,
  pov: string,
  parentA3: string | null
): { assignment: RecognitionAssignment; fclass: RecognitionClass; recognizes: boolean } | null => {
  const owner = properties[`ADM0_A3_${pov}`]
  if (owner === null || owner === undefined) return null
  const ownerCode = String(owner)

  let assignment: RecognitionAssignment
  if (ownerCode === '-99') {
    // Names nobody: NE's null island, or a private refusal code (the US gives
    // the Siachen Glacier `B45` rather than pick between India and Pakistan).
    assignment = 'NONE'
  } else if (parentA3 !== null && ownerCode === parentA3) {
    // Hands it to the state that claims it. Not a recognition.
    const iso2 = A3_TO_ISO2[ownerCode]
    assignment = isPlayable(iso2) ? (iso2 as ISOCountryCode) : 'NONE'
  } else {
    // Names the territory itself, or a third party in a multi-way dispute.
    assignment = 'SELF'
  }

  const rawClass = properties[`FCLASS_${pov}`]
  // Silence is not assent. A null FCLASS means this government registered no
  // special opinion, so it follows the norm — which for a contested territory
  // is that it is not a country. Inferring `'country'` from a drawn-apart
  // outline is exactly the error that gave Abkhazia phantom US and UK
  // recognizers: both draw the de-facto line and neither recognizes it.
  const fclass: RecognitionClass =
    rawClass === null || rawClass === undefined
      ? 'unrecognized'
      : (FCLASS_MAP[String(rawClass)] ?? 'unrecognized')

  return { assignment, fclass, recognizes: fclass === 'country' }
}

/**
 * NE abbreviates ("W. Sahara", "N. Cyprus"); the vendored flag files are named
 * for the place. Keep the filenames legible and map the slugs here.
 */
const FLAG_KEYS: Record<string, string> = {
  'w-sahara': 'western-sahara',
  'n-cyprus': 'northern-cyprus',
  // Taiwan is a playable country, so its flag already ships under its ISO code.
  taiwan: 'tw',
}

const readFlag = (id: string): string | null => {
  const path = `${FLAGS_DIR}/${FLAG_KEYS[id] ?? id}.svg`
  if (!existsSync(path)) return null
  // The source files carry a provenance/licence comment header. Strip it and
  // any XML prolog so the emitted string's documentElement is the <svg> — the
  // View parses these with DOMParser and reads documentElement directly.
  return readFileSync(path, 'utf-8')
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim()
}

const main = async () => {
  const source = await fetchLayer(LAYER)
  const territories: Record<string, RecognitionTerritory> = {}
  const flags: Record<string, string> = {}
  const rejected: [string, string][] = []
  const seen = new Set<string>()

  for (const feature of source.features) {
    const properties = feature.properties as Record<string, unknown>
    const name = nameOf(feature)
    const note = clean(properties.NOTE_BRK)
    const rawPop = properties.POP_EST as number
    const rawGdp = properties.GDP_MD as number
    const pop = rawPop === -99 ? undefined : rawPop
    const gdpMd = rawGdp === -99 ? undefined : rawGdp

    const selfAdmin = SELF_ADMIN_PREDICATE.test(note)
    const uninhabited = pop === undefined || pop === 0

    let cast: RecognitionCast
    if (selfAdmin) {
      if (EXCLUDED_TERRITORIES.has(name)) {
        rejected.push([name, 'excluded: active invasion'])
        continue
      }
      cast = 'ghost-state'
    } else if (uninhabited) {
      if (CAST_B_TONAL_EXCLUSIONS.test(name) || CAST_B_ARMISTICE_EXCLUSIONS.test(name)) {
        rejected.push([name, 'excluded: live conflict / armistice line'])
        continue
      }
      cast = 'no-mans-land'
    } else {
      continue // inhabited but not self-administering: an administered dispute
    }

    if (seen.has(name)) {
      rejected.push([name, 'duplicate feature'])
      continue
    }

    const parsed = parseNote(note)

    // A territory with no claim clause has no DATA, which is not the same as
    // having no claimants. Only Bir Tawil legitimately has an empty answer set,
    // and NE says so explicitly: "Between Egypt and Sudan".
    const terraNullius = TERRA_NULLIUS.test(name)
    if (!note) {
      rejected.push([name, 'no NOTE_BRK — data gap, not terra nullius'])
      continue
    }
    if (cast === 'no-mans-land' && !parsed.hasClaimClause && !terraNullius) {
      rejected.push([name, `no claim clause: "${note}"`])
      continue
    }

    // Resolvability gate: every party named must be a playable country, or we
    // cannot score a tap against it. Drops "Claimed by multiple" (Bird Island).
    if (parsed.resolved.some(code => !isPlayable(code))) {
      const bad = parsed.tokens.filter((_, index) => !isPlayable(parsed.resolved[index]))
      rejected.push([name, `unresolvable claimant: ${bad.join(', ')}`])
      continue
    }
    if (parsed.administrator && !isPlayable(parsed.administrator)) {
      rejected.push([name, `unresolvable administrator`])
      continue
    }

    const claimants = parsed.resolved.filter(isPlayable)
    let parent: ISOCountryCode | undefined
    if (cast === 'ghost-state') {
      // "Self admin.; Claimed by Georgia" — the claimant IS the parent state,
      // and the answer to "where on Earth is this?".
      parent = claimants[0]
      if (!parent) {
        rejected.push([name, 'ghost state with no resolvable parent'])
        continue
      }
    }

    const id = slugify(name)
    // Undecimated first: a 300m rock survives projection but not decimation.
    const rawRings = rawRingsOf(feature.geometry as Polygon | MultiPolygon)
    if (!rawRings.length) {
      rejected.push([name, 'no geometry at all'])
      continue
    }
    const rawBounds = boundsOf(rawRings)
    const footprint = Math.max(rawBounds[2], rawBounds[3])
    const micro = footprint < MICRO_FOOTPRINT
    // Decimation would erase a micro feature entirely; keep its raw ring.
    const rings = micro ? rawRings : ringsOf(feature.geometry as Polygon | MultiPolygon)
    if (!rings.length) {
      rejected.push([name, 'no usable geometry'])
      continue
    }

    /**
     * The parent is the state named in "Claimed by X". A POV that hands the
     * territory to anyone else — including to the territory itself — is
     * recognizing it. This is the only reading that gets all nine right;
     * see the note above FCLASS_MAP for the two traps it avoids.
     */
    const parentA3 = ISO2_TO_A3[claimants[0] ?? ''] ?? null

    const povs: RecognitionTerritory['povs'] = {}
    for (const pov of povColumns(properties)) {
      const entry = povEntry(properties, pov, parentA3)
      if (entry) povs[pov] = entry
    }

    // Corrections overlay: NE's political errors, fixed in one documented place.
    const correction = RECOGNITION_CORRECTIONS[String(properties.ADM0_A3)]
    let correctedPovs = povs
    if (correction) {
      for (const [pov, assignment] of Object.entries(correction.setPov ?? {})) {
        if (povs[pov]) povs[pov] = { ...povs[pov], assignment: assignment as RecognitionAssignment }
      }
      const dropped = new Set(correction.drop ?? [])
      if (dropped.size)
        correctedPovs = Object.fromEntries(
          Object.entries(povs).filter(([pov]) => !dropped.has(pov))
        )
    }

    seen.add(name)
    const bounds = boundsOf(rings)
    territories[id] = {
      id,
      name,
      cast,
      d: pathFromRings(rings),
      bounds,
      ...(micro
        ? {
            micro: { x: roundTo(bounds[0] + bounds[2] / 2), y: roundTo(bounds[1] + bounds[3] / 2) },
          }
        : {}),
      status: note,
      ...(parent ? { parent } : {}),
      // Answer set for No Man's Land: whoever holds it, plus whoever wants it.
      claimants:
        cast === 'no-mans-land'
          ? ([
              ...new Set([parsed.administrator, ...claimants].filter(isPlayable)),
            ] as ISOCountryCode[])
          : claimants,
      ...(isPlayable(parsed.administrator) ? { administrator: parsed.administrator } : {}),
      povs: correctedPovs,
      ...(pop !== undefined ? { pop } : {}),
      ...(gdpMd !== undefined ? { gdpMd } : {}),
    }

    const flag = readFlag(id)
    if (flag) flags[id] = flag
  }

  // ---- assertions: these ARE the design. A vendor bump must not break them. ----
  const ghostStates = Object.values(territories).filter(t => t.cast === 'ghost-state')
  const noMansLand = Object.values(territories).filter(t => t.cast === 'no-mans-land')
  const assert = (condition: boolean, message: string) => {
    if (!condition) throw new Error(`recognition invariant broken: ${message}`)
  }

  assert(ghostStates.length === 8, `expected 8 ghost states, got ${ghostStates.length}`)
  for (const banned of ['Gaza', 'East Jerusalem', 'West Bank', 'Mount Scopus', 'Shebaa Farms'])
    assert(
      !Object.values(territories).some(t => t.name.includes(banned)),
      `${banned} leaked into play`
    )

  const birTawil = Object.values(territories).find(t => TERRA_NULLIUS.test(t.name))
  assert(Boolean(birTawil), "Bir Tawil missing — the defining No Man's Land case")
  assert(birTawil!.claimants.length === 0, 'Bir Tawil should have no claimants')

  const byId = (id: string) => {
    const found = territories[id]
    assert(Boolean(found), `${id} missing from output`)
    return found
  }
  /**
   * These facts ARE the design. If a vendor bump changes the politics, fail
   * loudly rather than quietly shipping a different game.
   *
   * `recognizes` reads the diplomatic column only. `drawnApart` reads the
   * cartographic one. Conflating them is the bug this dataset invites: it
   * hands Abkhazia phantom US and UK recognizers, because both draw the
   * de-facto line without recognizing anything.
   */
  const recognizers = (t: RecognitionTerritory) =>
    Object.entries(t.povs)
      .filter(([, p]) => p.recognizes)
      .map(([pov]) => pov)
  const drawnApart = (t: RecognitionTerritory) =>
    Object.entries(t.povs)
      .filter(([, p]) => p.assignment === 'SELF')
      .map(([pov]) => pov)

  // The four frozen conflicts, each with the recognizer the world actually has.
  assert(recognizers(byId('somaliland')).join() === 'TW', 'Somaliland: Taiwan alone')
  assert(recognizers(byId('n-cyprus')).join() === 'TR', 'N. Cyprus: Turkey alone')
  assert(recognizers(byId('abkhazia')).join() === 'RU', 'Abkhazia: Russia alone (of these 33 POVs)')
  assert(recognizers(byId('south-ossetia')).join() === 'RU', 'S. Ossetia: Russia alone')

  // Moscow recognized Abkhazia and South Ossetia in August 2008 and never
  // extended it to Transnistria, where it still keeps troops. Artsakh likewise.
  assert(recognizers(byId('transnistria')).length === 0, 'Transnistria: nobody, not even Russia')
  assert(recognizers(byId('artsakh')).length === 0, 'Artsakh: nobody; Russia only hedges')
  assert(
    byId('artsakh').povs.RU?.fclass === 'breakaway',
    'Artsakh: Russia hedges, never recognizes'
  )

  // The cartographic column tells a different story, and must stay separable.
  assert(drawnApart(byId('abkhazia')).includes('US'), 'Abkhazia: the US draws it apart…')
  assert(!byId('abkhazia').povs.US!.recognizes, '…but the US does not recognize it')
  assert(drawnApart(byId('taiwan')).length === 23, 'Taiwan: 23 POVs draw it apart')
  assert(
    recognizers(byId('taiwan')).length <= 1,
    'Taiwan: NE records almost no explicit recognition'
  )

  // The US alone refuses to call N. Cyprus "unrecognized".
  assert(byId('n-cyprus').povs.US?.fclass === 'breakaway', 'N. Cyprus: the US alone hedges')

  for (const t of ghostStates) {
    const flag = flags[t.id]
    assert(Boolean(flag), `${t.id}: ghost state without a flag`)
    assert(Boolean(t.parent), `${t.id}: ghost state without a parent`)
    // The View parses these with DOMParser and reads documentElement, so the
    // first node must be the <svg> — no XML prolog, no licence comment.
    assert(flag.trimStart().startsWith('<svg'), `${t.id}: flag does not start with <svg`)
    assert(/viewBox="/.test(flag), `${t.id}: flag has no viewBox — it cannot scale`)
    assert(!/<script|onload=|data:image/i.test(flag), `${t.id}: flag carries script or raster`)
  }
  for (const t of Object.values(territories)) {
    assert(!/^\uFEFF/.test(t.name), `${t.name}: leading BOM`)
    assert(t.pop !== -99 && t.gdpMd !== -99, `${t.name}: -99 sentinel leaked`)
  }

  // ---- emit ----
  const sorted = Object.fromEntries(
    Object.entries(territories).sort(([a], [b]) => a.localeCompare(b))
  )
  const output = `// Generated by generators/vendors/naturalearth/create-recognition.ts — do not edit by hand.
// Source: Natural Earth 1:10m admin_0_disputed_areas (${NE_TAG}, public domain),
// projected with the map's fitted Robinson (see data/map.gen.ts).
// POV matrix corrected by data/static/recognition-corrections.ts.
import type { ISOCountryCode } from '~~/types/geography.types'

export type RecognitionAssignment = ISOCountryCode | 'SELF' | 'NONE'
export type RecognitionClass =
  | 'country' | 'admin1' | 'unrecognized' | 'breakaway' | 'dependency' | 'lease' | 'claim-area'
export type RecognitionCast = 'ghost-state' | 'no-mans-land'

export interface RecognitionTerritory {
  id: string
  name: string
  cast: RecognitionCast
  /** Projected outline in map space, same coordinates as MAP_PATHS. */
  d: string
  bounds: [number, number, number, number]
  /** Set when too small to draw (Rockall spans ~300m): render a marker here. */
  micro?: { x: number; y: number }
  /** Verbatim NE status line: "Self admin.; Claimed by Georgia". */
  status: string
  /** Ghost States: the state that claims it. */
  parent?: ISOCountryCode
  /** No Man's Land: administrator ∪ claimants. Empty only for Bir Tawil. */
  claimants: ISOCountryCode[]
  administrator?: ISOCountryCode
  /**
   * POV ISO-2 → what that government says.
   *
   * assignment is cartographic: whose shape they draw it inside.
   * recognizes is diplomatic: only this one means statehood. The US and UK
   * draw Abkhazia as its own outline and recognize no such country.
   */
  povs: Record<
    string,
    { assignment: RecognitionAssignment; fclass: RecognitionClass; recognizes: boolean }
  >
  pop?: number
  gdpMd?: number
}

export const RECOGNITION_TERRITORIES: Record<string, RecognitionTerritory> = ${JSON.stringify(sorted)}
`
  writeFileSync(OUT_FILE, output)

  const flagsOutput = `// Generated by generators/vendors/naturalearth/create-recognition.ts — do not edit by hand.
// Flags of de facto states, vendored from Wikimedia Commons (all public domain;
// see the comment header in each data/static/flags/<id>.svg).
//
// Split from recognition.gen.ts on purpose: only a View that renders a flag
// should pay for these bytes. Somaliland alone is 36 KB of calligraphy.

export const RECOGNITION_FLAGS: Record<string, string> = ${JSON.stringify(flags)}
`
  writeFileSync(FLAGS_OUT_FILE, flagsOutput)

  // ---- report ----
  console.info(`Ghost states (${ghostStates.length}): ${ghostStates.map(t => t.name).join(', ')}`)
  console.info(`No man's lands (${noMansLand.length}): ${noMansLand.map(t => t.name).join(', ')}`)
  console.info(`\nRejected (${rejected.length}):`)
  for (const [name, why] of rejected) console.info(`  ${name.padEnd(34)} ${why}`)

  console.info('\nRecognition spot-check (recognized ≠ drawn apart):')
  for (const t of ghostStates) {
    const yes = recognizers(t)
    const apart = drawnApart(t)
    const total = Object.keys(t.povs).length
    console.info(
      `  ${t.name.padEnd(16)} recognized ${String(yes.length).padStart(2)}/${total}` +
        `${yes.length && yes.length <= 3 ? ` (${yes.join(',')})` : ''}`.padEnd(10) +
        `  drawn apart ${String(apart.length).padStart(2)}/${total}`
    )
  }
  const bt = birTawil!
  console.info(`  ${bt.name.padEnd(16)} claimants=[${bt.claimants.join(',')}] "${bt.status}"`)

  const bytes = Buffer.byteLength(output)
  const flagBytes = Buffer.byteLength(flagsOutput)
  console.info(
    `\nOutput: ${(bytes / 1024).toFixed(0)} KB raw / ${(Bun.gzipSync(Buffer.from(output)).byteLength / 1024).toFixed(0)} KB gzip → ${OUT_FILE}`
  )
  console.info(
    `        ${(flagBytes / 1024).toFixed(0)} KB raw / ${(Bun.gzipSync(Buffer.from(flagsOutput)).byteLength / 1024).toFixed(0)} KB gzip → ${FLAGS_OUT_FILE}`
  )
}

await main()
