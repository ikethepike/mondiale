import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { jsonParseLiteral } from './lib/emit'
import { electionBoxes, plainText, templateAt, templateFields } from './lib/wikitext'
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
 * WHY WIKIPEDIA, when better-sounding sources exist. All three alternatives
 * were fetched and measured before settling here:
 *
 *   IPU Parline (api.data.ipu.org) — a real REST/JSON API, 193 lower chambers,
 *     every one with a `last_election` date and 187 with a seat count. It is
 *     the AUTHORITY this file uses for freshness (see the stale-seed check
 *     below), and it validated our chamber sizes exactly. But it carries
 *     composition and summaries only — no per-party seat table — so it cannot
 *     replace the parse.
 *
 *   ParlGov (parlgov.org) — 8,997 rows of party name, vote share, seats and an
 *     expert-coded `left_right` score, free and no auth. Two limits killed it
 *     as a results source: it stops at 2023 (Poland's latest is 2019, three
 *     elections behind) and covers 37 countries, 36 of which we already seed.
 *     Its left-right score would fill a position on only 50 of our 1,461
 *     parties that lack one — worth revisiting if the spectrum modes grow, not
 *     worth a pipeline now.
 *
 *   Wikidata SPARQL — genuinely holds per-party seats (`P991` with a `P1410`
 *     qualifier) and is current to 2026, CC0. But only 37 countries carry it
 *     since 2023, and all but four are ones we already seed, so it buys
 *     coverage we have. Useful as a CROSS-CHECK on a chamber we suspect.
 *
 * CLEA, the deepest constituency-level archive, serves 403 to a scripted
 * fetch — it is a registration-gated bulk download, not a source a generator
 * can pull.
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

/** National vote shares sum to ~100. Rounding and unlisted parties move that a
 *  little; a sum past this means the field is mixing scopes. */
const VOTE_SUM_CEILING = 101

/** 41 of 71 chambers resolve to a live cabinet, 39 of them naming the parties
 *  in it. The cabinet is the only source for who GOVERNS as opposed to who won
 *  seats, so a collapse must fail the run rather than quietly drop the mode
 *  that deals from it. */
const CABINET_FLOOR = 34

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
  /**
   * Seats this election actually renewed, when it renewed only some — the
   * "127" in "127 of the 257 seats". Its presence means `parties[].seats`
   * describe THIS election, not the sitting chamber: the two are only the same
   * number in a chamber that renews whole. Nine seeded chambers stagger
   * (AR, BD, CO, CY, ET, KE, MM, UA, ZM), and a share taken against
   * `totalSeats` there understates every bench.
   */
  contestedSeats?: number
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
  BD: '2026 Bangladeshi general election',
  CD: '2023 Democratic Republic of the Congo general election',
  DZ: '2026 Algerian parliamentary election',
  ET: '2026 Ethiopian general election',
  GH: '2024 Ghanaian general election',
  IQ: '2025 Iraqi parliamentary election',
  KE: '2022 Kenyan general election',
  MA: '2021 Moroccan general election',
  MM: '2020 Myanmar general election',
  MY: '2022 Malaysian general election',
  NG: '2023 Nigerian House of Representatives election',
  NP: '2026 Nepalese general election',
  PK: '2024 Pakistani general election',
  RU: '2021 Russian legislative election',
  SD: '2015 Sudanese general election',
  SN: '2024 Senegalese parliamentary election',
  TH: '2026 Thai general election',
  TN: '2022 Tunisian parliamentary election',
  TZ: '2025 Tanzanian general election',
  UG: '2026 Ugandan general election',
  US: '2024 United States House of Representatives elections',
  VN: '2026 Vietnamese legislative election',
  ZM: '2021 Zambian general election',
  ZW: '2023 Zimbabwean general election',
  AL: '2025 Albanian parliamentary election',
  AR: '2025 Argentine legislative election',
  AT: '2024 Austrian legislative election',
  AU: '2025 Australian federal election',
  BE: '2024 Belgian federal election',
  // Countries that voted twice in a year have a disambiguation stub at the
  // bare "<year> … election" title; the month-qualified article is the real one.
  BG: 'October 2024 Bulgarian parliamentary election',
  BR: '2022 Brazilian general election',
  CA: '2025 Canadian federal election',
  CH: '2023 Swiss federal election',
  CL: '2025 Chilean general election',
  CO: '2026 Colombian parliamentary election',
  CY: '2026 Cypriot legislative election',
  CZ: '2025 Czech parliamentary election',
  DE: '2025 German federal election',
  DK: '2026 Danish general election',
  EE: '2023 Estonian parliamentary election',
  ES: '2023 Spanish general election',
  FI: '2023 Finnish parliamentary election',
  FR: '2024 French legislative election',
  GB: '2024 United Kingdom general election',
  GR: 'June 2023 Greek parliamentary election',
  HR: '2024 Croatian parliamentary election',
  HU: '2026 Hungarian parliamentary election',
  ID: '2024 Indonesian legislative election',
  IE: '2024 Irish general election',
  IL: '2022 Israeli legislative election',
  IN: '2024 Indian general election',
  IS: '2024 Icelandic parliamentary election',
  IT: '2022 Italian general election',
  JP: '2026 Japanese general election',
  KR: '2024 South Korean legislative election',
  LT: '2024 Lithuanian parliamentary election',
  LU: '2023 Luxembourg general election',
  LV: '2022 Latvian parliamentary election',
  MT: '2026 Maltese general election',
  MX: '2024 Mexican general election',
  NL: '2025 Dutch general election',
  NO: '2025 Norwegian parliamentary election',
  NZ: '2023 New Zealand general election',
  PE: '2026 Peruvian general election',
  PH: '2025 Philippine House of Representatives elections',
  PL: '2023 Polish parliamentary election',
  PT: '2025 Portuguese legislative election',
  RO: '2024 Romanian parliamentary election',
  RS: '2023 Serbian parliamentary election',
  SE: '2022 Swedish general election',
  SI: '2026 Slovenian parliamentary election',
  SK: '2023 Slovak parliamentary election',
  TR: '2023 Turkish parliamentary election',
  TW: '2024 Taiwanese legislative election',
  UA: '2019 Ukrainian parliamentary election',
  UY: '2024 Uruguayan general election',
  ZA: '2024 South African general election',
}

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

    // Vote shares that cannot be NATIONAL are dropped rather than shipped.
    // Two article conventions produce them: a minority seat reserved to one
    // constituency prints that constituency's share (Croatia's Serb minority
    // party reads 89%, its Hungarian one 100%), and an autonomous territory's
    // parties print their own territory's (Denmark's Faroese and Greenlandic
    // rows summed the national field to 199%). Either way a "share of the
    // vote" a mode plots would be a lie, and a party with no share is honest.
    const shares = parties.flatMap(party => (party.votePct !== undefined ? [party.votePct] : []))
    const shareSum = shares.reduce((sum, share) => sum + share, 0)
    if (shareSum > VOTE_SUM_CEILING) {
      // Trust the descending head of the list — infoboxes are ordered by
      // result — and drop from the point the running total passes 100.
      let running = 0
      for (const party of parties) {
        if (party.votePct === undefined) continue
        running += party.votePct
        if (running > VOTE_SUM_CEILING) delete party.votePct
      }
    }

    if (parties.length < 2) continue
    const forElection = plainText(fields.seats_for_election ?? '')
    // "127 of the 257 seats in the Chamber of Deputies" — a STAGGERED chamber,
    // where this election renewed only part of the house. Both numbers matter
    // and they mean different things: the seats parsed above are the contested
    // ones, and the chamber is the bigger figure. Reading only the trailing
    // "N seats" took the chamber size and left the contested seats looking
    // like a chamber-wide result — Argentina's 130 of 257 read as a party
    // holding half the house it had actually only half-renewed.
    const staggered = /(\d[\d,]*)\s+of\s+(?:the\s+)?(\d[\d,]*)\s+seats/.exec(forElection)
    const digits = (value: string) => Number(value.replace(/,/g, ''))
    const total = staggered?.[2] ?? /(\d[\d,]*)\s+seats/.exec(forElection)?.[1]
    chambers.push({
      chamber: plainText(fields.election_name ?? '') || undefined,
      ...(total ? { totalSeats: digits(total) } : {}),
      ...(staggered?.[1] ? { contestedSeats: digits(staggered[1]) } : {}),
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
      // The POSSESSIVE, with the leader's full name and with the surname
      // alone. Czechia's cabinet lives at "Petr Fiala's Cabinet" — a real,
      // current article the 47 other shapes never reach, so the country
      // simply had no cabinet.
      if (leader) titles.push(`${leader}'s ${noun}`)
      titles.push(`${surname}'s ${noun}`)
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
  const backing = SUPPORT_PHRASE.exec(rawStatus)?.[1] ?? ''
  // The status field is a phrase with a tail: a supply clause, a citation, a
  // {{Composition bar}}. Only the leading clause names the government's shape
  // ("Minority coalition government"), and the tail arrives as debris on
  // screen — Indonesia's carried a template, the Netherlands' a bare URL.
  const status =
    plainText(rawStatus)
      // A bulleted history ("* Minority (until …) * Majority (since …)") keeps
      // its FIRST entry's shape, not the bullet.
      .replace(/^\s*\*\s*/, '')
      .split(/\s*(?:\/|·|;|\*|\(|\bwith\b|url=|\{\{|<)/i)[0]
      ?.replace(/\s+/g, ' ')
      // Cyprus writes "Coalition minority governmentMinority government" — the
      // same phrase twice, run together by a stripped tag.
      .replace(/\b(\w+ government)\1/i, '$1')
      .trim()
      .slice(0, 60) || undefined
  const names = partyNames

  // A one-party cabinet writes the SINGULAR field: every Westminster and
  // presidential system reaches here with `political_party` and nothing in
  // `political_parties`, so reading only the plural filed the United States,
  // Japan, Canada, Australia and the United Kingdom as governments we could
  // not name. The plural still wins where a coalition writes both.
  const governing = names(fields.political_parties ?? '')

  return {
    article,
    head: plainText(fields.government_head ?? '') || undefined,
    governing: governing.length ? governing : names(fields.political_party ?? ''),
    backing: names(backing),
    ...(status ? { status } : {}),
  }
}

// --- Run ----------------------------------------------------------------------

/** Article wikitext is stable between elections and the parse is the part that
 *  changes, so cache the text and iterate on the reader for free. */
const cache: Record<string, string> =
  force || !existsSync(CACHE_PATH) ? {} : JSON.parse(readFileSync(CACHE_PATH, 'utf8'))

/**
 * When each known-absent title was last checked.
 *
 * A cached MISS is the whole reason a rerun is cheap — the cabinet search tries
 * ~50 titles per country and 3,360 of the 3,836 cached entries are empty. But
 * an absent article is only absent TODAY: Wikipedia gains cabinet pages, and a
 * permanent negative meant a country whose article appeared later stayed
 * cabinet-less forever with no way to notice short of `--force`, which throws
 * away 26MB of good pages to re-learn a handful of misses.
 *
 * So misses expire and hits do not. A hit is a real article whose wikitext
 * barely moves between elections; a miss is a guess that may simply be early.
 * Kept in a sidecar so the existing cache format is untouched — an entry with
 * no stamp is treated as due, which is exactly right for the 3,360 already
 * banked.
 */
const MISS_TTL_DAYS = 30
const MISS_STAMP_PATH = 'generators/data/election-miss-stamps.json'
const missStamps = new Map<string, number>(
  Object.entries<number>(
    force || !existsSync(MISS_STAMP_PATH) ? {} : JSON.parse(readFileSync(MISS_STAMP_PATH, 'utf8'))
  )
)
const missIsFresh = (article: string): boolean => {
  const stamped = missStamps.get(article)
  if (!stamped) return false
  return Date.now() - stamped < MISS_TTL_DAYS * 24 * 60 * 60 * 1000
}

const wikitext = async (article: string): Promise<string> => {
  // `in` rather than truthiness, so a cached '' counts as known — but a miss is
  // only trusted while its stamp is fresh, or an article that appeared since
  // would never be found again.
  if (article in cache && (cache[article] || missIsFresh(article))) return cache[article]
  const response = await fetchJson<{ parse?: { wikitext?: { '*'?: string } } }>(
    `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(
      article
    )}&prop=wikitext&format=json&redirects=1`
  )
  const text = response?.parse?.wikitext?.['*'] ?? ''
  cache[article] = text
  // Stamp the miss so it expires; a hit needs no stamp, and clearing any old
  // one keeps the sidecar from growing entries for pages that now exist.
  if (text) missStamps.delete(article)
  else missStamps.set(article, Date.now())
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
/**
 * Chambers THIS run actually parsed. The backfill below restores anything a
 * transient failure dropped, which is right — but it also means `mapping`'s
 * size says nothing about whether this run worked. Counting it for the floor
 * made the guard unfireable: a total outage restored all 71 previous chambers
 * and passed a floor of 40.
 */
const readThisRun = new Set<ISOCountryCode>()
const report: string[] = []

/** Flush after EVERY country, hit or miss — a search that found nothing still
 *  learned which fifty titles do not exist, and that is what makes a rerun cheap. */
const flushCache = () => {
  writeFileSync(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`)
  writeFileSync(MISS_STAMP_PATH, `${JSON.stringify(Object.fromEntries(missStamps), null, 2)}\n`)
}

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

  // Coverage is judged against what this election CONTESTED, not the whole
  // chamber. Measuring a staggered election against the full house made every
  // one of them look like a bad parse (Argentina 51%, Cyprus 70%) and let a
  // genuinely truncated one hide in the same band.
  const held = election.parties.reduce((total, party) => total + party.seats, 0)
  const against = election.contestedSeats ?? election.totalSeats
  if (against && held / against < SEAT_COVERAGE_FLOOR) {
    report.push(`${isoCode}: only ${held}/${against} seats accounted for — parse is suspect`)
    continue
  }
  if (against && held > against) {
    report.push(`${isoCode}: ${held} seats exceed the ${against} contested`)
    continue
  }

  const cabinet = await findCabinet(isoCode)
  if (cabinet) election.cabinet = cabinet
  else report.push(`${isoCode}: no live cabinet article found`)

  mapping[isoCode] = election
  readThisRun.add(isoCode)
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
const withVotes = Object.values(mapping).filter(election =>
  election?.parties.some(party => party.votePct !== undefined)
).length
const cabinets = (Object.entries(mapping) as [ISOCountryCode, Election][]).filter(
  ([, election]) => election.cabinet
)
const withGoverning = cabinets.filter(([, election]) => election.cabinet?.governing.length)

/**
 * EVERY guard runs before the write, not around it.
 *
 * The cabinet floor used to sit AFTER `writeFileSync`, so a run where the
 * cabinet search broke — a Wikipedia title convention changing, the succession
 * chase failing — threw an error only once it had already overwritten
 * elections.gen.ts with 71 cabinet-less chambers. The message said the run
 * failed; the file on disk said otherwise, and the backfill could not help
 * because `mapping[iso]` WAS set, just without its cabinet.
 *
 * The floors judge THIS run. `mapping` is backfilled from the previous file so
 * a transient failure cannot erase a chamber, which means its size cannot tell
 * a working run from a dead one.
 */
if (readThisRun.size < COUNTRY_FLOOR) {
  throw new Error(
    `Only ${readThisRun.size} chambers parsed this run (floor ${COUNTRY_FLOOR}) — ` +
      `refusing to rewrite from ${countries} carried-over entries.`
  )
}
const freshCabinets = [...readThisRun].filter(isoCode => mapping[isoCode]?.cabinet).length
if (freshCabinets < CABINET_FLOOR) {
  throw new Error(
    `Only ${freshCabinets} live cabinets found this run (floor ${CABINET_FLOOR}) — ` +
      `the title guesses or the succession chase broke.`
  )
}

writeFileSync(
  OUTPUT_FILE,
  `// Generated by generators/create-elections-file.ts — do not edit by hand.
import type { ElectionMapping } from '../generators/create-elections-file'

export const ELECTIONS: ElectionMapping = ${jsonParseLiteral(mapping)}
`
)

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

/**
 * Which seeds an election has overtaken, according to the IPU.
 *
 * The seed list is hand-maintained, and that is exactly how it rots: countries
 * keep voting whether or not anyone edits this file. An audit found 21 of 71
 * chambers serving superseded results — Iraq's 2021 against a 2025 vote,
 * France's 2022 against 2024 — and every one was a wrong answer presented to a
 * player as fact.
 *
 * The authority is the Inter-Parliamentary Union's Parline API: one request,
 * 269 chambers, and a real `last_election` DATE. A Wikipedia title search found
 * this first but missed six more (Japan, Argentina, Czechia, Nepal, Tanzania,
 * Algeria) and could not tell a held election from a scheduled one — Sweden's
 * "2026 Swedish general election" article was written months before the
 * September vote, and its seat fields are poll projections. A date cannot make
 * that mistake.
 *
 * It only WARNS. Choosing the replacement article stays a human's call; this
 * refuses to let a stale seed go unnoticed.
 */
type ParlineChamber = {
  id: string
  attributes?: { last_election?: unknown }
}
/** Parline nests values in dated validity windows, sometimes two deep. */
const parlineCurrent = (value: unknown): string | undefined => {
  if (Array.isArray(value)) {
    const windows = value.filter((entry): entry is Record<string, unknown> => !!entry)
    if (!windows.length) return undefined
    const today = new Date().toISOString().slice(0, 10)
    const live = windows.filter(entry => String(entry.date_to ?? '9999') >= today)
    return parlineCurrent((live.length ? live : windows)[windows.length - 1]?.value)
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record.from === 'string') return record.from.slice(0, 10)
    return parlineCurrent(record.value)
  }
  return typeof value === 'string' ? value : undefined
}

const staleSeeds: string[] = []
{
  const parline = await fetchJson<{ data?: ParlineChamber[] }>(
    'https://api.data.ipu.org/v1/chambers?page%5Bsize%5D=300'
  )
  const held = new Map<string, string>()
  for (const chamber of parline?.data ?? []) {
    // Lower chambers only — the house that forms governments, and the one
    // ELECTION_ARTICLES seeds.
    if (!chamber.id.includes('-LC')) continue
    const date = parlineCurrent(chamber.attributes?.last_election)
    if (date) held.set(chamber.id.slice(0, 2), date)
  }
  for (const [isoCode, article] of Object.entries(ELECTION_ARTICLES)) {
    const dealt = Number(/^(\d{4})/.exec(article)?.[1] ?? 0)
    const theirs = held.get(isoCode)
    if (!dealt || !theirs) continue
    if (Number(theirs.slice(0, 4)) > dealt) {
      staleSeeds.push(`${isoCode}: dealing ${dealt}, IPU says the last election was ${theirs}`)
    }
  }
}
if (staleSeeds.length) {
  console.warn(`\nSEEDS AN ELECTION HAS OVERTAKEN (${staleSeeds.length}):`)
  for (const line of staleSeeds) console.warn(`  ${line}`)
  console.warn("  Find the newer article's title and move the seed.")
}

console.log(
  `\nWrote ${OUTPUT_FILE}: ${countries} chambers, ${withVotes} with vote share, ${cabinets.length} with a live cabinet (${withGoverning.length} naming its governing parties).`
)
console.log(`Review ${REPORT_FILE} before committing.`)
