import { mkdirSync, writeFileSync } from 'node:fs'
import { ISOCountryCodes } from '../data/iso-codes.gen'
import type { ISOCountryCode } from '../types/geography.types'
import { captureImageCredit, saveCommonsImage, wait } from './vendors/wikidata/commons'
import { jsonParseLiteral } from './lib/emit'
import type { LeaderProfile } from '../lib/leaders'

/**
 * Every country's head of state and head of government, from polity.
 *
 * This replaces a fetch, not a join. The previous route walked Wikidata
 * directly — paginated haswbstatement search for ISO-carrying entities, then
 * P35/P6 claims, then labels, then PageImages — which is a second, parallel
 * implementation of exactly what polity does, and it had none of polity's
 * defences. Measured against polity on the day it was replaced, 32 of its
 * names were wrong:
 *
 *   - MONTHS STALE. Thailand's Paetongtarn Shinawatra, Nepal's Dahal,
 *     Kazakhstan's Smaiylov, Ukraine's Svyrydenko, Somalia's Roble (left in
 *     2022). A country's P35/P6 is written when a leader arrives and rarely
 *     closed when they go, and nothing here cross-checked it.
 *   - VANDALISED. Tuvalu's prime minister read "Ben Do" and Eswatini's
 *     "Edeupa Yerimin" — labels anyone can edit, where polity checks them
 *     against the article title behind them.
 *   - TRUNCATED. Qatar's emir read "Tamim bin Hamad Al".
 *
 * polity resolves the office item as well as the country item, judges a term
 * against today's date, and refuses an office that deprecates its own history.
 * None of that is worth reimplementing here.
 *
 * Portraits are still downloaded rather than hot-linked, for the same reason
 * party logos are: polity points at Commons `Special:FilePath`, which costs
 * three redirects and ~580ms cold, and a leader's face is shown mid-round.
 *
 *   bun run generate:leaders [--force]
 */

const SOURCE = 'https://kodwerk-ab.github.io/polity/v1/polity.json'
const OUTPUT_DIRECTORY = 'public/leaders'
/** Portraits aren't zoomed, but 512px is soft on a HiDPI screen. */
const PORTRAIT_WIDTH = 1024

type LeaderRole = 'headOfState' | 'headOfGovernment'
const ROLES: { readonly [key in LeaderRole]: 'head_of_state' | 'head_of_government' } = {
  headOfState: 'head_of_state',
  headOfGovernment: 'head_of_government',
}

interface LeaderEntry extends LeaderProfile {
  /**
   * The day this term began (polity's `since`), when it is known to day
   * precision. Used by the country generator to decide whether a CIA
   * world-leaders page predates the current term.
   */
  sinceDate?: string
}

export type LeaderMapping = {
  [isoCode in ISOCountryCode]?: { [role in LeaderRole]?: LeaderEntry } & {
    /**
     * Which office actually runs the country, decided by polity.
     *
     * The alternative is guessing from the leader's TITLE, and the title does
     * not say: Egypt, Malaysia, Eswatini and Togo all have a president or
     * monarch alongside a prime minister, and the one who governs differs in
     * every case. `collective` is Switzerland, whose Federal Council governs as
     * a body and has no single leader to name.
     */
    executivePower?: 'head_of_state' | 'head_of_government' | 'collective'
  }
}

/** Only the parts of polity this generator reads. */
interface PolityOfficeHolder {
  name: string
  office?: { label?: string }
  party?: { label?: string } | null
  since?: string
  born_year?: number
  description?: string
  portrait?: { file: string; license?: string; credit?: string; non_free?: boolean }
  superseded?: boolean
}
interface PolityCountry {
  head_of_state?: PolityOfficeHolder | null
  head_of_government?: PolityOfficeHolder | null
  executive_power?: 'head_of_state' | 'head_of_government' | 'collective'
}
interface PolityDataset {
  generated_at?: string
  schema_version?: string
  countries: Record<string, PolityCountry>
}

const force = process.argv.includes('--force')
const validCodes = new Set<string>(ISOCountryCodes)

let previousMapping: LeaderMapping = {}
try {
  previousMapping = (await import('../data/leaders.gen')).LEADERS ?? {}
} catch {
  // First run, or the file was deleted deliberately. Nothing to merge.
}

console.info(`Fetching ${SOURCE}`)
const response = await fetch(SOURCE)
if (!response.ok) throw new Error(`polity: HTTP ${response.status}`)
const dataset = (await response.json()) as PolityDataset
const countryCount = Object.keys(dataset.countries ?? {}).length
if (countryCount < 150) {
  throw new Error(`polity returned only ${countryCount} countries — refusing to overwrite`)
}
console.info(
  `  polity ${dataset.schema_version ?? '?'}, built ${dataset.generated_at?.slice(0, 10) ?? '?'}, ${countryCount} countries`
)

const mapping: LeaderMapping = {}
const portraitQueue: { isoCode: ISOCountryCode; role: LeaderRole; file: string }[] = []

for (const [iso, country] of Object.entries(dataset.countries)) {
  if (!validCodes.has(iso)) continue
  const isoCode = iso as ISOCountryCode

  for (const [role, field] of Object.entries(ROLES) as [LeaderRole, keyof PolityCountry][]) {
    const holder = country[field]
    if (!holder?.name) continue

    // A `superseded` holder is one polity kept because the office exists and
    // somebody holds it, while flagging that its own record disagrees. The
    // NAME is the best available; the dates, party and portrait beside it
    // belonged to the previous holder, so polity omits them and so do we.
    const entry: LeaderEntry = { name: holder.name }
    if (holder.description) entry.description = holder.description
    if (holder.born_year) entry.bornYear = holder.born_year
    if (holder.since) {
      entry.sinceDate = holder.since
      const year = Number(holder.since.slice(0, 4))
      if (Number.isFinite(year)) entry.sinceYear = year
    }
    if (holder.office?.label) entry.office = holder.office.label
    if (holder.party?.label) entry.party = holder.party.label

    mapping[isoCode] = { ...mapping[isoCode], [role]: entry }
    if (holder.portrait?.file) {
      portraitQueue.push({ isoCode, role, file: holder.portrait.file })
    }
  }

  if (mapping[isoCode] && country.executive_power) {
    mapping[isoCode].executivePower = country.executive_power
  }
}

console.info(`Leaders for ${Object.keys(mapping).length} countries; downloading portraits…`)
mkdirSync(OUTPUT_DIRECTORY, { recursive: true })

let saved = 0
let failed = 0

// One at a time with a breather between requests — the thumbnail service 429s
// anything resembling parallel load.
for (const { isoCode, role, file } of portraitQueue) {
  // BOTH arguments are whole paths, not a name and a directory: the first is
  // where the file is written, the second is the URL it will be served at.
  const slug = `${isoCode}-${role === 'headOfState' ? 'state' : 'government'}`
  // The file is keyed by country and role, so a kept file after an election
  // would show the predecessor's face. Re-download when the person changed.
  const refresh = force || previousMapping[isoCode]?.[role]?.name !== mapping[isoCode]?.[role]?.name
  const path = await saveCommonsImage(file, `${OUTPUT_DIRECTORY}/${slug}`, `/leaders/${slug}`, {
    width: PORTRAIT_WIDTH,
    force: refresh,
  })
  if (path) {
    const entry = mapping[isoCode]?.[role]
    if (entry) {
      entry.image = path
      Object.assign(
        entry,
        await captureImageCredit(file, previousMapping[isoCode]?.[role], refresh)
      )
    }
    saved++
  } else {
    failed++
  }
  process.stdout.write(`\r  ${saved + failed}/${portraitQueue.length} portraits`)
  await wait(250)
}
process.stdout.write('\n')
console.info(`Portraits: ${saved} saved, ${failed} failed`)

// Merge with the previous run: fresh data wins per role, gaps keep old data.
for (const isoCode of ISOCountryCodes) {
  const merged = { ...previousMapping[isoCode], ...mapping[isoCode] }
  if (Object.keys(merged).length) mapping[isoCode] = merged
}

writeFileSync(
  'data/leaders.gen.ts',
  `// Generated by generators/create-leaders-file.ts — do not edit by hand.\n` +
    `import type { LeaderMapping } from '../generators/create-leaders-file'\n\n` +
    `export const LEADERS: LeaderMapping = ${jsonParseLiteral(mapping)}\n`
)
console.info(`Wrote data/leaders.gen.ts (${Object.keys(mapping).length} countries)`)

// Silence is how gaps sneak through — name every country that got nothing.
const missing = ISOCountryCodes.filter(isoCode => !mapping[isoCode])
if (missing.length) {
  console.warn(`NO LEADER DATA for ${missing.length} countries: ${missing.join(' ')}`)
}
