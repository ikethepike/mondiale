import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'fs'
import { createInterface } from 'readline'
import { type Amount, type ISOCountryCode, isValidISOCode } from '../../../types/geography.types'
import {
  COMMODITY_EXPORTER_EXCLUSIONS,
  COMMODITY_HS_CODES,
} from '../../data/commodity-hs-codes'
import { parseCSV } from '../../lib/csv'

/**
 * Top world exporters per Made In commodity, from CEPII's BACI database —
 * reconciled bilateral trade flows at the HS6 product level. This is the
 * commodity→countries view the Factbook can't give: its "Exports - commodities"
 * field only says what ranks in a country's OWN top exports, which is why
 * Brazil (the world's largest tobacco exporter) never appeared under tobacco.
 *
 * Release-pinned and run BY HAND — the ~300MB zip and annual cadence keep it
 * off the weekly DataUpdate cron (see .github/workflows/data-update.yml).
 * To bump: update BACI_RELEASE/DATA_YEAR, delete .cache, rerun.
 *
 *   bun run generate:commodity-exporters
 */
const BACI_RELEASE = '202601'
const HS_REVISION = 'HS22'
/** Latest full year in the pinned release. */
const DATA_YEAR = 2024

const CACHE_DIR = 'generators/vendors/cepii/.cache'
const ZIP_URL = `https://www.cepii.fr/DATA_DOWNLOAD/baci/data/BACI_${HS_REVISION}_V${BACI_RELEASE}.zip`
const TRADE_FILE = `${CACHE_DIR}/BACI_${HS_REVISION}_Y${DATA_YEAR}_V${BACI_RELEASE}.csv`
const COUNTRY_FILE = `${CACHE_DIR}/country_codes_V${BACI_RELEASE}.csv`
const OUTPUT_FILE = 'data/commodity-exporters.gen.ts'

/** Validator accepts every stored row; the reveal shows the head of the list. */
const TOP_EXPORTERS_STORED = 15

export interface CommodityExporterRow {
  isoCode: ISOCountryCode
  value: Amount<'$'>
  /** Share of world exports of this commodity, 0–1. */
  share: number
}

export type CommodityExportersMapping = {
  [commodity: string]:
    | {
        hsCodes: string[]
        world: Amount<'$'>
        top: CommodityExporterRow[]
      }
    | undefined
}

const download = async () => {
  if (existsSync(TRADE_FILE) && existsSync(COUNTRY_FILE)) return
  console.info(`Downloading BACI ${HS_REVISION} V${BACI_RELEASE} (~300MB) — hand-run only`)
  mkdirSync(CACHE_DIR, { recursive: true })
  const unzip = Bun.spawnSync(['curl', '-fsO', ZIP_URL], { cwd: CACHE_DIR })
  if (unzip.exitCode !== 0) throw new Error(`BACI download failed: ${unzip.stderr}`)
  const extract = Bun.spawnSync(['unzip', '-o', '-q', `BACI_${HS_REVISION}_V${BACI_RELEASE}.zip`], {
    cwd: CACHE_DIR,
  })
  if (extract.exitCode !== 0) throw new Error(`BACI unzip failed: ${extract.stderr}`)
}

/** BACI numeric exporter code → ISO2, from the release's own country table. */
const loadCountryLookup = async (): Promise<Map<string, ISOCountryCode>> => {
  const rows = parseCSV(await Bun.file(COUNTRY_FILE).text())
  const header = rows.shift()
  const codeIndex = header!.indexOf('country_code')
  const isoIndex = header!.indexOf('country_iso2')
  const lookup = new Map<string, ISOCountryCode>()
  for (const row of rows) {
    const iso2 = row[isoIndex]
    if (isValidISOCode(iso2)) lookup.set(row[codeIndex], iso2)
  }
  // UN trade convention files Taiwan under "Other Asia, nes" with no ISO code —
  // without this the world's top integrated-circuits exporter vanishes.
  lookup.set('490', 'TW')
  // CEPII's csv writer read Namibia's "NA" as NaN and wrote an empty field —
  // without this the world's #3 uranium exporter vanishes.
  lookup.set('516', 'NA')
  return lookup
}

/** HS prefix (2/4/6 digits) → commodity, split by prefix length for O(1) rows. */
const prefixLookups = (): Map<number, Map<string, string>> => {
  // The per-row loop matches every prefix length independently, so a code
  // claimed twice — or nested inside another commodity's code — would silently
  // double-count that trade into both commodities.
  const all = Object.entries(COMMODITY_HS_CODES).flatMap(([commodity, codes]) =>
    codes.map(code => ({ commodity, code }))
  )
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i]
      const b = all[j]
      if (a.code.startsWith(b.code) || b.code.startsWith(a.code)) {
        throw new Error(
          `HS overlap: "${a.commodity}" ${a.code} vs "${b.commodity}" ${b.code} — trade would double-count`
        )
      }
    }
  }
  const byLength = new Map<number, Map<string, string>>()
  for (const { commodity, code } of all) {
    const lookup = byLength.get(code.length) ?? new Map<string, string>()
    lookup.set(code, commodity)
    byLength.set(code.length, lookup)
  }
  return byLength
}

const createCommodityExporters = async () => {
  await download()
  const countryLookup = await loadCountryLookup()
  const prefixes = prefixLookups()

  // commodity → exporter code → summed value in $. World totals count every
  // exporter (incl. BACI's non-ISO entries like "Other Asia, nes") so shares
  // are shares of the real world trade, not of the mappable subset.
  const values = new Map<string, Map<string, number>>()
  const worldTotals = new Map<string, number>()

  const lines = createInterface({ input: createReadStream(TRADE_FILE), crlfDelay: Infinity })
  let rows = 0
  for await (const line of lines) {
    rows++
    if (rows === 1) continue
    const [, exporter, , product, value] = line.split(',')
    for (const [length, lookup] of prefixes) {
      const commodity = lookup.get(product.slice(0, length))
      if (!commodity) continue
      const dollars = Number(value) * 1000
      if (!Number.isFinite(dollars)) continue
      const byExporter = values.get(commodity) ?? new Map<string, number>()
      byExporter.set(exporter, (byExporter.get(exporter) ?? 0) + dollars)
      values.set(commodity, byExporter)
      worldTotals.set(commodity, (worldTotals.get(commodity) ?? 0) + dollars)
    }
  }
  console.info(`Read ${rows} trade rows for ${DATA_YEAR}`)

  const mapping: CommodityExportersMapping = {}
  const amount = (dollars: number): Amount<'$'> => ({
    amount: Math.round(dollars),
    unit: '$',
    year: DATA_YEAR,
    source: 'cepii-baci',
  })
  for (const [commodity, byExporter] of values) {
    const world = worldTotals.get(commodity)!
    const excluded = new Set(COMMODITY_EXPORTER_EXCLUSIONS[commodity] ?? [])
    mapping[commodity] = {
      hsCodes: COMMODITY_HS_CODES[commodity],
      world: amount(world),
      top: [...byExporter.entries()]
        .map(([code, dollars]) => ({ isoCode: countryLookup.get(code), dollars }))
        .filter((row): row is { isoCode: ISOCountryCode; dollars: number } => !!row.isoCode)
        .filter(row => !excluded.has(row.isoCode))
        .sort((a, b) => b.dollars - a.dollars)
        .slice(0, TOP_EXPORTERS_STORED)
        .map(({ isoCode, dollars }) => ({
          isoCode,
          value: amount(dollars),
          share: Number((dollars / world).toFixed(4)),
        })),
    }
  }

  const missing = Object.keys(COMMODITY_HS_CODES).filter(commodity => !mapping[commodity])
  if (missing.length) {
    throw new Error(`No trade rows matched: ${missing.join(', ')} — check COMMODITY_HS_CODES`)
  }

  // Review table — eyeball before committing: the head of each list should
  // read like the world's actual top exporters of the good.
  const billions = (dollars: number) => `$${(dollars / 1e9).toFixed(1)}B`
  for (const commodity of Object.keys(COMMODITY_HS_CODES).sort()) {
    const entry = mapping[commodity]!
    const head = entry.top
      .slice(0, 5)
      .map(row => `${row.isoCode} ${billions(row.value.amount)}`)
      .join('  ')
    console.info(`${commodity.padEnd(30)} world ${billions(entry.world.amount).padEnd(9)} ${head}`)
  }

  writeFileSync(
    OUTPUT_FILE,
    `
      import type { CommodityExportersMapping } from '../generators/vendors/cepii/create-commodity-exporters'
      export const COMMODITY_EXPORTERS: CommodityExportersMapping = ${JSON.stringify(mapping)}
    `
  )
  console.info(`Wrote ${OUTPUT_FILE} (${Object.keys(mapping).length} commodities)`)
}

createCommodityExporters()
