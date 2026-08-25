/**
 * Generates data/city-plans/<slug>.gen.ts — the Ground Plan round's tiles —
 * from OpenStreetMap via Overpass (ODbL-1.0).
 *
 * One file per cut under public/, fetched one at a time by the view. They are
 * static JSON rather than modules on purpose: as .gen.ts each tile was a module
 * Rollup had to parse, transform and hold in the bundle graph, and at 172 of
 * them the production build ran out of heap. Vite copies public/ verbatim, so
 * the build no longer pays for the roster at all.
 *
 * Also writes data/city-plans.gen.ts (the roster index, which does ship, and is
 * small) and a report naming every tile that failed the coverage floor.
 *
 *   bun run generate:city-plans                the whole roster
 *   bun run generate:city-plans --city london   one city's cuts
 *   bun run generate:city-plans --cached        re-encode, no network
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { jsonParseLiteral } from '../../lib/emit'
import { MINIMUM_STREET_DENSITY } from '../../lib/city-plan-geometry'
import { CITY_CUTS } from '../../data/city-cuts'
import { buildTile, type CityPlanTile } from './city-plan'
import { overpassQuery, tileQuery } from './overpass'
import type { GroundPlanCity } from '../../../types/challenges/group-modes.type'

type RosterEntry = GroundPlanCity

const OUTPUT_DIRECTORY = 'public/city-plans'
const INDEX_FILE = 'data/city-plans.gen.ts'
const REPORT_FILE = 'generators/data/city-plans-report.txt'

const only = process.argv.includes('--city')
  ? process.argv[process.argv.indexOf('--city') + 1]
  : undefined
const cacheOnly = process.argv.includes('--cached')

const slugFile = (slug: string) => `${OUTPUT_DIRECTORY}/${slug}.json`

/** The previous run's crossing counts, so a kept tile does not lose the number
 *  its reveal states out loud. */
const previousIndex: Record<string, { crossings: number }> = existsSync(INDEX_FILE)
  ? ((): Record<string, { crossings: number }> => {
      const match = readFileSync(INDEX_FILE, 'utf-8').match(
        /CITY_PLAN_INDEX: Record<string, CityPlanIndexEntry> = JSON\.parse\((".*?")\)/s
      )
      return match ? JSON.parse(JSON.parse(match[1])) : {}
    })()
  : {}

const writeTile = (slug: string, tile: CityPlanTile) => {
  // The measurements stay in the report and the index; the shipped tile is
  // paths only. No header comment — it is JSON, and the provenance lives in
  // the DATASETS claim rather than in every one of 172 files.
  const { crossings: _c, density: _d, vertices: _v, wet: _w, strandedStreets: _s, ...paths } = tile
  writeFileSync(slugFile(slug), JSON.stringify(paths))
}

const run = async () => {
  mkdirSync(OUTPUT_DIRECTORY, { recursive: true })
  const report: string[] = []
  const index: Record<string, { crossings: number }> = {}
  const roster: RosterEntry[] = []
  const wanted = new Set<string>()
  let extractedAt = new Date().toISOString().slice(0, 10)

  // The whole roster is always walked, whatever `--city` narrows: the index and
  // the shipped roster are rebuilt from scratch each run, so visiting only one
  // city would drop every other city's tiles out of the game while leaving
  // their files on disk.
  for (const entry of CITY_CUTS) {
    const dealt: { slug: string; signature: boolean }[] = []
    for (const cut of entry.cuts) {
      wanted.add(cut.slug)
      // Outside the named city, keep whatever is already encoded rather than
      // re-fetching it.
      const scoped = !only || cut.slug.startsWith(only)

      // The tile is cheap to rebuild from the query cache, and rebuilding is
      // what keeps the index's crossing count true — carrying a stale entry
      // forward would have the reveal state a bridge count nobody measured.
      const response = await overpassQuery(tileQuery(cut.box), {
        label: cut.slug,
        cacheOnly: cacheOnly || !scoped,
      })
      if (!response) {
        if (existsSync(slugFile(cut.slug))) {
          // Already encoded and not in scope: keep it in the game.
          dealt.push({ slug: cut.slug, signature: cut.signature })
          index[cut.slug] = { crossings: previousIndex[cut.slug]?.crossings ?? 0 }
          report.push(`${cut.slug.padEnd(28)} kept`)
          continue
        }
        report.push(`${cut.slug.padEnd(28)} NOT FETCHED — no tile written`)
        continue
      }
      if (response.osm3s?.timestamp_osm_base) {
        extractedAt = response.osm3s.timestamp_osm_base.slice(0, 10)
      }

      const tile = buildTile(response, cut.box)

      // A tile nobody mapped is not a question about a city — fail it out of
      // the pool rather than dealing an unfairly empty frame.
      if (tile.density < MINIMUM_STREET_DENSITY) {
        report.push(
          `${cut.slug.padEnd(28)} THIN — ${tile.density.toFixed(1)} km/km² below the ${MINIMUM_STREET_DENSITY} floor`
        )
        continue
      }

      writeTile(cut.slug, tile)
      index[cut.slug] = { crossings: tile.crossings }
      dealt.push({ slug: cut.slug, signature: cut.signature })
      report.push(
        `${cut.slug.padEnd(28)} ${String(tile.vertices).padStart(6)} verts  ` +
          `${tile.density.toFixed(1).padStart(5)} km/km²  ` +
          `${String(tile.crossings).padStart(2)} crossings  ` +
          `${(tile.wet * 100).toFixed(0).padStart(3)}% wet  ` +
          `strand ${(tile.strandedStreets * 100).toFixed(1)}%  ` +
          `${cut.signature ? 'signature' : 'generic'}`
      )
      if (tile.strandedStreets > 0.02) {
        report.push(`${''.padEnd(28)} ^ STREETS IN WATER — the water geometry is wrong`)
      }
    }

    // A city with no surviving cut cannot be dealt, so it stays off the roster
    // the runtime reads rather than shipping as an entry that deals nothing.
    if (!dealt.length) {
      report.push(`${entry.city.padEnd(28)} DROPPED — no usable cut`)
      continue
    }
    roster.push({
      country: entry.country,
      city: entry.city,
      ...(entry.aliases ? { aliases: entry.aliases } : {}),
      cuts: dealt,
      ...(entry.lesson ? { lesson: entry.lesson } : {}),
      ...(entry.image ? { image: entry.image } : {}),
    })
  }

  // A tile whose cut left the roster would keep its DATASETS claim and fail
  // the attribution suite, so a full run sweeps the directory.
  {
    for (const file of readdirSync(OUTPUT_DIRECTORY)) {
      const slug = file.replace(/\.json$/, '')
      if (file.endsWith('.json') && !wanted.has(slug)) {
        unlinkSync(`${OUTPUT_DIRECTORY}/${file}`)
        report.push(`${slug.padEnd(28)} REMOVED — no longer in the roster`)
      }
    }
  }

  writeFileSync(
    INDEX_FILE,
    `// Generated by generators/vendors/osm/create-city-plans.ts — do not edit by hand.
// Source: OpenStreetMap via Overpass (ODbL-1.0), extracted ${extractedAt}.
// The roster index: which tiles exist and what each one's reveal states. The
// tiles themselves are lazy-imported one at a time — see lib/ground-plan.ts.
import type { CityPlanIndexEntry, GroundPlanCity } from '~~/types/challenges/group-modes.type'

export const CITY_PLAN_INDEX: Record<string, CityPlanIndexEntry> = ${jsonParseLiteral(index)}

export const GROUND_PLAN_CITIES: GroundPlanCity[] = ${jsonParseLiteral(roster)}
`
  )

  // The tiles are static assets under public/ now, not generated modules, so
  // there is nothing per-file for the coverage scan to catch: the DATASETS
  // entry claims the directory once and attribution.test.ts checks it holds
  // tiles. Only the index is a .gen.ts and it is claimed by name.
  writeFileSync(REPORT_FILE, `${report.join('\n')}\n`)
  console.info(report.join('\n'))
  console.info(`\nWrote ${Object.keys(index).length} tiles → ${OUTPUT_DIRECTORY}`)
}

await run()
