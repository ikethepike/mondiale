import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { jsonParseLiteral } from './lib/emit'
import { fetchJson, wait } from './vendors/wikidata/commons'
import { type ISOCountryCode, isValidISOCode } from '../types/geography.types'

/**
 * Seats and vote share per party, from en.wikipedia's election infoboxes.
 *
 * The Factbook is the roster's home (see create-parties-file), but it publishes
 * a seat table for NO bicameral country at all — 0 of 84, against 116 of 166
 * unicameral ones. That hole is Poland, the UK, India, Germany, Brazil and the
 * US, so a seat-facing mode built on the Factbook alone deals from ten
 * countries. Wikipedia's election articles fill it, and carry the one thing the
 * Factbook never prints anywhere: the VOTE percentage, which is what makes the
 * gap between votes and seats visible.
 *
 * Four things make the parse trustworthy, each fixing a whole class rather than
 * a country:
 *
 *   1. Braces are scanned with a cursor, not index-by-index. `}}}}` contains
 *      THREE overlapping two-character matches, so a naive scan decrements
 *      depth once too often, goes negative, and starts reading nested pipes as
 *      top-level fields. That truncated Poland's Sejm to two parties.
 *   2. Bicameral articles wrap each chamber in `| module = {{Infobox election
 *      | embed = yes | election_name = Sejm …}}`. Reading only outermost
 *      templates reads the WRAPPER, whose depth-1 fields are whichever
 *      chamber's happen to sit outside the modules — which reported the
 *      Senate's 41 seats as Poland's result.
 *   3. `Infobox legislative election` is a separate template name. Matching it
 *      too is what fixed the Netherlands, Brazil, Argentina and Indonesia.
 *   4. The LOWER house is the answer. Upper chambers name themselves (Senate,
 *      Rajya Sabha, House of Lords) and the lower house forms governments.
 *
 * Validated on 18 lower houses: 16 parse, most summing exactly to the chamber
 * (Poland 460/460, Germany 630/630, Netherlands 150/150, Austria 183/183,
 * Switzerland 200/200, Belgium 150/150, Lithuania 141/141).
 *
 *   bun run generate:elections [--force]
 *
 * Hand-run, like the other curated pipelines: it reads one article per country
 * and the seed list is edited by a human when an election happens.
 */

const OUTPUT_FILE = 'data/elections.gen.ts'
const REPORT_FILE = 'generators/data/elections-report.txt'
const CACHE_PATH = 'generators/data/election-page-cache.json'

/** A partial run parses and type-checks fine; refuse to write one. */
const COUNTRY_FLOOR = 40

/** Listed seats may fall short of the chamber (independents, small parties
 *  below the infobox's cut) — past this the parse is suspect, not the source. */
const SEAT_COVERAGE_FLOOR = 0.5

const force = process.argv.includes('--force')

export interface ElectionParty {
  /** The party, as the infobox names it. */
  party: string
  seats: number
  /** The bloc it stood in, when it stood in one — several parties share it. */
  alliance?: string
  /** Share of the national vote, when the infobox prints one. */
  votePct?: number
}

export interface Election {
  /** The chamber, as the article names it ("Sejm"); absent on single-box articles. */
  chamber?: string
  /** The chamber's full size, from "All 460 seats in the Sejm". */
  totalSeats?: number
  /** The wikipedia article this was read from — the ⓘ's deep link. */
  article: string
  parties: ElectionParty[]
}

export type ElectionMapping = { [isoCode in ISOCountryCode]?: Election }

/**
 * One article per country. Hand-maintained: an election is a human event, and
 * a wrong guess at an article title is a silent miss rather than a crash.
 */
const ELECTION_ARTICLES: { [isoCode in ISOCountryCode]?: string } = {
  AL: '2025 Albanian parliamentary election',
  AR: '2023 Argentine general election',
  AT: '2024 Austrian legislative election',
  AU: '2022 Australian federal election',
  BE: '2024 Belgian federal election',
  // Countries that voted twice in a year have a disambiguation stub at the
  // bare "<year> … election" title; the month-qualified article is the real one.
  BG: 'October 2024 Bulgarian parliamentary election',
  BR: '2022 Brazilian general election',
  CA: '2025 Canadian federal election',
  CH: '2023 Swiss federal election',
  CL: '2021 Chilean general election',
  CO: '2022 Colombian parliamentary election',
  CY: '2021 Cypriot legislative election',
  CZ: '2021 Czech legislative election',
  DE: '2025 German federal election',
  DK: '2022 Danish general election',
  EE: '2023 Estonian parliamentary election',
  ES: '2023 Spanish general election',
  FI: '2023 Finnish parliamentary election',
  FR: '2022 French legislative election',
  GB: '2024 United Kingdom general election',
  GR: 'June 2023 Greek parliamentary election',
  HR: '2024 Croatian parliamentary election',
  HU: '2022 Hungarian parliamentary election',
  ID: '2024 Indonesian legislative election',
  IE: '2024 Irish general election',
  IL: '2022 Israeli legislative election',
  IN: '2024 Indian general election',
  IS: '2024 Icelandic parliamentary election',
  IT: '2022 Italian general election',
  JP: '2021 Japanese general election',
  KR: '2024 South Korean legislative election',
  LT: '2024 Lithuanian parliamentary election',
  LU: '2023 Luxembourg general election',
  LV: '2022 Latvian parliamentary election',
  MT: '2022 Maltese general election',
  MX: '2024 Mexican general election',
  MY: '2022 Malaysian general election',
  NL: '2023 Dutch general election',
  NO: '2021 Norwegian parliamentary election',
  NZ: '2023 New Zealand general election',
  PE: '2021 Peruvian general election',
  PH: '2022 Philippine House of Representatives elections',
  PL: '2023 Polish parliamentary election',
  PT: '2022 Portuguese legislative election',
  RO: '2024 Romanian parliamentary election',
  RS: '2023 Serbian parliamentary election',
  SE: '2022 Swedish general election',
  SI: '2022 Slovenian parliamentary election',
  SK: '2023 Slovak parliamentary election',
  TR: '2023 Turkish parliamentary election',
  TW: '2024 Taiwanese legislative election',
  UA: '2019 Ukrainian parliamentary election',
  UY: '2024 Uruguayan general election',
  ZA: '2024 South African general election',
}

// --- Wikitext -----------------------------------------------------------------

/**
 * The template starting at `index`, brace-balanced. The cursor advances by two
 * over every `{{`/`}}` so an overlapping run like `}}}}` is counted once per
 * pair rather than once per position.
 */
const templateAt = (text: string, index: number): string => {
  let depth = 0
  let cursor = index
  while (cursor < text.length - 1) {
    const pair = text.slice(cursor, cursor + 2)
    if (pair === '{{') {
      depth += 1
      cursor += 2
      continue
    }
    if (pair === '}}') {
      depth -= 1
      cursor += 2
      if (depth === 0) return text.slice(index, cursor)
      continue
    }
    cursor += 1
  }
  return text.slice(index)
}

/** `|key = value` pairs at depth 1 of ONE template — nested templates and
 *  wikilinks keep their own pipes. */
const templateFields = (block: string): Record<string, string> => {
  const body = block.slice(2, -2)
  const fields: Record<string, string> = {}
  let depth = 0
  let link = 0
  let buffer = ''
  let cursor = 0

  const flush = () => {
    const split = buffer.indexOf('=')
    if (split > 0)
      fields[buffer.slice(0, split).trim().toLowerCase()] = buffer.slice(split + 1).trim()
    buffer = ''
  }

  while (cursor < body.length) {
    const pair = body.slice(cursor, cursor + 2)
    if (pair === '{{' || pair === '}}' || pair === '[[' || pair === ']]') {
      if (pair === '{{') depth += 1
      else if (pair === '}}') depth -= 1
      else if (pair === '[[') link += 1
      else link -= 1
      buffer += pair
      cursor += 2
      continue
    }
    if (body[cursor] === '|' && depth === 0 && link === 0) {
      flush()
      cursor += 1
      continue
    }
    buffer += body[cursor]
    cursor += 1
  }
  flush()
  return fields
}

/** Every election infobox, preferring the EMBEDDED ones — a bicameral article
 *  puts each chamber in its own `| module = {{… embed = yes …}}`. */
const electionBoxes = (text: string): string[] => {
  const blocks: string[] = []
  const pattern = /\{\{\s*Infobox\s+(?:legislative\s+)?election/gi
  for (const match of text.matchAll(pattern)) blocks.push(templateAt(text, match.index))
  const embedded = blocks.filter(block => /\|\s*embed\s*=\s*yes/i.test(block.slice(0, 400)))
  return embedded.length ? embedded : blocks
}

const plainText = (value: string): string =>
  value
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/'''/g, '')
    .replace(/<br\s*\/?>/gi, ' / ')
    .replace(/<[^>]+>/g, '')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    // Some articles name the party through a colour template rather than in
    // prose — Canada's is `{{Canadian party colour|CA|Liberal|name}}`, where
    // the party is a positional argument. Stripping the template outright
    // would drop the only name the infobox carries, so keep its longest word.
    .replace(/\{\{[^{}]*\}\}/g, template => {
      const parts = template
        .slice(2, -2)
        .split('|')
        .slice(1)
        .map(part => part.trim())
        .filter(part => part && !/^(name|short|abbrev|colou?r)$/i.test(part) && part.length > 2)
      return parts.sort((a, b) => b.length - a.length)[0] ?? ''
    })
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/** Upper chambers name themselves; the lower house forms governments. */
const UPPER_HOUSE =
  /\b(senate|senat|council of states|house of lords|upper|rajya|federation council)\b/i

const readElection = (article: string, text: string): Election | undefined => {
  const chambers: Election[] = []

  for (const block of electionBoxes(text)) {
    const fields = templateFields(block)
    const parties: ElectionParty[] = []

    for (let index = 1; index <= 15; index += 1) {
      const rawSeats = fields[`seats${index}`]
      if (!rawSeats) continue
      const seats = /\d[\d,]*/.exec(rawSeats)?.[0]
      if (!seats) continue
      // The PARTY names the bench, not its alliance: Sweden files its Social
      // Democrats, Left Party and Greens under one "Red-Greens" alliance, and
      // preferring that would draw three different blocs under one name. The
      // alliance is kept beside it, because it is the answer to a different
      // question ("who governs together") and the hint for this one.
      const party = plainText(fields[`party${index}`] ?? fields[`alliance${index}`] ?? '')
      if (!party) continue
      const alliance = plainText(fields[`alliance${index}`] ?? '')
      const votePct = /[\d.]+/.exec(plainText(fields[`percentage${index}`] ?? ''))?.[0]
      parties.push({
        party,
        seats: Number(seats.replace(/,/g, '')),
        ...(alliance && alliance !== party ? { alliance } : {}),
        ...(votePct ? { votePct: Number(votePct) } : {}),
      })
    }

    if (parties.length < 2) continue
    const total = /(\d[\d,]*)\s+seats/.exec(plainText(fields.seats_for_election ?? ''))?.[1]
    chambers.push({
      chamber: plainText(fields.election_name ?? '') || undefined,
      ...(total ? { totalSeats: Number(total.replace(/,/g, '')) } : {}),
      article,
      parties,
    })
  }

  if (!chambers.length) return undefined
  const lower = chambers.filter(chamber => !UPPER_HOUSE.test(chamber.chamber ?? ''))
  const pool = lower.length ? lower : chambers
  return pool.reduce((best, chamber) =>
    chamber.parties.length > best.parties.length ? chamber : best
  )
}

// --- Run ----------------------------------------------------------------------

/** Article wikitext is stable between elections and the parse is the part that
 *  changes, so cache the text and iterate on the reader for free. */
const cache: Record<string, string> =
  force || !existsSync(CACHE_PATH) ? {} : JSON.parse(readFileSync(CACHE_PATH, 'utf8'))

const wikitext = async (article: string): Promise<string> => {
  if (cache[article]) return cache[article]
  const response = await fetchJson<{ parse?: { wikitext?: { '*'?: string } } }>(
    `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(
      article
    )}&prop=wikitext&format=json&redirects=1`
  )
  const text = response?.parse?.wikitext?.['*'] ?? ''
  if (text) cache[article] = text
  await wait(200)
  return text
}

let previous: ElectionMapping = {}
try {
  previous = (await import('../data/elections.gen')).ELECTIONS ?? {}
} catch {
  // First run — nothing to merge.
}

const mapping: ElectionMapping = {}
const report: string[] = []

for (const [isoCode, article] of Object.entries(ELECTION_ARTICLES)) {
  if (!isValidISOCode(isoCode)) continue
  const text = await wikitext(article)
  if (!text) {
    report.push(`${isoCode}: could not fetch "${article}"`)
    continue
  }

  const election = readElection(article, text)
  if (!election) {
    report.push(`${isoCode}: no readable election infobox in "${article}"`)
    continue
  }

  const held = election.parties.reduce((total, party) => total + party.seats, 0)
  if (election.totalSeats && held / election.totalSeats < SEAT_COVERAGE_FLOOR) {
    report.push(
      `${isoCode}: only ${held}/${election.totalSeats} seats accounted for — parse is suspect`
    )
    continue
  }
  if (election.totalSeats && held > election.totalSeats) {
    report.push(`${isoCode}: ${held} seats exceed the chamber's ${election.totalSeats}`)
    continue
  }

  mapping[isoCode] = election
  process.stdout.write(`\r  ${Object.keys(mapping).length} chambers`)
  writeFileSync(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`)
}
console.log()

// A transient fetch failure must never ERASE a chamber an earlier run read.
for (const isoCode of Object.keys(previous) as ISOCountryCode[]) {
  if (!mapping[isoCode] && previous[isoCode]) mapping[isoCode] = previous[isoCode]
}

const countries = Object.keys(mapping).length
if (countries < COUNTRY_FLOOR) {
  throw new Error(
    `Only ${countries} chambers parsed (floor ${COUNTRY_FLOOR}) — refusing to write a partial file.`
  )
}

writeFileSync(
  OUTPUT_FILE,
  `// Generated by generators/create-elections-file.ts — do not edit by hand.
import type { ElectionMapping } from '../generators/create-elections-file'

export const ELECTIONS: ElectionMapping = ${jsonParseLiteral(mapping)}
`
)

const withVotes = Object.values(mapping).filter(election =>
  election?.parties.some(party => party.votePct !== undefined)
).length

writeFileSync(
  REPORT_FILE,
  [
    `chambers: ${countries} of ${Object.keys(ELECTION_ARTICLES).length} seeded`,
    `with vote share: ${withVotes}`,
    '',
    'skipped or suspect:',
    ...report,
  ].join('\n')
)

// Silence is how gaps sneak through — name every seed that produced nothing.
const missing = (Object.keys(ELECTION_ARTICLES) as ISOCountryCode[]).filter(iso => !mapping[iso])
if (missing.length) {
  console.warn(`NO ELECTION DATA for ${missing.length}: ${missing.join(' ')}`)
}

console.log(`\nWrote ${OUTPUT_FILE}: ${countries} chambers, ${withVotes} with vote share.`)
console.log(`Review ${REPORT_FILE} before committing.`)
