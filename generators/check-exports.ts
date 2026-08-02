/**
 * Advisory linter for the exports data — coverage, string hygiene and
 * plausibility checks the generator deliberately does NOT enforce with throws.
 * The Made In challenge matches commodity strings EXACTLY across countries and
 * the reveal ranks exporters by exportsTotal, so stray variants ("packaged
 * medicines" vs "packaged medicine") and mis-scaled totals are gameplay bugs,
 * not cosmetics. Findings are printed; with --strict they also fail the run,
 * which is how the DataUpdate workflow gates its auto-commit.
 *
 * Run after regenerating countries:
 *   bun run generators/check-exports.ts [--strict]
 */
import { COUNTRIES } from '../data/countries.gen'
import { MADE_COMMODITIES } from '../lib/challenges/final-challenge'

const findings: string[] = []
const flag = (id: string, message: string) => findings.push(`${id}: ${message}`)

// Findings a curator has looked at and accepted (VA/KP/MC genuinely lack a
// Factbook exports entry; a few states' totals are genuinely old). --strict
// fails only on findings outside this baseline — a new finding is news, a
// known one is not. When an entry stops matching (source updated), drop it.
const ACCEPTED = new Set([
  'VA: no exports commodity list',
  'KP: exports list but no exportsTotal — unranked in the Made In reveal',
  'MC: exports list but no exportsTotal — unranked in the Made In reveal',
  'BB: exportsTotal vintage 2017 — source went stale',
  'ER: exportsTotal vintage 2017 — source went stale',
  'LI: exportsTotal vintage 2015 — source went stale',
  'YE: exportsTotal vintage 2017 — source went stale',
])

const countries = Object.values(COUNTRIES)
const withList = countries.filter(country => country.economics.exports)
const withTotal = countries.filter(country => country.economics.exportsTotal)

// --- Coverage ------------------------------------------------------------------
// The Factbook genuinely lacks an Exports dollar entry for a few states (VA, KP,
// MC as of 2026) — those rank as "—" in the Made In reveal, which is fine. New
// gaps mean the source moved or the parser broke.
for (const country of countries) {
  if (!country.economics.exports) flag(country.isoCode, 'no exports commodity list')
  else if (!country.economics.exportsTotal)
    flag(country.isoCode, 'exports list but no exportsTotal — unranked in the Made In reveal')
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

// --- Totals: unit, magnitude, vintage ------------------------------------------
// Magnitude bounds catch scale-word parse failures ("billion" missed → values
// a thousandth of reality). Bounds: Tuvalu bottoms out near $2M, China tops
// out near $4T.
const currentYear = new Date().getFullYear()
for (const country of withTotal) {
  const total = country.economics.exportsTotal!
  const id = country.isoCode
  if (total.unit !== '$') flag(id, `exportsTotal unit is "${total.unit}", expected "$"`)
  if (!Number.isFinite(total.amount) || total.amount <= 0)
    flag(id, `exportsTotal amount is ${total.amount}`)
  else if (total.amount < 1e6) flag(id, `exportsTotal $${total.amount} — dropped a scale word?`)
  else if (total.amount > 4.5e12) flag(id, `exportsTotal $${total.amount} — gained a scale word?`)
  if (total.year === undefined) flag(id, 'exportsTotal has no year')
  else if (total.year > currentYear) flag(id, `exportsTotal year ${total.year} is in the future`)
  else if (total.year < currentYear - 8)
    flag(id, `exportsTotal vintage ${total.year} — source went stale`)
}

// --- Totals vs GDP: cross-field plausibility -----------------------------------
// Entrepôt economies (Luxembourg, Singapore) genuinely export ~2x their PPP
// GDP; past 2.5x it's almost certainly a units mismatch between the fields.
for (const country of withTotal) {
  const total = country.economics.exportsTotal!.amount
  const gdp = country.economics.gdpTotal?.amount
  if (gdp && total / gdp > 2.5)
    flag(country.isoCode, `exportsTotal is ${(total / gdp).toFixed(1)}x GDP (PPP)`)
}

// --- Dealability: the Made In dealer draws curated commodities with 2–8 pool --
// exporters. Regens can rename or drop a commodity out from under the curated
// set, and a thin curated band makes deals repetitive.
const worldCounts = new Map<string, number>()
for (const country of withList) {
  for (const item of country.economics.exports!) {
    worldCounts.set(item, (worldCounts.get(item) ?? 0) + 1)
  }
}
for (const commodity of MADE_COMMODITIES) {
  if (!worldCounts.has(commodity))
    flag(commodity, 'curated in MADE_COMMODITIES but no country exports it — curation went stale')
}
const dealable = [...worldCounts.entries()].filter(
  ([item, count]) => MADE_COMMODITIES.has(item) && count >= 2 && count <= 8
).length
if (dealable < 20)
  findings.push(
    `only ${dealable} curated commodities have 2–8 world exporters — Made In deals get repetitive`
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
  `\n${countries.length} countries · ${withList.length} with commodity lists · ${withTotal.length} with totals · ${worldCounts.size} distinct commodities · ${MADE_COMMODITIES.size} curated (${dealable} dealable world-wide)`
)

if (fresh.length && process.argv.includes('--strict')) {
  console.error(`\n${fresh.length} finding(s) outside the accepted baseline`)
  process.exit(1)
}
