import { writeFileSync } from 'node:fs'
import { resolveUnLocation } from '~~/generators/lib/un-names'
import { TREATY_CORRECTIONS } from '~~/data/static/treaty-corrections'
import { type ISOCountryCode, isValidISOCode } from '~~/types/geography.types'

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

export type TreatyId =
  | 'rome-statute'
  | 'iccpr'
  | 'icescr'
  | 'crc'
  | 'cedaw'
  | 'cat'
  | 'paris'
  | 'kyoto'
  | 'cbd'
  | 'mine-ban'
  | 'cluster-munitions'
  | 'att'
  | 'unclos'
  | 'schengen'
  | 'echr'

export type TreatyStanding =
  /** Ratified, acceded or succeeded — bound by it. */
  | 'party'
  /** Signed and never ratified: on the record as interested, not bound. */
  | 'signatory'
  /** Was a party and left. */
  | 'withdrawn'

export interface TreatyStatus {
  standing: TreatyStanding
  /**
   * Year it joined, or signed. Absent on a withdrawal: UNTC brackets the
   * ORIGINAL dates to mark one and states the effective date in a footnote,
   * so the only year in the row is the year they joined — recording that as
   * the year they left would be a lie the reveal repeats.
   */
  year?: number
}

export type TreatyMapping = {
  [treaty in TreatyId]?: { [iso in ISOCountryCode]?: TreatyStatus }
}

export type TreatyFamily = 'human-rights' | 'climate' | 'arms-control' | 'law-of-the-sea' | 'mobility'

export interface TreatyMeta {
  id: TreatyId
  /** The instrument's formal name, for a reveal. */
  name: string
  /** What a prompt calls it. */
  shortName: string
  family: TreatyFamily
  /** UNTC coordinates; absent means it comes from elsewhere. */
  untc?: { mtdsg: string; chapter: number }
  /** Refuse to write below this many parties — catches a partial parse. */
  minimumParties: number
}

/**
 * Floors sit ~10% under the counts observed when this was written: enough
 * slack for a withdrawal or a reclassification, tight enough that a parse
 * returning a fraction of the table fails instead of shipping.
 */
export const TREATY_META: readonly TreatyMeta[] = [
  // Human rights — where the signed-never-ratified column earns its keep.
  { id: 'crc', name: 'Convention on the Rights of the Child', shortName: 'Convention on the Rights of the Child', family: 'human-rights', untc: { mtdsg: 'IV-11', chapter: 4 }, minimumParties: 180 },
  { id: 'cedaw', name: 'Convention on the Elimination of All Forms of Discrimination against Women', shortName: 'Convention on Discrimination against Women', family: 'human-rights', untc: { mtdsg: 'IV-8', chapter: 4 }, minimumParties: 170 },
  { id: 'iccpr', name: 'International Covenant on Civil and Political Rights', shortName: 'Covenant on Civil and Political Rights', family: 'human-rights', untc: { mtdsg: 'IV-4', chapter: 4 }, minimumParties: 155 },
  { id: 'icescr', name: 'International Covenant on Economic, Social and Cultural Rights', shortName: 'Covenant on Economic, Social and Cultural Rights', family: 'human-rights', untc: { mtdsg: 'IV-3', chapter: 4 }, minimumParties: 155 },
  { id: 'cat', name: 'Convention against Torture', shortName: 'Convention against Torture', family: 'human-rights', untc: { mtdsg: 'IV-9', chapter: 4 }, minimumParties: 155 },
  { id: 'rome-statute', name: 'Rome Statute of the International Criminal Court', shortName: 'Rome Statute', family: 'human-rights', untc: { mtdsg: 'XVIII-10', chapter: 18 }, minimumParties: 110 },

  // Climate and environment.
  { id: 'paris', name: 'Paris Agreement', shortName: 'Paris Agreement', family: 'climate', untc: { mtdsg: 'XXVII-7-d', chapter: 27 }, minimumParties: 175 },
  { id: 'kyoto', name: 'Kyoto Protocol', shortName: 'Kyoto Protocol', family: 'climate', untc: { mtdsg: 'XXVII-7-a', chapter: 27 }, minimumParties: 170 },
  { id: 'cbd', name: 'Convention on Biological Diversity', shortName: 'Convention on Biological Diversity', family: 'climate', untc: { mtdsg: 'XXVII-8', chapter: 27 }, minimumParties: 175 },

  // Arms control.
  { id: 'mine-ban', name: 'Anti-Personnel Mine Ban Convention', shortName: 'Mine Ban Treaty', family: 'arms-control', untc: { mtdsg: 'XXVI-5', chapter: 26 }, minimumParties: 145 },
  { id: 'cluster-munitions', name: 'Convention on Cluster Munitions', shortName: 'Convention on Cluster Munitions', family: 'arms-control', untc: { mtdsg: 'XXVI-6', chapter: 26 }, minimumParties: 100 },
  { id: 'att', name: 'Arms Trade Treaty', shortName: 'Arms Trade Treaty', family: 'arms-control', untc: { mtdsg: 'XXVI-8', chapter: 26 }, minimumParties: 105 },

  // Law of the sea.
  { id: 'unclos', name: 'United Nations Convention on the Law of the Sea', shortName: 'Law of the Sea Convention', family: 'law-of-the-sea', untc: { mtdsg: 'XXI-6', chapter: 21 }, minimumParties: 155 },

  // Non-UNTC: Wikidata and the curated list.
  { id: 'schengen', name: 'Schengen Area', shortName: 'Schengen Area', family: 'mobility', minimumParties: 25 },
  { id: 'echr', name: 'European Convention on Human Rights', shortName: 'European Convention on Human Rights', family: 'human-rights', minimumParties: 40 },
]

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
  const response = await fetch(`https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}`, {
    headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'mondiale-generator' },
    signal: AbortSignal.timeout(60_000),
  })
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
      import type { TreatyMapping } from '../generators/vendors/untc/create-treaties'
      export const TREATIES: TreatyMapping = ${JSON.stringify(mapping)}
    `
  )
  console.info(`\nWrote ${OUTPUT_FILE} (${treaties} instruments)`)
}

createTreatiesFile()
