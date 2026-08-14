import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname } from 'node:path'
import { successfulCombinations } from './link-mapping.gen'
import { jsonParseLiteral } from './lib/emit'
import { decodeHtmlEntitiesDeep } from '../lib/generators/factbook'
import {
  fetchImageLicence,
  fetchJson,
  saveCommonsImage,
  wait,
  writeWebp,
} from './vendors/wikidata/commons'
import { infoboxLogo } from './lib/wikitext'
import { type ISOCountryCode, isValidISOCode } from '../types/geography.types'
import type { CountryParties, Party, PartyMapping } from '../types/party.types'
import { COUNTRIES } from '../data/countries.gen'
import { partyTokens } from '../lib/parties'

/**
 * SUPERSEDED. The live roster is built by `create-polity-file.ts`.
 *
 * This generator produced `data/parties.gen.ts` from the CIA Factbook until
 * 2026-08-14. It now writes `data/parties-factbook.gen.ts` instead — the
 * frozen breadth snapshot the polity generator merges from — because pointing
 * it at the live path meant one `bun run generate:parties` would overwrite
 * polity's roster and silently revert the migration.
 *
 * Kept rather than deleted for one reason: the factbook/factbook.json mirror
 * stopped updating its DATA on 2026-01-22 (every commit since is a README
 * edit), so a snapshot regenerated today would be byte-identical and the
 * parsing work behind it is not repeatable if thrown away. Do not run it
 * expecting fresh data.
 */

/**
 * Every country's political parties, from the CIA Factbook's roster, enriched
 * with Wikidata's ideology/colour/founding and Commons logos.
 *
 * The Factbook is the SPINE, not Wikidata: it names parties for 233 countries
 * (~2,278 entries) on one editorial standard, where Wikidata's own party
 * coverage is Europe-skewed and mixes live parties with dissolved ones. So the
 * roster is whatever the Factbook lists, and Wikidata only ever DECORATES a
 * name it can confidently match. An unmatched party keeps its name and loses
 * its colour — it is never dropped, and never guessed at.
 *
 * Matching is the whole risk here. A bare name search returns a Serbian party
 * for Somalia's "Justice and Reconciliation Party" and a Nigerian SUPREME
 * COURT CASE for "Africa Democratic Congress". Three gates, all of which the
 * repo already applies elsewhere:
 *   1. P17 country must equal the country we are resolving for (the same
 *      disambiguation `resolveQidBySearch` does for cities)
 *   2. P31 must be a political party — that is what rejects the court case
 *   3. P576 (dissolved) rejects the entry outright — a defunct party under a
 *      live party's name is worse than no match at all
 * Measured on a global sample: 78% resolve to the right country, 73% survive
 * the defunct gate. The ~25% that fail resolve to a bare name, which is a
 * usable roster entry — they simply never carry a colour or an ideology.
 *
 * Seat share is COMPUTED, never parsed: the Factbook publishes seats and no
 * percentages at all. It is computed against the sum of listed seats rather
 * than the chamber's declared size, because the two disagree often enough
 * (Malta lists 79 against a declared 65, Sierra Leone 135 against 149 — bonus
 * and appointed seats) that dividing by the declared total would print shares
 * that do not add to 100. Both numbers are kept so a view can say which it
 * means, and a country whose sums diverge past SEAT_SUM_TOLERANCE is reported
 * for review rather than silently shipped.
 *
 * Logos are trademarked far more often than leader portraits are: Commons
 * carries a machine-readable `Restrictions` field saying so, and it is stored
 * per logo so a view can decline to show one rather than the generator having
 * to guess a blanket policy.
 *
 *   bun run generate:parties [--force]
 *
 * Hand-run, like the other curated media pipelines — it is ~2,278 name
 * searches plus an image pass, which is not a weekly-cron shape.
 */

const OUTPUT_FILE = 'data/parties-factbook.gen.ts'
const OUTPUT_DIRECTORY = 'public/parties'
/** The URL prefix `public/parties` is served from. */
const PUBLIC_BASE = 'parties'
const REPORT_FILE = 'generators/data/parties-report.txt'
/** Logos are wordmarks — they read at a fraction of a portrait's width. */
const LOGO_WIDTH = 512
/** Under this an image is flat colour — a flag, not a party mark. */
const FLAT_IMAGE_BYTES = 1100
/** Where a hand-supplied source image lives, keyed `${iso}-${qid}`. */
const LOCAL_LOGO_DIRECTORY = 'generators/data/party-logos'

/**
 * Logos supplied by the party itself, for marks Commons does not carry freely.
 *
 * Commons hosting is the harvest's licence test, so a party whose emblem is
 * only ever published on its own site resolves to nothing however the search
 * is widened — Sweden's Miljöpartiet is the case that forced this, where P154
 * reached Norway's similarly-named Miljøpartiet instead.
 *
 * The source file is checked in beside this table so a regeneration rebuilds
 * it rather than silently dropping back to the gap. These are NOT free files:
 * each one is stamped `nonFree` with its provenance, which is what keeps the
 * licence question visible to `data-sanity.test.ts` instead of passing quietly.
 */
const LOCAL_LOGOS: {
  [key: string]: { file: string; credit: string; license: string }
} = {
  'SE-Q213451': {
    file: 'SE-Q213451.jpg',
    credit: 'Miljöpartiet de gröna',
    license: 'Party trademark, used to identify the party',
  },
}
/** Q7278 = political party; the P31 gate that rejects court cases and coalitions. */
const POLITICAL_PARTY = 'Q7278'
/** Listed seats vs the declared chamber size may differ by this much before
 *  the country is flagged. Bonus/appointed seats make small gaps normal. */
const SEAT_SUM_TOLERANCE = 0.1
/** A partial Factbook fetch parses fine; refuse to write one. */
const COUNTRY_FLOOR = 180

const force = process.argv.includes('--force')

/**
 * The resolution cache. The roster pass is ~2,278 parties x two round-trips,
 * which is a ~45-minute run — far too slow to re-pay every time a downstream
 * field or the logo pass changes. So every lookup's OUTCOME is cached, misses
 * included: the 44% that resolve to nothing are the expensive ones (they cost
 * a full search + entity fetch before failing), and not caching them would
 * leave most of the runtime in place.
 *
 * Keyed on the search terms, the country AND the party's seat count. The seats
 * are in the key deliberately: they are the one field that moves on an
 * election, and a stale entry that kept a party's pre-election seats while the
 * Factbook had moved on would be invisible — the run would look like a clean
 * cache hit. Anything that changes a party's standing therefore re-resolves it,
 * and a party renamed in the Factbook re-resolves for the same reason.
 *
 * Claims are stored alongside the Q-id so a re-run needs no network at all;
 * `--refresh-matches` re-asks Wikidata without discarding the saved logos the
 * way `--force` does.
 */
const MATCH_CACHE_PATH = 'generators/data/party-match-cache.json'
/**
 * Only the properties this generator reads are cached. A party's full claims
 * run to 19MB across the roster — most of it sitelinks and identifiers we
 * never touch — where the five we use are 3MB. The cache is committed so a
 * teammate's first run is fast too, and a 19MB file in a repo whose history is
 * already media-heavy is not worth the bytes.
 */
// P576 (dissolved) is stored even though nothing DISPLAYS it: it is the gate
// `firstAcceptable` rejects a defunct party on, and a cached hit replays
// without re-running the gates. Left out, a party that dissolves after being
// cached keeps its accept forever — the cache key is
// `country|endonym|name|seats`, so nothing about a dissolution invalidates it.
const CACHED_PROPERTIES = ['P1142', 'P1387', 'P465', 'P571', 'P154', 'P463', 'P576'] as const
const slimClaims = (claims: { [property: string]: Snak[] }): { [property: string]: Snak[] } =>
  Object.fromEntries(
    CACHED_PROPERTIES.filter(property => claims[property]).map(property => [
      property,
      claims[property]!,
    ])
  )
type CachedMatch =
  { qid: string; claims: { [property: string]: Snak[] }; label?: string } | { miss: true }
const matchKeyFor = (
  name: string,
  endonym: string | undefined,
  countryQid: string,
  seats: number | undefined
) => `${countryQid}|${endonym ?? ''}|${name}|${seats ?? ''}`

/** Q-id → English label. Stable enough to keep across runs; ideologies repeat
 *  heavily (every social-democratic party points at the same Q-id). */
const LABEL_CACHE_PATH = 'generators/data/party-label-cache.json'

const refreshMatches = process.argv.includes('--refresh-matches')
const labelCache: Record<string, string> =
  force || refreshMatches || !existsSync(LABEL_CACHE_PATH)
    ? {}
    : JSON.parse(readFileSync(LABEL_CACHE_PATH, 'utf8'))
const matchCache: Record<string, CachedMatch> =
  force || refreshMatches || !existsSync(MATCH_CACHE_PATH)
    ? {}
    : JSON.parse(readFileSync(MATCH_CACHE_PATH, 'utf8'))
const cacheHitsAtStart = Object.keys(matchCache).length

export type { Party, CountryParties, PartyMapping }

// --- Factbook helpers -------------------------------------------------------

interface FactbookField {
  text?: string
}
interface FactbookGovernment {
  'Political parties'?: FactbookField
  'Legislative branch'?: {
    'legislature name'?: FactbookField
    'legislative structure'?: FactbookField
    'number of seats'?: FactbookField
    'most recent election date'?: FactbookField
    'parties elected and seats per party'?: FactbookField
  }
}

/**
 * The Factbook prints "Center Party (Centerpartiet) or C" — an English gloss,
 * the party's own name, and an abbreviation. All three are worth keeping: the
 * ENDONYM is the better Wikidata search key, because Wikidata files parties
 * under their native name and the Factbook's anglicisation is often a spelling
 * Wikidata never uses ("Center Party" surfaces nothing Swedish; "Centerpartiet"
 * hits Q110832 first).
 */
const splitName = (raw: string): { name: string; endonym?: string; abbreviation?: string } => {
  const cleaned = raw
    .replace(/<[^>]+>/g, ' ')
    // "…or MPLA; note - ruling party since 1975" — the tail is commentary.
    .replace(/;\s*note\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  const trailing = /\s+or\s+([A-Z0-9][A-Za-z0-9\-/.]*)$/.exec(cleaned)
  const withoutTail = trailing ? cleaned.slice(0, trailing.index) : cleaned
  const parenthetical = /\s*\(([^)]*)\)\s*$/.exec(withoutTail)
  const name = (parenthetical ? withoutTail.slice(0, parenthetical.index) : withoutTail).trim()
  // A parenthetical is only an endonym if it reads like a name, not a gloss
  // ("an active political group", "formerly the Republican Party").
  const inner = parenthetical?.[1]?.trim()
  const endonym =
    inner && inner.split(/\s+/).length <= 5 && !/^(an?|the|formerly|now|previously)\b/i.test(inner)
      ? inner
      : undefined
  return { name, endonym, abbreviation: trailing?.[1] ?? undefined }
}

/** Prose the Factbook files under "Political parties" that is commentary, not
 *  a party: Afghanistan's "the Taliban Government enforces an authoritarian
 *  state and has banned other political parties". Real party names are short. */
const isProse = (name: string) => name.split(/\s+/).length > 9 || /^the\s/i.test(name)

/** Belgium and a few others group their roster under headings — "Flemish
 *  parties:", "Francophone parties:". A heading is not a party, and left in it
 *  outranks the real entry when a leader's party is joined by name. */
const isHeading = (name: string) => /\bparties\s*:\s*$/i.test(name.trim())

/** Party names come as one `<br>`-separated blob, sometimes with a trailing
 *  "note:" line that is prose, not a party. */
const partyNames = (text: string): { name: string; endonym?: string; abbreviation?: string }[] =>
  text
    .split(/<br\s*\/?>/i)
    .map(splitName)
    .filter(
      entry =>
        entry.name && !/^note\b/i.test(entry.name) && !isProse(entry.name) && !isHeading(entry.name)
    )

/** "Labour Party (LP) (44); Nationalist Party (PN) (35)" → seats by party.
 *  The trailing `(44)` is the seat count; an inner `(LP)` is the abbreviation,
 *  so only the LAST parenthesis may be read as a number. */
const seatsByParty = (text: string): { name: string; seats: number }[] => {
  const rows: { name: string; seats: number }[] = []
  for (const segment of text.replace(/<[^>]+>/g, ' ').split(';')) {
    const match = /^\s*(.+?)\s*\((\d+)\)\s*$/.exec(segment.trim())
    if (!match) continue
    const { name } = splitName(match[1] ?? '')
    if (name) rows.push({ name, seats: Number(match[2]) })
  }
  return rows
}

const firstNumber = (text?: string): number | undefined => {
  const match = /(\d[\d,]*)/.exec(text?.replace(/,/g, '') ?? '')
  return match ? Number(match[1].replace(/,/g, '')) : undefined
}

/**
 * Names are matched loosely between the two Factbook fields, which are written
 * by different hands and disagree constantly: Sweden's roster says "Swedish
 * Social Democratic Party" where its seat table says "Social Democratic Party",
 * and "Center Party" where the table says "Centre Party". Exact equality drops
 * the largest party in parliament, which is why every share summed short.
 *
 * So the key is aggressive: spelling variants folded, and the words that
 * decorate a party name rather than identify it ("party", the demonym) removed
 * altogether. The residue is what actually distinguishes one party from
 * another in the same country.
 */
const NOISE = /\b(party|parties|the|of|for|and|alliance|coalition)\b/g
/**
 * `demonyms` strips the country's own adjective — Sweden's roster says
 * "Swedish Social Democratic Party" where its seat table says "Social
 * Democratic Party", and that prefix alone was losing the largest party in
 * parliament. Demonyms come from `COUNTRIES[iso].name.demonyms`, the same
 * Factbook nationality field `mentionsCountry` uses, rather than a second list
 * kept in sync by hand.
 */
const matchKey = (name: string, demonyms: string[] = []) => {
  let value = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\blabour\b/g, 'labor')
    .replace(/\bcentre\b/g, 'center')
    .replace(/\bdemocratic\b/g, 'democrat')
  for (const demonym of demonyms) {
    const cleaned = demonym.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    if (cleaned.length >= 4) value = value.replace(new RegExp(`\\b${cleaned}\\b`, 'g'), ' ')
  }
  return value.replace(NOISE, ' ').replace(/[^a-z0-9]+/g, '')
}

/** Rows the Factbook uses to balance a seat table that are not parties. */
/**
 * Rows the Factbook prints in a party list that are not parties: the balancing
 * "Other"/"Independents" lines of a seat table, and the placeholders a country
 * with no party politics gets ("none" is the Vatican's entire roster).
 *
 * Applied to the ROSTER as well as the seat table. It was only ever tested
 * against seats, so "none", "Independents" and "Independent" shipped as
 * dealable subjects — a mode could ask which country "none" governs.
 */
const NOT_A_PARTY =
  /^(other|others|independents?|vacant|appointed|nominated|unaffiliated|none|n\/a|various)$/i

/**
 * The Factbook lists electoral coalitions alongside parties, and its ENDONYM
 * field says so in plain words ("electoral coalition led by PD", "coalition of
 * 5 parties"). A bloc dealt as a single party is a wrong answer everywhere it
 * lands: Rulers asks which logo is not a ruling party, and Albania's answer was
 * an alliance rather than a party at all.
 *
 * Matched on the endonym, NEVER the name. 161 legitimate parties are simply
 * CALLED a coalition or alliance — Finland's National Coalition Party, Poland's
 * Civic Coalition, Australia's Centre Alliance — and a name-based screen would
 * take all of them.
 */
const DECLARED_COALITION =
  /(electoral (coalition|alliance)|coalition (of|includes|led by)|alliance of (several|the)\b|\scoalition\s*$)/i

const isDeclaredCoalition = (endonym: string | undefined): boolean =>
  !!endonym && DECLARED_COALITION.test(endonym)

// --- Wikidata ---------------------------------------------------------------

interface SearchResponse {
  query?: { search?: { title: string }[] }
}
interface Snak {
  mainsnak?: { datavalue?: { value?: { id?: string; time?: string } | string } }
  /** `P582` is the end date — its presence means the statement is CLOSED. */
  qualifiers?: { P582?: unknown[] }
}
interface EntityResponse {
  entities?: {
    [id: string]: {
      claims?: { [property: string]: Snak[] }
      labels?: { en?: { value: string } }
    }
  }
}

const claimIds = (claims: { [property: string]: Snak[] } | undefined, property: string): string[] =>
  (claims?.[property] ?? [])
    .map(statement => {
      const value = statement.mainsnak?.datavalue?.value
      return typeof value === 'object' ? value?.id : undefined
    })
    .filter((id): id is string => !!id)

/**
 * Ids from statements that have NOT ended. Membership of a transnational
 * grouping is a relationship a party leaves — an ended statement records that
 * it used to belong, which is not what "member of the EPP" means on screen.
 * Same currency gate the leaders generator applies to office-holding.
 */
const openClaimIds = (
  claims: { [property: string]: Snak[] } | undefined,
  property: string
): string[] =>
  (claims?.[property] ?? [])
    .filter(statement => !statement.qualifiers?.P582?.length)
    .map(statement => {
      const value = statement.mainsnak?.datavalue?.value
      return typeof value === 'object' ? value?.id : undefined
    })
    .filter((id): id is string => !!id)

/**
 * Party colours (P465), hex only.
 *
 * Wikidata's colour property is free text often enough to matter: Moldova's
 * National Alternative Movement carries "dark green", which reaches a view as
 * `background: #dark green` and silently paints nothing. A swatch that fails
 * to render is worse than a party with no colour, because the view has already
 * decided to show one.
 */
const HEX_COLOUR = /^[0-9A-Fa-f]{6}$/
const claimColours = (claims: { [property: string]: Snak[] } | undefined): string[] =>
  claimStrings(claims, 'P465').filter(value => HEX_COLOUR.test(value))

const claimStrings = (
  claims: { [property: string]: Snak[] } | undefined,
  property: string
): string[] =>
  (claims?.[property] ?? [])
    .map(statement => statement.mainsnak?.datavalue?.value)
    .filter((value): value is string => typeof value === 'string')

const yearOf = (claims: { [property: string]: Snak[] } | undefined): number | undefined => {
  const value = claims?.P571?.[0]?.mainsnak?.datavalue?.value
  const time = typeof value === 'object' ? value?.time : undefined
  const year = /^[+-](\d{4})/.exec(time ?? '')?.[1]
  const founded = year ? Number(year) : undefined
  // Yemen's Nasserist Unionist People's Organization carried "25". The oldest
  // real party is Britain's Tories; anything before the 1700s is a bad claim
  // or a bad parse, and a reveal reading "founded in 25" is nonsense on screen.
  return founded && founded >= 1700 ? founded : undefined
}

/**
 * The Q-id for a party name, or undefined when nothing passes all three gates.
 * Returning undefined is a perfectly good outcome — the party keeps its name.
 */
type PartyMatch = {
  qid: string
  claims: { [property: string]: Snak[] }
  /** The entity's own English label — what a contested claim is judged on. */
  label?: string
}

/**
 * How well a roster name fits an entity's own label, 0–1 (token Jaccard).
 *
 * This is what settles a contested entity. Two roster rows can be handed names
 * close enough that Wikidata's search returns ONE entity for both — Albania's
 * "Social Democratic Party" and "Socialist Party" both resolved to Q642882
 * ("Socialist Party of Albania"). First-come-first-served answered that by
 * roster order, which handed the entity to the wrong party and left the
 * country's actual GOVERNING party bare. The better name wins instead.
 */
/**
 * A cached hit, re-gated. The cache replays a decision made on an earlier run
 * WITHOUT re-running `firstAcceptable`, so any gate whose answer can change
 * over time has to be re-applied on the way out. Dissolution is the one that
 * can: a live party cached today is a defunct party tomorrow, and its key
 * (`country|endonym|name|seats`) contains nothing that a dissolution moves.
 */
const stillAcceptable = (match: PartyMatch | undefined): PartyMatch | undefined =>
  match?.claims?.P576?.length ? undefined : match

const labelFit = (name: string, label: string | undefined, isoCode: ISOCountryCode): number => {
  if (!label) return 0
  const wanted = partyTokens(name, isoCode)
  const theirs = partyTokens(label, isoCode)
  if (!wanted.length || !theirs.length) return 0
  const shared = wanted.filter(token => theirs.includes(token)).length
  return shared / new Set([...wanted, ...theirs]).size
}

/**
 * THE acceptance test, wherever a candidate Q-id comes from. Both routes below
 * run every hit through this — a second copy would be how a list article or a
 * defunct party eventually reaches a player.
 */
const firstAcceptable = (
  qids: string[],
  entities: EntityResponse | undefined,
  countryQid: string,
  taken?: ReadonlySet<string>
): PartyMatch | undefined => {
  for (const qid of qids) {
    const claims = entities?.entities?.[qid]?.claims
    if (!claims) continue
    if (claimIds(claims, 'P17')[0] !== countryQid) continue
    if (!claimIds(claims, 'P31').includes(POLITICAL_PARTY)) continue
    // A dissolved party wearing a live party's name is worse than no match.
    if (claims.P576?.length) continue
    // One entity, one party. Wikidata's search answers with its best guess for
    // whatever it is handed, and two roster rows can be handed names close
    // enough to land on the SAME entity — Barbados' Labor Party and Democratic
    // Labor Party both resolved to Q740420, so two opposing parties ended up
    // wearing one logo and one ideology. Skipping a claimed id lets the second
    // row fall through to its next-best candidate, or miss honestly.
    if (taken?.has(qid)) continue
    // NO minimum-fit gate here, deliberately. It looks obvious — Wikidata's
    // search answered Norway's "Labor Party" with the RED Party — but 275 of
    // 1,703 matches score zero against their label and MOST of those are
    // right: `Vlaams Belang` → "Flemish Interest", `Orinats Yerkir` → "Rule of
    // Law", `Francophone Federalist Democrats` → "DéFI". The label is often a
    // TRANSLATION, so a fit floor punishes exactly the endonym cases this
    // matcher exists to handle. Tried at 0.2: it cost 68 logos to prevent 3
    // bad matches. Fit still decides a CONTESTED entity (see `labelFit`),
    // where both claimants are judged on the same scale.
    return {
      qid,
      claims,
      ...(entities?.entities?.[qid]?.labels?.en?.value
        ? { label: entities.entities[qid]!.labels!.en!.value }
        : {}),
    }
  }
  return undefined
}

const claimsFor = async (qids: string[]): Promise<EntityResponse | undefined> => {
  if (!qids.length) return undefined
  // Labels ride along: they cost nothing extra on a request already being made,
  // and they are what settles which of two parties really owns an entity.
  const entities = await fetchJson<EntityResponse>(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qids.join(
      '|'
    )}&props=claims|labels&languages=en&languagefallback=1&format=json`
  )
  await wait(120)
  return entities
}

const searchOnce = async (
  term: string,
  countryQid: string,
  taken?: ReadonlySet<string>
): Promise<PartyMatch | undefined> => {
  const search = await fetchJson<SearchResponse>(
    `https://www.wikidata.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      term
    )}&srnamespace=0&srlimit=5&format=json`
  )
  const hits = (search?.query?.search ?? []).map(result => result.title)
  if (!hits.length) return undefined
  await wait(120)

  return firstAcceptable(hits, await claimsFor(hits), countryQid, taken)
}

/**
 * Wikidata's own search misses parties that en.wikipedia indexes perfectly
 * well — its title match is unforgiving where the encyclopedia's is not. So
 * ask the encyclopedia and follow its article back to the Q-id.
 *
 * Measured on 60 unmatched parties: every one resolved to SOME Q-id, and half
 * survived the gates. The other half were list articles ("List of political
 * parties in …") and wrong-country matches — which is exactly why the hits go
 * through `firstAcceptable` rather than being trusted.
 */
const searchViaWikipedia = async (
  name: string,
  countryName: string,
  countryQid: string,
  taken?: ReadonlySet<string>
): Promise<PartyMatch | undefined> => {
  const search = await fetchJson<SearchResponse>(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      `${name} ${countryName} political party`
    )}&srlimit=3&format=json`
  )
  const titles = (search?.query?.search ?? []).map(result => result.title)
  if (!titles.length) return undefined
  await wait(120)

  const pages = await fetchJson<{
    query?: { pages?: { [id: string]: { pageprops?: { wikibase_item?: string } } } }
  }>(
    `https://en.wikipedia.org/w/api.php?action=query&prop=pageprops&titles=${encodeURIComponent(
      titles.join('|')
    )}&format=json`
  )
  await wait(120)

  const qids = Object.values(pages?.query?.pages ?? {})
    .map(page => page.pageprops?.wikibase_item)
    .filter((qid): qid is string => !!qid)
  if (!qids.length) return undefined

  return firstAcceptable(qids, await claimsFor(qids), countryQid, taken)
}

const resolveParty = async (
  name: string,
  endonym: string | undefined,
  countryQid: string,
  countryName: string,
  /** Entities already claimed by an earlier party in THIS country. */
  taken: ReadonlySet<string>
): Promise<PartyMatch | undefined> => {
  // The endonym goes FIRST: Wikidata files parties under their native name, so
  // "Centerpartiet" resolves where the Factbook's "Center Party" finds nothing.
  for (const term of [endonym, name].filter((value): value is string => !!value)) {
    const match = await searchOnce(term, countryQid, taken)
    if (match) return match
  }
  // Last resort, and only for names Wikidata's own search could not place.
  return searchViaWikipedia(name, countryName, countryQid, taken)
}

/** Resolve the Q-ids an enriched party points at (ideologies, position) to
 *  English labels, in one batch per run rather than one call per party.
 *  Q-id → label is stable, so previously seen ids are served from the cache. */
const labelsFor = async (ids: string[]): Promise<Map<string, string>> => {
  const labels = new Map<string, string>(Object.entries(labelCache))
  const unique = [...new Set(ids)].filter(id => !labels.has(id))
  for (let index = 0; index < unique.length; index += 50) {
    const batch = unique.slice(index, index + 50)
    const response = await fetchJson<EntityResponse>(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${batch.join(
        '|'
      )}&props=labels&languages=en&languagefallback=1&format=json`
    )
    for (const [qid, entity] of Object.entries(response?.entities ?? {})) {
      const label = entity.labels?.en?.value
      if (label) labels.set(qid, label)
    }
    await wait(200)
  }
  return labels
}

// --- 1. Country Q-ids, by ISO code ------------------------------------------
// Same paginated haswbstatement:P297 walk the leaders generator uses — one
// search for every ISO carrier beats 200 per-country searches against the
// request budget.

console.log('Listing every entity with an ISO 3166-1 alpha-2 code…')
const isoToQid = new Map<string, string>()
{
  const carriers: string[] = []
  let offset: number | undefined = 0
  while (offset !== undefined) {
    const page: (SearchResponse & { continue?: { sroffset: number } }) | undefined =
      await fetchJson<SearchResponse & { continue?: { sroffset: number } }>(
        `https://www.wikidata.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
          'haswbstatement:P297'
        )}&srnamespace=0&srlimit=50&sroffset=${offset}&format=json`
      )
    carriers.push(...(page?.query?.search ?? []).map(hit => hit.title))
    offset = page?.continue?.sroffset
    process.stdout.write(`\r  ${carriers.length} entities`)
    await wait(200)
  }
  console.log()

  /**
   * Batched SMALL, and re-asked one by one when the batch comes back short.
   *
   * `wbgetentities` truncates its response at 12MB and says so only in a
   * `warnings` field — the entities simply are not there. A country entity
   * carries thousands of claims, so a 40-id batch blew the limit and dropped
   * nine countries silently. Argentina, South Africa, South Korea, Greece,
   * Hungary, Morocco, Pakistan, Romania and Taiwan had NO party resolved at
   * all as a result: 143 parties, invisible because a batch was too big.
   */
  const COUNTRY_BATCH = 12
  for (let index = 0; index < carriers.length; index += COUNTRY_BATCH) {
    const batch = carriers.slice(index, index + COUNTRY_BATCH)
    const readInto = (response: EntityResponse | undefined) => {
      for (const [qid, entity] of Object.entries(response?.entities ?? {})) {
        const iso = claimStrings(entity.claims, 'P297')[0]
        if (iso && isValidISOCode(iso) && !isoToQid.has(iso)) isoToQid.set(iso, qid)
      }
      return Object.keys(response?.entities ?? {})
    }
    const entitiesFor = async (ids: string[]) =>
      fetchJson<EntityResponse>(
        `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.join(
          '|'
        )}&props=claims&format=json`
      )

    const returned = new Set(readInto(await entitiesFor(batch)))
    await wait(200)
    // Anything the batch swallowed is re-asked alone, where 12MB is ample.
    for (const qid of batch.filter(id => !returned.has(id))) {
      readInto(await entitiesFor([qid]))
      await wait(200)
    }
  }
}
console.log(`${isoToQid.size} countries mapped to Wikidata ids`)

// --- 2. The Factbook roster --------------------------------------------------
// Transient failures must never ERASE a country an earlier run resolved.
let previous: PartyMapping = {}
try {
  previous = (await import('../data/parties.gen')).PARTIES ?? {}
} catch {
  // First run — nothing to merge.
}

const mapping: PartyMapping = { ...previous }
/**
 * Countries THIS run actually read from the Factbook.
 *
 * `mapping` is seeded from the previous run so a transient failure cannot
 * ERASE a country — which also means its size says nothing about whether this
 * run worked. Counting it for the floor made the guard unfireable: a total
 * outage leaves every fetch returning undefined, every country hitting
 * `continue`, and 192 carried-over entries sailing past a floor of 180. The
 * file would be rewritten from stale data and reported as a clean run.
 */
const readThisRun = new Set<ISOCountryCode>()
const report: string[] = []
let resolved = 0
let attempted = 0
let cacheHits = 0
let liveLookups = 0
/** Rows whose best match was already claimed by an earlier party. */
let collisions = 0
/** Logos rejected as flat flags rather than party marks. */
let flatLogos = 0
/** Logos found on the article but refused on their licence, with the reason. */
const licenceRefusals: string[] = []
/** `${iso}|${qid}` → Commons filename, collected during the roster pass. */
const logoFiles = new Map<string, string>()

for (const { isoCode, url } of successfulCombinations) {
  if (!isValidISOCode(isoCode)) continue
  const countryQid = isoToQid.get(isoCode)

  const page = await fetchJson<{ Government?: FactbookGovernment }>(
    url.replace('github.com', 'raw.githubusercontent.com').replace('/raw/', '/')
  )
  const government = page?.Government ? decodeHtmlEntitiesDeep(page.Government) : undefined
  const roster = government?.['Political parties']?.text
  if (!roster) continue

  const legislative = government?.['Legislative branch']
  const seatRows = legislative?.['parties elected and seats per party']?.text
    ? seatsByParty(legislative['parties elected and seats per party']!.text!)
    : []
  const listedSeats = seatRows.reduce((total, row) => total + row.seats, 0) || undefined
  const declaredSeats = firstNumber(legislative?.['number of seats']?.text)
  // `Other (16)` and `Independents (44)` count toward the chamber — they stay
  // in `listedSeats` so shares are a true fraction — but they are not parties
  // and must never be joined onto one.
  const demonyms = COUNTRIES[isoCode]?.name.demonyms ?? []
  const seatsByKey = new Map(
    seatRows
      .filter(row => !NOT_A_PARTY.test(row.name))
      .map(row => [matchKey(row.name, demonyms), row.seats])
  )

  if (listedSeats && declaredSeats) {
    const drift = Math.abs(listedSeats - declaredSeats) / declaredSeats
    if (drift > SEAT_SUM_TOLERANCE) {
      report.push(
        `${isoCode}: listed seats ${listedSeats} vs declared ${declaredSeats} ` +
          `(${Math.round(drift * 100)}% apart) — shares are of the listed total`
      )
    }
  }

  const parties: Party[] = []
  /**
   * Resolve every row FIRST, then award contested entities — because the right
   * owner is not knowable until every claimant is in.
   *
   * Wikidata's search answers with its best guess for whatever name it is
   * handed, so two roster rows can land on ONE entity: Albania's "Social
   * Democratic Party" and "Socialist Party" both resolved to Q642882
   * ("Socialist Party of Albania"), and Barbados' Labor Party and Democratic
   * Labor Party both to Q740420. Left alone, two opposing parties wear the same
   * logo, ideology and colour.
   *
   * Awarding by roster order was worse than the disease: it handed Q642882 to
   * the Social Democrats and left Albania's actual GOVERNING party bare. The
   * entity goes to whichever name fits its own label best.
   */
  const claims: { party: Party; match: PartyMatch }[] = []
  for (const { name, endonym, abbreviation } of partyNames(roster)) {
    if (NOT_A_PARTY.test(name.trim())) continue
    attempted += 1
    const seats = seatsByKey.get(matchKey(name, demonyms))
    const party: Party = {
      name,
      ...(endonym ? { endonym } : {}),
      ...(abbreviation ? { abbreviation } : {}),
      // Kept in the roster — a bloc really does hold those seats, and the
      // chamber's arithmetic needs them — but marked so no mode can DEAL it
      // as a party. "Which logo is not a ruling party" has no honest answer
      // when the answer is an alliance.
      ...(isDeclaredCoalition(endonym) ? { coalition: true } : {}),
      ...(seats !== undefined ? { seats } : {}),
      ...(seats !== undefined && listedSeats
        ? { seatShare: Number((seats / listedSeats).toFixed(4)) }
        : {}),
    }

    const cacheKey = countryQid ? matchKeyFor(name, endonym, countryQid, seats) : undefined
    const cached = cacheKey ? matchCache[cacheKey] : undefined
    let match: PartyMatch | undefined
    if (cached) {
      match = 'miss' in cached ? undefined : stillAcceptable(cached)
      cacheHits += 1
    } else if (countryQid && cacheKey) {
      match = await resolveParty(
        name,
        endonym,
        countryQid,
        COUNTRIES[isoCode]?.name.english ?? isoCode,
        new Set()
      )
      // Cache the MISS too — it cost a full search plus an entity fetch.
      matchCache[cacheKey] = match
        ? {
            qid: match.qid,
            claims: slimClaims(match.claims),
            ...(match.label ? { label: match.label } : {}),
          }
        : { miss: true }
      liveLookups += 1
    }
    if (match) claims.push({ party, match })
    parties.push(party)
  }

  // Award each entity to its best-fitting claimant; everyone else stays bare.
  const byQid = new Map<string, { party: Party; match: PartyMatch }[]>()
  for (const claim of claims) {
    byQid.set(claim.match.qid, [...(byQid.get(claim.match.qid) ?? []), claim])
  }
  for (const [qid, contenders] of byQid) {
    const ranked = [...contenders].sort(
      (a, b) =>
        labelFit(b.party.name, b.match.label, isoCode) -
        labelFit(a.party.name, a.match.label, isoCode)
    )
    const winner = ranked[0]!
    for (const loser of ranked.slice(1)) {
      report.push(
        `${isoCode}: "${loser.party.name}" also resolved to ${qid} — ` +
          `"${winner.party.name}" fits "${winner.match.label ?? qid}" better, left bare`
      )
      collisions += 1
    }

    const { party, match } = winner
    resolved += 1
    party.qid = match.qid
    // P154 is carried on the match so the logo pass needs no second claims
    // fetch — it already has everything it asks Wikidata for.
    const logoFile = claimStrings(match.claims, 'P154')[0]
    if (logoFile) logoFiles.set(`${isoCode}|${match.qid}`, logoFile)
    const ideologies = claimIds(match.claims, 'P1142')
    const position = claimIds(match.claims, 'P1387')[0]
    const colors = claimColours(match.claims)
    const founded = yearOf(match.claims)
    const groupings = openClaimIds(match.claims, 'P463')
    if (ideologies.length) party.ideologies = ideologies
    if (position) party.position = position
    if (colors.length) party.colors = colors
    if (founded) party.foundedYear = founded
    if (groupings.length) party.groupings = groupings
  }

  mapping[isoCode] = {
    parties,
    ...(legislative?.['legislature name']?.text
      ? { legislature: legislative['legislature name']!.text }
      : {}),
    ...(legislative?.['legislative structure']?.text
      ? { structure: legislative['legislative structure']!.text }
      : {}),
    ...(declaredSeats ? { declaredSeats } : {}),
    ...(listedSeats ? { listedSeats } : {}),
    ...(legislative?.['most recent election date']?.text
      ? { lastElection: legislative['most recent election date']!.text }
      : {}),
  }
  readThisRun.add(isoCode)

  // Flush after every country, not just at the end of the pass. The run is
  // long enough that it WILL sometimes be interrupted (a hung socket, a
  // Ctrl-C), and a cache that only lands on clean completion would be empty
  // in exactly the cases it exists for. Writing ~190 times costs nothing
  // beside the network.
  writeFileSync(MATCH_CACHE_PATH, `${JSON.stringify(matchCache, null, 2)}\n`)

  process.stdout.write(`\r  ${Object.keys(mapping).length} countries, ${resolved} parties matched`)
}
console.log()

// Persist the cache the MOMENT the expensive pass is done — before the label
// and logo passes, either of which can fail on a Commons hiccup. Writing it at
// the end instead would throw away ~45 minutes of lookups on any later crash.
writeFileSync(MATCH_CACHE_PATH, `${JSON.stringify(matchCache, null, 2)}\n`)
console.log(
  `Roster pass: ${cacheHits} cached, ${liveLookups} looked up ` +
    `(cache held ${cacheHitsAtStart} entries at start, ${Object.keys(matchCache).length} now)`
)

// --- 2b. Parties the Factbook roster never listed ---------------------------
/**
 * The election articles seat parties the Factbook does not carry: Iraq's
 * Sadrist Movement holds 73 seats and has no roster entry at all. A third of
 * all benches were landing with no party behind them — no logo, no colour, no
 * ideology — and the largest bloc in 16 chambers was one of them.
 *
 * So any bench name the roster cannot account for is resolved on its own, past
 * the SAME three gates as the roster itself (P17 country, P31 party, no P576).
 * Measured on 40 orphans, 26 resolved and 14 were rejected — the rejects being
 * coalitions, alliances and the "Independents" rows, which are not parties and
 * should not become ones.
 */
const NOT_A_ROSTER_PARTY = /^(independents?|others?|vacant|non-attached|unaffiliated|blank)$/i

/**
 * The roster entry a seated bench already IS, if any — so the adoption pass can
 * tell "we have no such party" from "we have it under another spelling".
 *
 * The chamber seats a party under the ABBREVIATION the Factbook files as a
 * formal name: Indonesia's "Gerindra Party" is the roster's "Great Indonesia
 * Movement Party or GERINDRA", and NasDem its "National Democratic Party".
 * Matching on tokens alone missed those and adopted a SECOND entry for a party
 * already on the roster — the leader join then resolved to one while the bench
 * wore the other, so Indonesia's government could never be named on screen.
 */
const rosterEntry = (isoCode: ISOCountryCode, name: string): Party | undefined => {
  const roster = mapping[isoCode]?.parties ?? []
  const wanted = partyTokens(name, isoCode).join('')
  if (!wanted) return roster[0]
  const bare = name
    .toLowerCase()
    .replace(/\s+part(y|ies)$/, '')
    .trim()
  return roster.find(party => {
    for (const candidate of [party.name, ...(party.endonym ? [party.endonym] : [])]) {
      if (partyTokens(candidate, isoCode).join('') === wanted) return true
    }
    return party.abbreviation ? party.abbreviation.toLowerCase() === bare : false
  })
}

let adopted = 0
let enriched = 0
// The seat-adoption pass read `data/elections.gen.ts`, which the polity swap
// retired along with its generator — polity supplies seats and standings
// directly now. The loop is kept, fed an empty set, so this generator still
// produces the breadth snapshot it is here for without carrying a dependency
// on a file that no longer exists. Everything downstream of it is a no-op.
const RETIRED_ELECTIONS: Record<string, { parties: { party: string; seats: number }[] }> = {}
for (const [isoCode, election] of Object.entries(RETIRED_ELECTIONS) as [
  ISOCountryCode,
  { parties: { party: string; seats: number }[] },
][]) {
  const countryQid = isoToQid.get(isoCode)
  if (!countryQid || !mapping[isoCode]) continue

  // Whatever the roster pass already resolved for this country is spoken for —
  // an adopted bench must not take an entity a named party is wearing.
  const claimedQids = new Set(
    (mapping[isoCode]?.parties ?? []).flatMap(party => (party.qid ? [party.qid] : []))
  )

  for (const seated of election.parties) {
    if (NOT_A_ROSTER_PARTY.test(seated.party)) continue
    // Already on the roster under another spelling. Don't adopt a duplicate —
    // but if the Factbook's own row never resolved to an entity, the bench's
    // name is a second chance at one, and refusing outright would throw away
    // the logo the duplicate used to carry (Indonesia's NasDem, Hungary's
    // Fidesz). Enrich the row that is already there instead.
    const existing = rosterEntry(isoCode, seated.party)
    if (existing?.qid) continue
    const enriching = existing

    const cacheKey = matchKeyFor(seated.party, undefined, countryQid, seated.seats)
    const cached = matchCache[cacheKey]
    let match: PartyMatch | undefined
    if (cached) {
      match = 'miss' in cached ? undefined : stillAcceptable(cached)
    } else {
      match = await resolveParty(
        seated.party,
        undefined,
        countryQid,
        COUNTRIES[isoCode]?.name.english ?? isoCode,
        claimedQids
      )
      matchCache[cacheKey] = match
        ? {
            qid: match.qid,
            claims: slimClaims(match.claims),
            ...(match.label ? { label: match.label } : {}),
          }
        : { miss: true }
    }
    // Same reason as the roster pass: the cache is keyed per party, so it will
    // replay a collision recorded before this rule existed.
    if (match && claimedQids.has(match.qid)) {
      report.push(
        `${isoCode}: adopted "${seated.party}" resolved to ${match.qid}, already claimed — skipped`
      )
      collisions += 1
      continue
    }
    if (!match) continue
    claimedQids.add(match.qid)

    const logoFile = claimStrings(match.claims, 'P154')[0]
    if (logoFile) logoFiles.set(`${isoCode}|${match.qid}`, logoFile)
    const ideologies = claimIds(match.claims, 'P1142')
    const position = claimIds(match.claims, 'P1387')[0]
    const colors = claimColours(match.claims)
    const founded = yearOf(match.claims)
    const groupings = openClaimIds(match.claims, 'P463')

    const resolved = {
      qid: match.qid,
      ...(ideologies.length ? { ideologies } : {}),
      ...(position ? { position } : {}),
      ...(colors.length ? { colors } : {}),
      ...(founded ? { foundedYear: founded } : {}),
      ...(groupings.length ? { groupings } : {}),
    }

    if (enriching) {
      // The Factbook's own row keeps its NAME — that is the spelling the rest
      // of the roster and every reveal already agree on — and gains the entity
      // the bench's spelling found.
      Object.assign(enriching, resolved)
      enriched += 1
      continue
    }

    mapping[isoCode]!.parties.push({ name: seated.party, ...resolved })
    adopted += 1
    process.stdout.write(`\r  ${adopted} seated parties adopted into the roster`)
  }
  writeFileSync(MATCH_CACHE_PATH, `${JSON.stringify(matchCache, null, 2)}\n`)
}
if (adopted) console.log()
if (enriched) console.log(`  ${enriched} roster parties resolved via their seated spelling`)

// --- 3. Ideology and position labels ----------------------------------------
// Stored as Q-ids above so every label resolves in one batched pass.
const labelIds = Object.values(mapping)
  .flatMap(country => country?.parties ?? [])
  .flatMap(party => [
    ...(party.ideologies ?? []),
    ...(party.position ? [party.position] : []),
    ...(party.groupings ?? []),
  ])

console.log(`Resolving ${new Set(labelIds).size} ideology/position/grouping labels…`)
const labels = await labelsFor(labelIds)
writeFileSync(LABEL_CACHE_PATH, `${JSON.stringify(Object.fromEntries(labels), null, 2)}\n`)
for (const country of Object.values(mapping)) {
  for (const party of country?.parties ?? []) {
    // Same rule the groupings branch below already applies, and for the same
    // reason: `?? id` kept the raw Q-id whenever the label lookup missed, so
    // seven parties shipped an ideology of "Q30927542" and a reveal would have
    // told a player the Christian Union is a "Q16481705" party.
    if (party.ideologies) {
      party.ideologies = party.ideologies
        .map(id => labels.get(id))
        .filter((label): label is string => !!label)
      if (!party.ideologies.length) delete party.ideologies
    }
    if (party.position) {
      const label = labels.get(party.position)
      if (label) party.position = label
      else delete party.position
    }
    if (party.groupings) {
      // Drop anything that never resolved: an unlabelled Q-id on screen is
      // worse than a party that simply lists no groupings.
      party.groupings = party.groupings
        .map(id => labels.get(id))
        .filter((label): label is string => !!label)
      if (!party.groupings.length) delete party.groupings
    }
  }
}

// --- 4. Logos ----------------------------------------------------------------
// Sequential: Commons 429s a parallel image pass. Existing files are kept
// unless --force, and the credit is carried over from the previous run so a
// re-run costs one metadata call per NEWLY saved logo (as leaders does).
mkdirSync(OUTPUT_DIRECTORY, { recursive: true })
const logoQids = Object.entries(mapping).flatMap(([iso, country]) =>
  (country?.parties ?? [])
    .filter(party => party.qid)
    .map(party => ({ iso, party, qid: party.qid! }))
)

/**
 * Wikidata's P154 is not the whole story: plenty of parties have a perfectly
 * good logo on Commons that nobody ever linked from the Q-item. Sweden's
 * Liberals are one — the file is there, Public domain, and the party carries
 * no P154 at all.
 *
 * So for the parties P154 left empty, read the en.wikipedia article's own
 * `|logo=` field and keep the file ONLY when Commons hosts it. Most do not:
 * measured on 57 gaps, 46 were fair-use uploads local to en.wikipedia and 2
 * were on Commons. That ratio is why this is a small recovery rather than a
 * second harvest — but a free logo we already had a right to use should not be
 * missing because of a gap in someone else's metadata.
 */
const recoverFromWikipedia = async (qids: string[]): Promise<Map<string, string>> => {
  const found = new Map<string, string>()
  if (!qids.length) return found

  // Q-id → article title, in batches.
  const titles = new Map<string, string>()
  for (let index = 0; index < qids.length; index += 50) {
    const batch = qids.slice(index, index + 50)
    const response = await fetchJson<{
      entities?: { [id: string]: { sitelinks?: { enwiki?: { title?: string } } } }
    }>(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${batch.join(
        '|'
      )}&props=sitelinks&sitefilter=enwiki&format=json`
    )
    for (const [qid, entity] of Object.entries(response?.entities ?? {})) {
      const title = entity.sitelinks?.enwiki?.title
      if (title) titles.set(qid, title)
    }
    await wait(200)
  }

  for (const [qid, title] of titles) {
    const page = await fetchJson<{ parse?: { wikitext?: { '*'?: string } } }>(
      `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(
        title
      )}&prop=wikitext&format=json&redirects=1`
    )
    await wait(150)
    const file = infoboxLogo(page?.parse?.wikitext?.['*'] ?? '')
    if (!file) continue

    // Ask the LICENCE, not the host. Commons hosting was standing in for the
    // question — it accepts free files only, so "Commons serves it" implied "we
    // may re-host it" — but the implication does not run backwards: a freely
    // licensed file uploaded to en.wikipedia instead fails a hosting probe
    // while being perfectly free to use. South Africa's Democratic Alliance
    // mark is public domain and was refused for exactly that.
    //
    // Most of what turns up is flagged non-free — Wikipedia's fair-use
    // rationale for its own article. Whether we publish those is one policy
    // switch, `PUBLISH_FAIR_USE`, and `publishable` is that policy applied.
    // What is refused here is the licence that says no in its own terms
    // (NonCommercial, NoDerivatives), which no fair-use argument answers.
    const licence = await fetchImageLicence(file)
    await wait(150)
    if (!licence) continue
    if (!licence.publishable) {
      licenceRefusals.push(
        `${qid} "${title}": ${file} is ${licence.license ?? 'unlicensed'}${licence.nonFree ? ' (non-free)' : ''}`
      )
      continue
    }
    found.set(qid, file)
  }

  return found
}

const missingLogos = logoQids
  .filter(entry => !logoFiles.has(`${entry.iso}|${entry.qid}`))
  .map(entry => entry.qid)

if (missingLogos.length) {
  console.log(`Recovering Commons logos for ${missingLogos.length} parties P154 missed…`)
  const recovered = await recoverFromWikipedia(missingLogos)
  for (const entry of logoQids) {
    const file = recovered.get(entry.qid)
    if (file) logoFiles.set(`${entry.iso}|${entry.qid}`, file)
  }
  console.log(`  recovered ${recovered.size}`)
  if (licenceRefusals.length) {
    console.log(`  ${licenceRefusals.length} found but refused on licence`)
    report.push('', `logos found on the article but refused on their licence:`, ...licenceRefusals)
  }
}

// P154 came back with the match (cached or live), so there is no claims fetch
// here at all — only the image downloads themselves.
console.log(`Fetching logos for ${logoQids.length} matched parties…`)
let saved = 0
{
  for (const entry of logoQids) {
    const slugKey = `${entry.iso}-${entry.qid}`
    // A hand-supplied mark wins outright: it exists precisely because the
    // Commons pass cannot reach this party, so letting the harvest try first
    // would only re-run a search already known to miss (or, worse, land on a
    // same-named party in another country).
    const local = LOCAL_LOGOS[slugKey]
    if (local) {
      const source = `${LOCAL_LOGO_DIRECTORY}/${local.file}`
      if (!existsSync(source)) {
        report.push(`${entry.iso}: local logo "${local.file}" is missing — party left unmarked`)
        continue
      }
      const written = await writeWebp(
        readFileSync(source),
        `${OUTPUT_DIRECTORY}/${slugKey}`,
        `/${PUBLIC_BASE}/${slugKey}`,
        LOGO_WIDTH
      )
      if (!written) continue
      entry.party.logo = written
      entry.party.credit = local.credit
      entry.party.license = local.license
      entry.party.nonFree = true
      saved += 1
      process.stdout.write(`\r  ${saved} logos`)
      continue
    }

    const file = logoFiles.get(`${entry.iso}|${entry.qid}`)
    if (!file) continue

    const previousParty = previous[entry.iso as ISOCountryCode]?.parties.find(
      party => party.qid === entry.qid
    )
    // baseName is the on-disk path, publicBase the URL — both WITHOUT the
    // extension, which saveCommonsImage appends.
    const slug = `${entry.iso}-${entry.qid}`
    const path = await saveCommonsImage(
      file,
      `${OUTPUT_DIRECTORY}/${slug}`,
      `/${PUBLIC_BASE}/${slug}`,
      { width: LOGO_WIDTH, force }
    )
    if (!path) continue

    // Wikidata's P154 sometimes points at a party's FLAG rather than its
    // emblem, and a bare tricolour is not a mark anyone can read — Sudan's
    // Democratic Unionist Party and Honduras' Liberal Party both saved as
    // plain three-band flags. Flat colour compresses to almost nothing, so the
    // encoded size is the tell: real wordmarks start around 1.2KB (Chile's
    // "evópoli" is 1,262 bytes) where these land at 544 and 654.
    const bytes = statSync(`${OUTPUT_DIRECTORY}/${slug}${extname(path)}`).size
    if (bytes < FLAT_IMAGE_BYTES) {
      report.push(`${entry.iso}: "${entry.party.name}" logo is ${bytes}B — a flag, not a mark`)
      flatLogos += 1
      continue
    }

    entry.party.logo = path
    saved += 1

    // ONE licence read, from whichever wiki hosts the file. Both the credit and
    // the non-free flag used to be asked of Commons alone, which answers
    // nothing for a mark uploaded to en.wikipedia — so a fair-use logo would
    // ship with no `nonFree`, no licence and no credit, and
    // `data-sanity.test.ts` fails the build on exactly that. Carrying the
    // provenance is what makes publishing these defensible rather than quiet.
    const licence = await fetchImageLicence(file)
    await wait(150)
    if (licence?.credit) entry.party.credit = licence.credit
    if (licence?.license) entry.party.license = licence.license
    if (licence?.restrictions) entry.party.logoRestrictions = licence.restrictions
    if (licence?.nonFree) entry.party.nonFree = true
    // A previous run's credit stands in when the metadata read comes back bare,
    // so a transient failure cannot strip a licence line we already had.
    if (!entry.party.credit && previousParty?.credit) entry.party.credit = previousParty.credit
    if (!entry.party.license && previousParty?.license) entry.party.license = previousParty.license
    // A non-free mark must name a source — that is the rule `data-sanity` holds
    // us to, and the thing that separates a deliberate fair-use claim from a
    // harvest that wandered off Commons. Most such files carry no `Artist` at
    // all (a party emblem's author is the party), so the party itself is the
    // credit and the licence line says on what basis it is shown.
    if (entry.party.nonFree) {
      entry.party.credit ||= entry.party.name
      entry.party.license ||= 'Party trademark, used to identify the party'
    }

    process.stdout.write(`\r  ${saved} logos`)
  }
}
console.log()

// --- 5. Write ----------------------------------------------------------------
const countries = Object.keys(mapping).length
// The floor judges THIS RUN, not the carried-over file. Counting `mapping`
// meant a total outage still counted 192 previous entries and wrote them back
// out as if freshly read — the guard could not fire at all.
if (readThisRun.size < COUNTRY_FLOOR) {
  throw new Error(
    `Only ${readThisRun.size} countries read this run (floor ${COUNTRY_FLOOR}) — ` +
      `refusing to rewrite the roster from ${countries} carried-over entries.`
  )
}

const totalParties = Object.values(mapping).reduce(
  (total, country) => total + (country?.parties.length ?? 0),
  0
)

writeFileSync(
  OUTPUT_FILE,
  `// Generated by generators/create-parties-file.ts — do not edit by hand.
import type { PartyMapping } from '../types/party.types'

export const PARTIES: PartyMapping = ${jsonParseLiteral(mapping)}
`
)

writeFileSync(
  REPORT_FILE,
  [
    `parties: ${totalParties} across ${countries} countries`,
    `matched to Wikidata: ${resolved}/${attempted} (${Math.round((resolved / attempted) * 100)}%)`,
    `logos saved: ${saved}`,
    `entity collisions refused: ${collisions}`,
    `flag-not-a-logo images refused: ${flatLogos}`,
    '',
    'seat-sum drift, and rows whose match was already claimed:',
    ...report,
  ].join('\n')
)

console.log(
  `\nWrote ${OUTPUT_FILE}: ${totalParties} parties, ${countries} countries, ` +
    `${resolved} matched (${Math.round((resolved / attempted) * 100)}%), ${saved} logos.`
)
console.log(`Review ${REPORT_FILE} before committing.`)
