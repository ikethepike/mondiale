import { writeFileSync } from 'node:fs'
import { resolveUnLocation } from '~~/generators/lib/un-names'
import { TREATY_CORRECTIONS } from '~~/data/static/treaty-corrections'
import { type ISOCountryCode, isValidISOCode } from '~~/types/geography.types'
import {
  TREATY_META,
  type TreatyMapping,
  type TreatyMeta,
  type TreatyStanding,
  type TreatyStatus,
} from '~~/types/treaty.type'

/**
 * Who is actually bound by the world's big multilateral instruments, from the
 * UN Treaty Collection's own status pages — the depositary of record, so a
 * signature that never became a ratification is visible rather than inferred.
 *
 * That distinction is the point. "Party" is the boring state; the interesting
 * ones are a country that signed and stalled for forty years, or ratified and
 * then walked out. Membership scraped from Factbook prose can express neither.
 *
 * Schengen comes from Wikidata (it has no UNTC chapter), the ECHR from a
 * curated list — the Council of Europe blocks scripted requests and Wikidata's
 * own item is empty. See data/static/treaty-corrections.ts.
 *
 *   bun run generate:treaties
 */

const OUTPUT_FILE = 'data/treaties.gen.ts'
/** Every instrument must resolve — a silent drop is a hole in the deck. */
const MINIMUM_TREATIES = TREATY_META.length
/** Courtesy gap between sequential requests to a UN server. */
const FETCH_PAUSE_MS = 500

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const fetchText = async (url: string): Promise<string> => {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'mondiale-generator' },
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok) throw new Error(`${url} returned ${response.status}`)
  return response.text()
}

const stripTags = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

/** Rows of cells from the participants grid. */
const parseGrid = (html: string, label: string): string[][] => {
  const table = html.match(/<table[^>]*id="[^"]*tblgrid"[^>]*>([\s\S]*?)<\/table>/i)
  if (!table) throw new Error(`${label}: no participants table — UNTC changed its markup`)
  return [...table[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(row =>
    [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell => stripTags(cell[1]))
  )
}

/** Trailing footnote markers: "China 5, 6" → "China". */
const participantName = (raw: string) => raw.replace(/\s*\d+(\s*,\s*\d+)*\s*$/, '').trim()

const yearIn = (cell: string): number | undefined => {
  const years = cell.match(/\d{4}/g)
  const year = years?.[years.length - 1]
  return year ? Number(year) : undefined
}

/**
 * Read one chapter's status table.
 *
 * The ratification column is resolved by HEADER TEXT, never by index: most
 * tables run participant/signature/ratification, but Cluster Munitions and the
 * ATT insert a "Provisional application" column. Reading index 2 there returns
 * a handful of parties instead of a hundred — wrong, and plausible enough to
 * ship unnoticed.
 */
const fetchUntcStatus = async (
  meta: TreatyMeta,
  unresolved: Set<string>
): Promise<{ [iso in ISOCountryCode]?: TreatyStatus }> => {
  const { mtdsg, chapter } = meta.untc!
  const url = `https://treaties.un.org/Pages/ViewDetails.aspx?src=IND&mtdsg_no=${mtdsg}&chapter=${chapter}&clang=_en`
  const rows = parseGrid(await fetchText(url), meta.id)

  const header = rows.find(row => row.some(cell => /participant/i.test(cell))) ?? rows[0] ?? []
  const ratificationColumn = header.findIndex(
    cell => /ratification|accession|acceptance|approval/i.test(cell) && !/provisional/i.test(cell)
  )
  if (ratificationColumn < 0) {
    throw new Error(`${meta.id}: no ratification column in [${header.join(' | ')}]`)
  }

  const statuses: { [iso in ISOCountryCode]?: TreatyStatus } = {}
  for (const row of rows) {
    if (row === header || row.length < 2 || !row[0] || /participant/i.test(row[0])) continue
    const name = participantName(row[0])
    const isoCode = resolveUnLocation(name)
    if (!isoCode) {
      unresolved.add(name)
      continue
    }

    const signature = row[1] ?? ''
    const ratification = row[ratificationColumn] ?? ''
    // UNTC brackets a date it no longer counts — that is a withdrawal.
    const bracketed = /\[/.test(ratification) || /\[/.test(signature)

    if (ratification) {
      statuses[isoCode] = bracketed
        ? { standing: 'withdrawn' }
        : { standing: 'party', year: yearIn(ratification) }
    } else if (signature) {
      statuses[isoCode] = { standing: 'signatory', year: yearIn(signature) }
    }
  }
  return statuses
}

/**
 * Schengen has no UNTC chapter. P527 (has-part) is the populated property —
 * P463 (member-of) silently omits the Netherlands. Gibraltar comes back and
 * drops through the ISO gate, as intended.
 */
const fetchSchengen = async (): Promise<{ [iso in ISOCountryCode]?: TreatyStatus }> => {
  const query = 'SELECT ?code WHERE { wd:Q1969730 wdt:P527 ?c . ?c wdt:P297 ?code }'
  const response = await fetch(
    `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}`,
    {
      headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'mondiale-generator' },
      signal: AbortSignal.timeout(60_000),
    }
  )
  if (!response.ok) throw new Error(`Wikidata Schengen query returned ${response.status}`)

  const json = (await response.json()) as { results: { bindings: { code: { value: string } }[] } }
  const statuses: { [iso in ISOCountryCode]?: TreatyStatus } = {}
  for (const binding of json.results.bindings) {
    const isoCode = binding.code.value.toUpperCase()
    if (isValidISOCode(isoCode)) statuses[isoCode] = { standing: 'party' }
  }
  return statuses
}

const createTreatiesFile = async () => {
  const mapping: TreatyMapping = {}
  const review: string[] = []
  /** Names no ISO claimed — mostly non-playable, but this is how a new
   *  endonym or long form ("Naoero") gets found instead of silently dropped. */
  const unresolved = new Set<string>()

  for (const meta of TREATY_META) {
    let statuses: { [iso in ISOCountryCode]?: TreatyStatus }
    if (meta.untc) {
      statuses = await fetchUntcStatus(meta, unresolved)
      await pause(FETCH_PAUSE_MS)
    } else if (meta.id === 'schengen') {
      statuses = await fetchSchengen()
    } else {
      statuses = {}
    }

    // Curated overlay last: the ECHR is entirely curated, the rest patch.
    for (const [isoCode, status] of Object.entries(TREATY_CORRECTIONS[meta.id] ?? {})) {
      if (isValidISOCode(isoCode)) statuses[isoCode] = status
    }

    const counts = Object.values(statuses).reduce(
      (tally, status) => ({ ...tally, [status.standing]: (tally[status.standing] ?? 0) + 1 }),
      {} as Record<TreatyStanding, number | undefined>
    )
    const parties = counts.party ?? 0
    if (parties < meta.minimumParties) {
      throw new Error(
        `${meta.id}: ${parties} parties, floor is ${meta.minimumParties} — check the column resolution or the chapter`
      )
    }

    mapping[meta.id] = statuses
    review.push(
      `  ${meta.id.padEnd(18)} party=${String(parties).padStart(3)}  signed-only=${String(counts.signatory ?? 0).padStart(2)}  withdrawn=${counts.withdrawn ?? 0}`
    )
  }

  const treaties = Object.keys(mapping).length
  if (treaties < MINIMUM_TREATIES) {
    throw new Error(`Only ${treaties} instruments resolved (floor ${MINIMUM_TREATIES})`)
  }

  // The canary. The United States is the only country on earth that signed the
  // Convention on the Rights of the Child and never ratified it — if this
  // flips, either that changed or the parse broke, and the second is likelier.
  const crcUnitedStates = mapping.crc?.US?.standing
  if (crcUnitedStates !== 'signatory') {
    throw new Error(
      `CRC/US reads "${crcUnitedStates}", expected "signatory" — the parse is wrong or the world changed`
    )
  }

  console.info('\nTreaty status — eyeball before committing:')
  console.info(review.join('\n'))
  if (unresolved.size) console.info(`\nUnresolved names: ${[...unresolved].join(', ')}`)

  writeFileSync(
    OUTPUT_FILE,
    `
      // Generated by generators/vendors/untc/create-treaties.ts — do not edit by hand.
      // Source: UN Treaty Collection, Multilateral Treaties Deposited with the Secretary-General.
      // Schengen membership from Wikidata (CC0); ECHR from data/static/treaty-corrections.ts.
      import type { TreatyMapping } from '../types/treaty.type'
      export const TREATIES: TreatyMapping = ${JSON.stringify(mapping)}
    `
  )
  console.info(`\nWrote ${OUTPUT_FILE} (${treaties} instruments)`)
}

createTreatiesFile()
