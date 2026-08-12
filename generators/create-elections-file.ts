import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { jsonParseLiteral } from './lib/emit'
import { fetchJson, wait } from './vendors/wikidata/commons'
import { type ISOCountryCode, isValidISOCode } from '../types/geography.types'
import { COUNTRIES } from '../data/countries.gen'
import { LEADERS } from '../data/leaders.gen'

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
 * A second pass reads the CABINET, because seats say who won and the cabinet
 * says who rules. It has its own two hazards, both learned the hard way:
 * Wikipedia spells a government's title five different ways, and a cabinet
 * article outlives its cabinet — "First Tusk cabinet" is a real page about a
 * government that fell in 2011. See `findCabinet` and `cabinetIsLive`.
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

/** 32 of 71 chambers resolve to a live cabinet. The cabinet is the only source
 *  for who GOVERNS as opposed to who won seats, so a collapse must fail the run
 *  rather than quietly drop the mode that deals from it. */
const CABINET_FLOOR = 24

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
  /** Who actually governs with those seats, when the cabinet article says. */
  cabinet?: Cabinet
}

/**
 * The government the chamber produced. Seats say who WON; this says who RULES,
 * which is a different question and the one a citizen actually knows.
 */
export interface Cabinet {
  /** The wikipedia article this was read from. */
  article: string
  /** The head of government, for the cross-check against our own leaders data. */
  head?: string
  /** Parties holding ministries — the government itself. */
  governing: string[]
  /**
   * Parties propping the government up WITHOUT holding ministries. Sweden's
   * Sweden Democrats are the case: they are not in `governing`, and calling
   * them opposition is wrong. The distinction is the whole point of the field.
   */
  backing: string[]
  /** `majority` | `minority` | `coalition` … as the infobox phrases it. */
  status?: string
}

export type ElectionMapping = { [isoCode in ISOCountryCode]?: Election }

/**
 * One article per country. Hand-maintained: an election is a human event, and
 * a wrong guess at an article title is a silent miss rather than a crash.
 */
const ELECTION_ARTICLES: { [isoCode in ISOCountryCode]?: string } = {
  AF: '2018 Afghan parliamentary election',
  BD: '2024 Bangladeshi general election',
  CD: '2023 Democratic Republic of the Congo general election',
  DZ: '2021 Algerian legislative election',
  ET: '2021 Ethiopian general election',
  GH: '2024 Ghanaian general election',
  IQ: '2021 Iraqi parliamentary election',
  KE: '2022 Kenyan general election',
  MA: '2021 Moroccan general election',
  MM: '2020 Myanmar general election',
  MY: '2022 Malaysian general election',
  NG: '2023 Nigerian House of Representatives election',
  NP: '2022 Nepalese general election',
  PK: '2024 Pakistani general election',
  RU: '2021 Russian legislative election',
  SD: '2015 Sudanese general election',
  SN: '2022 Senegalese parliamentary election',
  TH: '2023 Thai general election',
  TN: '2022 Tunisian parliamentary election',
  TZ: '2020 Tanzanian general election',
  UG: '2021 Ugandan general election',
  US: '2024 United States House of Representatives elections',
  VN: '2021 Vietnamese legislative election',
  ZM: '2021 Zambian general election',
  ZW: '2023 Zimbabwean general election',
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
    // A trailing parenthetical is usually a disambiguator — "(Sweden)",
    // "(2020)" — and stripping it is right. But for some rosters it IS the
    // party's identity: Nepal seats three "Communist Party of Nepal (…)"
    // blocs, which collapse into one repeated name without it. So a
    // parenthetical is kept only when it names a FACTION: more than one word,
    // and not a country or a year.
    .replace(/\s*\(([^)]*)\)/g, (_match, inner: string) => {
      const words = inner.trim().split(/\s+/)
      const isFaction = words.length > 1 && !/^\d{4}$/.test(inner.trim())
      return isFaction ? ` (${inner.trim()})` : ''
    })
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

// --- The cabinet -------------------------------------------------------------

/**
 * Wikipedia has no single title convention for a government, so the article is
 * found by trying the shapes it actually uses — the product of an ordinal and a
 * noun around the leader's surname, because "Second Tusk cabinet",
 * "Rama II Cabinet" and "Lecornu government" are all the same idea spelled
 * three ways. Guessing one favourite spelling finds Italy and misses Poland.
 */
const CABINET_NOUNS = ['cabinet', 'Cabinet', 'government', 'Government', 'ministry']
const CABINET_ORDINAL_WORDS = ['', 'First', 'Second', 'Third', 'Fourth']
const CABINET_ORDINAL_ROMAN = ['', 'II', 'III', 'IV']

/** How far a `successor` chain is followed before giving up. */
const SUCCESSION_HOPS = 6

const CABINET_BOX = /\{\{\s*Infobox government cabinet/i

const surnameOf = (name: string | undefined): string =>
  (name ?? '')
    .replace(/\(.*?\)/g, '')
    .trim()
    .split(/\s+/)
    .slice(-1)[0] ?? ''

const cabinetTitles = (english: string, leaders: (string | undefined)[]): string[] => {
  const titles: string[] = []
  for (const leader of leaders) {
    const surname = surnameOf(leader)
    if (!surname) continue
    for (const noun of CABINET_NOUNS) {
      for (const ordinal of CABINET_ORDINAL_WORDS)
        titles.push(`${ordinal} ${surname} ${noun}`.replace(/\s+/g, ' ').trim())
      for (const roman of CABINET_ORDINAL_ROMAN)
        titles.push(`${surname} ${roman} ${noun}`.replace(/\s+/g, ' ').trim())
    }
    if (leader) titles.push(`Cabinet of ${leader}`, `Government of ${leader}`)
  }
  titles.push(`Cabinet of ${english}`, `Government of ${english}`)
  return [...new Set(titles)]
}

/**
 * A cabinet article outlives its cabinet: "First Tusk cabinet" is a real page
 * about a government that fell in 2011. Dealing it would name a party that left
 * office nineteen years ago, so a dissolution date disqualifies the article and
 * `successor` points at what replaced it.
 *
 * The exception is a recommissioned leader, where the field reads
 * "First: <date> Second: Incumbent" — France's Lecornu. Still live.
 */
const cabinetIsLive = (fields: Record<string, string>): boolean => {
  const dissolved = plainText(fields.date_dissolved ?? '')
  if (/\b(incumbent|present)\b/i.test(dissolved)) return true
  if (dissolved) return false
  const successor = plainText(fields.successor ?? '').toLowerCase()
  return !successor || /\b(incumbent|tbd|present)\b/.test(successor)
}

/**
 * Confidence-and-supply backers, which the infobox writes into the status line
 * rather than into `political_parties`: Sweden's reads "Minority government;
 * confidence and supply from Sweden Democrats". They are neither government nor
 * opposition, and flattening them into either is the mistake this field exists
 * to prevent.
 */
const SUPPORT_PHRASE =
  /(?:confidence[\s-]and[\s-]supply|support(?:ed)?)\]*\s+(?:from|by|of)\s+(.+)$/is

/**
 * `political_parties` is a LIST, not prose, and every cabinet writes it with a
 * different pile of templates: `{{Color box|Renaissance}} RE`, `{{plainlist|
 * * … }}`, `{{ubl|…}}`, and — Sweden's — templates NESTED two deep, as
 * `{{Legend inline|{{party color|Moderate Party}}}}[[Moderate Party]]`.
 *
 * The wikilink is the name worth reading. It survives every one of those
 * shapes, it is the party's own article title rather than an abbreviation, and
 * it needs no template vocabulary to be kept up to date: reading templates
 * instead got 4 of 25, because a nested one captures the inner template's name.
 *
 * What the links must be filtered for is the OTHER thing cabinets link — the
 * kind of government ("Majority government", "Coalition government") and, in
 * South Africa's case, the opposition leader by name.
 */
const NOT_A_PARTY =
  /\b(majority|minority|coalition|caretaker|unity|technocratic|interim)\b|government$|^list of|^\d{4}\b/i

/** The party inside `{{Legend inline|{{party color|Sweden Democrats}}}}` — the
 *  status line names its backers this way and never links them. */
const COLOUR_TEMPLATE =
  /\{\{\s*(?:party[\s_]colou?r|colou?r[\s_]box|colou?r[\s_]test)\s*\|\s*([^|}]+)/gi

const partyNames = (value: string): string[] => {
  const names = [...value.matchAll(/\[\[([^\]|]+)/g)]
    .map(match =>
      // "Christian Democrats (Sweden)" — the disambiguator is not the name,
      // but "Lega (political party)" needs it dropped too, so drop it always
      // and let the roster matcher rejoin on what is left.
      (match[1] ?? '').replace(/\s*\([^)]*\)\s*$/, '').trim()
    )
    .filter(name => name.length > 1 && !NOT_A_PARTY.test(name))
  if (names.length) return [...new Set(names)]

  // No links: the colour templates name the party too, and the status line's
  // confidence-and-supply backers are written ONLY that way.
  const tinted = [...value.matchAll(COLOUR_TEMPLATE)]
    .map(match => (match[1] ?? '').replace(/\s*\([^)]*\)\s*$/, '').trim())
    .filter(name => name.length > 1 && !NOT_A_PARTY.test(name))
  if (tinted.length) return [...new Set(tinted)]

  // Neither: split the list markup and read what is left as prose.
  return [
    ...new Set(
      value
        .split(/\n|\*|<br\s*\/?>|\s*\/\s*|(?<![A-Z])\s*,\s*|\s+and\s+/i)
        .map(part =>
          plainText(part)
            .replace(/\s*\([^)]*\)\s*$/, '')
            .trim()
        )
        .filter(
          part =>
            part.length > 1 &&
            !NOT_A_PARTY.test(part) &&
            !/^(see|and|with|support(ed)?( by| from)?)\b/i.test(part)
        )
    ),
  ]
}

const readCabinet = (article: string, text: string): Cabinet | undefined => {
  const match = CABINET_BOX.exec(text)
  if (!match) return undefined
  const fields = templateFields(templateAt(text, match.index))
  if (!cabinetIsLive(fields)) return undefined

  // The status line carries the backers, and it carries them in the same
  // templates — so cut the phrase out of the RAW field, before stripping.
  const rawStatus = fields.legislature_status ?? ''
  const status = plainText(rawStatus) || undefined
  const backing = SUPPORT_PHRASE.exec(rawStatus)?.[1] ?? ''
  const names = partyNames

  return {
    article,
    head: plainText(fields.government_head ?? '') || undefined,
    governing: names(fields.political_parties ?? ''),
    backing: names(backing),
    ...(status ? { status } : {}),
  }
}

// --- Run ----------------------------------------------------------------------

/** Article wikitext is stable between elections and the parse is the part that
 *  changes, so cache the text and iterate on the reader for free. */
const cache: Record<string, string> =
  force || !existsSync(CACHE_PATH) ? {} : JSON.parse(readFileSync(CACHE_PATH, 'utf8'))

const wikitext = async (article: string): Promise<string> => {
  // A MISS is cached too, as an empty string. The cabinet search tries ~50
  // candidate titles per country and most of them do not exist; recording only
  // the hits meant every rerun refetched two thousand known-absent pages, which
  // is the whole runtime. `in` rather than truthiness, so '' counts as known.
  if (article in cache) return cache[article]
  const response = await fetchJson<{ parse?: { wikitext?: { '*'?: string } } }>(
    `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(
      article
    )}&prop=wikitext&format=json&redirects=1`
  )
  const text = response?.parse?.wikitext?.['*'] ?? ''
  cache[article] = text
  await wait(200)
  return text
}

/**
 * The live cabinet for a country, or nothing. Two passes, because a title guess
 * lands on a real article far more often than it lands on the CURRENT one: try
 * the naming shapes, then walk `successor` forward from whatever it found until
 * a cabinet with no dissolution date turns up.
 */
const findCabinet = async (isoCode: ISOCountryCode): Promise<Cabinet | undefined> => {
  const english = COUNTRIES[isoCode]?.name.english
  if (!english) return undefined
  const leaders = LEADERS[isoCode]
  const titles = cabinetTitles(english, [
    leaders?.headOfGovernment?.name,
    leaders?.headOfState?.name,
  ])

  let entry: string | undefined
  for (const title of titles) {
    const text = await wikitext(title)
    if (!CABINET_BOX.test(text)) continue
    const cabinet = readCabinet(title, text)
    if (cabinet) return cabinet
    entry ??= title
  }

  // Everything found was historical — follow it forward to the incumbent.
  let title = entry
  const seen = new Set<string>()
  for (let hop = 0; title && hop < SUCCESSION_HOPS; hop += 1) {
    const text = await wikitext(title)
    const match = CABINET_BOX.exec(text)
    if (!match) return undefined
    const cabinet = readCabinet(title, text)
    if (cabinet) return cabinet
    const next = plainText(templateFields(templateAt(text, match.index)).successor ?? '')
      .replace(/\s*\(.*$/, '')
      .trim()
    if (!next || seen.has(next)) return undefined
    seen.add(next)
    title = next
  }
  return undefined
}

let previous: ElectionMapping = {}
try {
  previous = (await import('../data/elections.gen')).ELECTIONS ?? {}
} catch {
  // First run — nothing to merge.
}

const mapping: ElectionMapping = {}
const report: string[] = []

/** Flush after EVERY country, hit or miss — a search that found nothing still
 *  learned which fifty titles do not exist, and that is what makes a rerun cheap. */
const flushCache = () => writeFileSync(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`)

for (const [isoCode, article] of Object.entries(ELECTION_ARTICLES)) {
  if (!isValidISOCode(isoCode)) continue
  const text = await wikitext(article)
  if (!text) {
    report.push(`${isoCode}: could not fetch "${article}"`)
    flushCache()
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

  const cabinet = await findCabinet(isoCode)
  if (cabinet) election.cabinet = cabinet
  else report.push(`${isoCode}: no live cabinet article found`)

  mapping[isoCode] = election
  process.stdout.write(
    `\r  ${Object.keys(mapping).length} chambers, ${
      Object.values(mapping).filter(entry => entry?.cabinet).length
    } with a cabinet`
  )
  flushCache()
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

const cabinets = (Object.entries(mapping) as [ISOCountryCode, Election][]).filter(
  ([, election]) => election.cabinet
)
const withGoverning = cabinets.filter(([, election]) => election.cabinet?.governing.length)
if (cabinets.length < CABINET_FLOOR) {
  throw new Error(
    `Only ${cabinets.length} live cabinets found (floor ${CABINET_FLOOR}) — the title guesses or the succession chase broke.`
  )
}

// The cabinet article names a head of government and so do we; when the two
// disagree, one of them is stale. Ours comes from the Factbook and theirs from
// an article an editor updates within the day, so a disagreement usually means
// WE are behind — worth printing, never worth failing on.
const disagrees = cabinets.filter(([isoCode, election]) => {
  const head = surnameOf(election.cabinet?.head).toLowerCase()
  if (!head) return false
  const ours = [LEADERS[isoCode]?.headOfGovernment?.name, LEADERS[isoCode]?.headOfState?.name]
  return !ours.some(name => surnameOf(name).toLowerCase() === head)
})

writeFileSync(
  REPORT_FILE,
  [
    `chambers: ${countries} of ${Object.keys(ELECTION_ARTICLES).length} seeded`,
    `with vote share: ${withVotes}`,
    `with a live cabinet: ${cabinets.length}`,
    `  naming its governing parties: ${withGoverning.length}`,
    `  naming confidence-and-supply backers: ${
      cabinets.filter(([, election]) => election.cabinet?.backing.length).length
    }`,
    '',
    'cabinet head disagrees with leaders.gen (usually ours is older):',
    ...disagrees.map(
      ([isoCode, election]) =>
        `  ${isoCode}: "${election.cabinet?.head}" in ${election.cabinet?.article}, ours says "${
          LEADERS[isoCode]?.headOfGovernment?.name ?? '—'
        }"`
    ),
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

console.log(
  `\nWrote ${OUTPUT_FILE}: ${countries} chambers, ${withVotes} with vote share, ${cabinets.length} with a live cabinet (${withGoverning.length} naming its governing parties).`
)
console.log(`Review ${REPORT_FILE} before committing.`)
