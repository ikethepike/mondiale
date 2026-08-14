/**
 * Advisory linter for the exports data — coverage, string hygiene and
 * plausibility checks the generators deliberately do NOT enforce with throws.
 * The Made In challenge matches commodity strings EXACTLY across countries
 * (the own-top-5 leg of its answer key) and against the release-pinned
 * commodity-exporters dataset, so stray variants ("packaged medicines" vs
 * "packaged medicine") and drift between the Factbook's commodity lists and the
 * pinned BACI data are gameplay bugs, not cosmetics.
 *
 * Note both sides are now FROZEN: the Factbook snapshot (data/factbook.gen.ts)
 * and the release-pinned BACI extract. So this no longer catches weekly drift —
 * it catches a mismatch introduced when either pin is deliberately bumped,
 * which is when it matters most. Findings are printed;
 * with --strict they also fail the run, which is how the DataUpdate workflow
 * gates its auto-commit.
 *
 * Run after regenerating countries:
 *   bun run generators/check-exports.ts [--strict]
 */
import { COMMODITY_EXPORTERS } from '../data/commodity-exporters.gen'
import { COUNTRIES } from '../data/countries.gen'
import {
  COMMODITY_EXPORTER_EXCLUSIONS,
  COMMODITY_HS_CODES,
  MIN_STORED_EXPORTERS,
} from './data/commodity-hs-codes'
import {
  MADE_COMMODITIES,
  MADE_MAX_POOL_FLOOR,
  MADE_MAX_POOL_SHARE,
  MADE_MIN_POOL,
  madeAcceptedCountries,
} from '../lib/challenges/final-challenge'
import { playableCountries } from '../lib/game-rules'
import { isValidISOCode } from '../types/geography.types'

const findings: string[] = []
const flag = (id: string, message: string) => findings.push(`${id}: ${message}`)

// Findings a curator has looked at and accepted (VA/KP/MC genuinely lack a
// Factbook exports entry; a few states' totals are genuinely old). --strict
// fails only on findings outside this baseline — a new finding is news, a
// known one is not. When an entry stops matching (source updated), drop it.
const ACCEPTED = new Set(['VA: no exports commodity list'])

const currentYear = new Date().getFullYear()
const countries = Object.values(COUNTRIES)
const withList = countries.filter(country => country.economics.exports)

// --- Coverage ------------------------------------------------------------------
// The Factbook genuinely lacks an Exports dollar entry for a few states (VA, KP,
// MC as of 2026). New gaps mean the source moved or the parser broke.
for (const country of countries) {
  if (!country.economics.exports) flag(country.isoCode, 'no exports commodity list')
}

// --- Item hygiene: parse residue from the Factbook free text -------------------
for (const country of withList) {
  const items = country.economics.exports!
  for (const item of items) {
    if (item !== item.trim() || /\s{2,}/.test(item)) flag(country.isoCode, `whitespace: "${item}"`)
    if (/[()]/.test(item)) flag(country.isoCode, `unstripped parenthetical: "${item}"`)
    if (/\d/.test(item)) flag(country.isoCode, `digits (year note?): "${item}"`)
    if (/\b(note|includes|based on|estimate)\b/i.test(item))
      flag(country.isoCode, `footnote residue: "${item}"`)
    if (/[;:.]$/.test(item)) flag(country.isoCode, `trailing punctuation: "${item}"`)
    if (/^and\s/i.test(item)) flag(country.isoCode, `"and" prefix: "${item}"`)
    if (item.length < 3 || item.length > 45)
      flag(country.isoCode, `odd length (${item.length}): "${item}"`)
  }
  const dupes = items.filter((item, index) => items.indexOf(item) !== index)
  if (dupes.length) flag(country.isoCode, `duplicate items: ${dupes.join(', ')}`)
}

// --- Cross-country string drift ------------------------------------------------
// Exact-match grouping means one country on a variant spelling silently drops
// out of its commodity's pool. New variants belong in COMMODITY_ALIASES in
// create-countries-file.ts. ("oil seeds" vs "seed oils" is NOT drift — those
// are different goods.)
const spellings = new Map<string, Map<string, number>>()
for (const country of withList) {
  for (const item of country.economics.exports!) {
    const key = item.toLowerCase()
    const variants = spellings.get(key) ?? new Map<string, number>()
    variants.set(item, (variants.get(item) ?? 0) + 1)
    spellings.set(key, variants)
  }
}
for (const [key, variants] of spellings) {
  if (variants.size > 1)
    flag(key, `case variants: ${[...variants.keys()].map(v => `"${v}"`).join(' vs ')}`)
}
for (const [key, variants] of spellings) {
  const plural = spellings.get(`${key}s`)
  if (!plural) continue
  const count = (byKey: Map<string, number>) => [...byKey.values()].reduce((a, b) => a + b, 0)
  flag(key, `singular/plural split: "${key}" (${count(variants)}) vs "${key}s" (${count(plural)})`)
}

// --- Made In answer key: the pinned BACI dataset vs the Factbook snapshot ----
// The dealer requires a commodity-exporters entry and the validator accepts
// the union (global top exporters ∪ own-top-5 lists) — both legs match commodity
// strings EXACTLY, so a Factbook rename or a stale curation silently shrinks
// the answer set. The BACI release is hand-pinned; only the countries side
// moves weekly.
const worldCounts = new Map<string, number>()
for (const country of withList) {
  for (const item of country.economics.exports!) {
    worldCounts.set(item, (worldCounts.get(item) ?? 0) + 1)
  }
}
for (const commodity of MADE_COMMODITIES) {
  if (!worldCounts.has(commodity))
    flag(commodity, 'curated in MADE_COMMODITIES but no country exports it — curation went stale')
  if (!COMMODITY_HS_CODES[commodity])
    flag(commodity, 'curated in MADE_COMMODITIES but missing from COMMODITY_HS_CODES')
}
for (const commodity of Object.keys(COMMODITY_HS_CODES)) {
  if (!MADE_COMMODITIES.has(commodity))
    flag(commodity, 'in COMMODITY_HS_CODES but not MADE_COMMODITIES — dead mapping')
}
for (const [commodity, exclusions] of Object.entries(COMMODITY_EXPORTER_EXCLUSIONS)) {
  if (!MADE_COMMODITIES.has(commodity))
    flag(commodity, 'in COMMODITY_EXPORTER_EXCLUSIONS but not MADE_COMMODITIES — dead exclusion')
  for (const isoCode of exclusions) {
    if (!isValidISOCode(isoCode))
      flag(commodity, `excluded exporter "${isoCode}" is not an ISO code`)
    if (COMMODITY_EXPORTERS[commodity]?.top.some(row => row.isoCode === isoCode))
      flag(commodity, `excluded exporter ${isoCode} still in the stored rows — regenerate`)
  }
}
for (const [commodity, entry] of Object.entries(COMMODITY_EXPORTERS)) {
  if (!entry) continue
  if (entry.top.length < MIN_STORED_EXPORTERS)
    flag(commodity, `only ${entry.top.length} stored exporters — regenerate or drop it`)
  const mapped = COMMODITY_HS_CODES[commodity]
  if (mapped && JSON.stringify(entry.hsCodes) !== JSON.stringify(mapped))
    flag(
      commodity,
      'stored hsCodes differ from COMMODITY_HS_CODES — mapping edited without regenerating'
    )
  const shareSum = entry.top.reduce((sum, row) => sum + row.share, 0)
  for (const row of entry.top) {
    if (!isValidISOCode(row.isoCode)) flag(commodity, `invalid exporter code "${row.isoCode}"`)
    if (!Number.isFinite(row.value.amount) || row.value.amount <= 0)
      flag(commodity, `exporter ${row.isoCode} has value ${row.value.amount}`)
  }
  if (shareSum > 1.001) flag(commodity, `world shares sum to ${shareSum.toFixed(3)}`)
  const vintage = entry.world.year
  if (vintage === undefined) flag(commodity, 'world total has no year')
  else if (vintage < currentYear - 4)
    flag(commodity, `BACI vintage ${vintage} — release went stale, bump the pin`)
}
// The dealer's own pool and band math — a hard world game, the widest board.
const worldPool = new Set(
  playableCountries({ variant: 'world', difficulty: 'hard', includeMicroNations: false })
)
const worldCap = Math.max(MADE_MAX_POOL_FLOOR, Math.ceil(worldPool.size * MADE_MAX_POOL_SHARE))
const dealable = [...MADE_COMMODITIES].filter(commodity => {
  if (!COMMODITY_EXPORTERS[commodity]) return false
  const onBoard = [...madeAcceptedCountries(commodity)].filter(isoCode => worldPool.has(isoCode))
  return onBoard.length >= MADE_MIN_POOL && onBoard.length <= worldCap
}).length
if (dealable < 20)
  findings.push(
    `only ${dealable} curated commodities are dealable on a world board — Made In deals get repetitive`
  )

// --- Report --------------------------------------------------------------------
const fresh = findings.filter(finding => !ACCEPTED.has(finding))
if (findings.length) {
  console.info(
    findings.map(finding => `${ACCEPTED.has(finding) ? '·' : '✗'} ${finding}`).join('\n')
  )
} else {
  console.info('✓ all clear')
}
console.info(
  `\n${countries.length} countries · ${withList.length} with commodity lists · ${worldCounts.size} distinct commodities · ${MADE_COMMODITIES.size} curated (${dealable} dealable world-wide)`
)

if (fresh.length && process.argv.includes('--strict')) {
  console.error(`\n${fresh.length} finding(s) outside the accepted baseline`)
  process.exit(1)
}
