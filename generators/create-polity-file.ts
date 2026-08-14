import { existsSync, statSync } from 'node:fs'
import { PARTIES as PREVIOUS } from '../data/parties-factbook.gen'
import { extname } from 'node:path'
import { jsonParseLiteral } from './lib/emit'
import { saveCommonsImage } from './vendors/wikidata/commons'
import type { ISOCountryCode } from '../types/geography.types'
import type { CountryParties, Party, PartyMapping } from './create-parties-file'

/**
 * Party rosters and chamber standings, from polity.
 *
 * This replaces a join, not a fetch. The previous route read the CIA Factbook
 * for a party roster, Wikipedia for a cabinet list, and Wikidata for seat
 * counts, then tried to decide WHICH BENCHES GOVERN by matching cabinet party
 * names against roster party names — through a normaliser that stripped
 * articles, diacritics, trailing country disambiguators and Factbook " or "
 * aliases, with a coverage floor to catch the joins that still went wrong.
 *
 * That machinery existed to answer one question, and polity answers it
 * directly: every seat row carries a `standing` of government / backing /
 * opposition, decided at the source and checked against the chamber's own seat
 * total. So the matcher is not ported here — it is deleted. 19 dealable
 * countries become 110, and the ones that were failing were failing on the
 * join rather than on missing data.
 *
 * Logos are still downloaded rather than hot-linked. polity points at Commons
 * `Special:FilePath`, which costs three redirects and ~580ms cold per file
 * against ~4ms from disk; the Government round shows three to six logos at
 * once and is time-scored, so hot-linking would put Wikimedia in the critical
 * path of gameplay and break the round during any Wikimedia outage.
 */

const SOURCE = 'https://kodwerk-ab.github.io/polity/v1/polity.json'
const OUTPUT_DIRECTORY = 'public/parties'
const PUBLIC_BASE = 'parties'
const LOGO_WIDTH = 512

/**
 * Below this, an "emblem" is a flat flag rather than a readable mark.
 *
 * Carried over from the previous generator, where Wikidata's P154 sometimes
 * pointed at a party's flag: Sudan's Democratic Unionist Party and Honduras'
 * Liberal Party both saved as plain three-band tricolours. Flat colour
 * compresses to almost nothing, so the encoded size is the tell — real
 * wordmarks start around 1.2KB.
 */
const FLAT_IMAGE_BYTES = 1_000

interface PolityEntity {
  qid: string
  label?: string
}

interface PolityLogo {
  file: string
  url: string
  host: 'commons' | 'wikipedia'
  license?: string
  non_free: boolean
  restrictions?: string[]
  credit?: string
}

interface PolityParty {
  entity: PolityEntity
  name: string
  endonym?: string
  abbreviation?: string
  kind: string
  alignment?: string
  alignment_raw?: string
  ideologies: PolityEntity[]
  ideology_families?: string[]
  groupings: PolityEntity[]
  members?: PolityEntity[]
  colors: string[]
  founded_year?: number
  logo?: PolityLogo
}

interface PolitySeating {
  party: string | null
  name: string
  seats: number
  share?: number
  standing: 'government' | 'backing' | 'opposition' | 'speaker' | 'non_attached' | 'vacant'
  kind?: string
  alliance?: string
}

interface PolityChamber {
  role: 'unicameral' | 'lower' | 'upper'
  name: string
  name_local?: string
  seats_total: number
  selection: string[]
  contestation: string
  composition: PolitySeating[]
  last_election?: string
  next_election?: string
  as_of: string
  confidence: 'high' | 'partial' | 'flagged'
}

interface PolityOfficeHolder {
  person: PolityEntity
  name: string
  office?: PolityEntity
  party?: PolityEntity | null
  since?: string
}

interface PolityCountry {
  iso: string
  name: string
  recognition?: string
  form: string
  head_of_state?: PolityOfficeHolder
  head_of_government?: PolityOfficeHolder | null
  parties: Record<string, PolityParty>
  chambers: PolityChamber[]
  democracy?: { score: number; year: number }
}

interface PolityDataset {
  schema_version: string
  generated_at: string
  countries: Record<string, PolityCountry>
}

/**
 * The chamber a citizen means by "parliament".
 *
 * The lower house where a country has two, because that is where a government
 * is made and unmade; the only chamber where it has one.
 */
const primaryChamber = (country: PolityCountry): PolityChamber | undefined =>
  country.chambers.find(chamber => chamber.role !== 'upper') ?? country.chambers[0]

/**
 * The party a citizen would name as governing.
 *
 * The HEAD OF GOVERNMENT'S party, falling back to the head of state's where
 * one person holds both offices — which is how polity records a presidential
 * system, explicitly rather than by repeating the entry.
 */
const leadPartyQid = (country: PolityCountry): string | undefined =>
  country.head_of_government?.party?.qid ?? country.head_of_state?.party?.qid

/**
 * The bench the leader's party actually sits on.
 *
 * Frequently NOT a row with that party's own Q-id. France's chamber seats
 * "Together for the Republic group" while Macron leads Renaissance; Poland's
 * seats "Civic Coalition" while Tusk leads Civic Platform; Brazil's seats
 * "Brazil of Hope" while Lula leads the Workers' Party. polity records the
 * membership on the bloc as `members` (Wikidata P527), and the Q-ids match
 * exactly — without it, 19 countries including all three of those were
 * unjoinable.
 */
const leadBench = (country: PolityCountry, chamber: PolityChamber): PolitySeating | undefined => {
  const lead = leadPartyQid(country)
  if (!lead) return undefined
  return chamber.composition.find(
    row =>
      row.party === lead ||
      (row.party ? country.parties[row.party]?.members?.some(m => m.qid === lead) : false)
  )
}

/** polity's alignment bands, in the words the previous roster used. */
const POSITION_BY_BAND: Record<string, string> = {
  left: 'left-wing',
  centre_left: 'centre-left',
  centre: 'centrism',
  centre_right: 'centre-right',
  right: 'right-wing',
}

const partyFrom = (party: PolityParty, seating?: PolitySeating): Party => ({
  name: party.name,
  ...(party.endonym ? { endonym: party.endonym } : {}),
  ...(party.abbreviation ? { abbreviation: party.abbreviation } : {}),
  qid: party.entity.qid,
  ...(seating ? { seats: seating.seats } : {}),
  ...(seating?.share !== undefined ? { seatShare: seating.share } : {}),
  ...(party.ideologies.length
    ? { ideologies: party.ideologies.map(i => i.label).filter((l): l is string => !!l) }
    : {}),
  ...(party.alignment_raw
    ? { position: party.alignment_raw }
    : party.alignment && POSITION_BY_BAND[party.alignment]
      ? { position: POSITION_BY_BAND[party.alignment] }
      : {}),
  // Bare hex, no leading `#` — the shape the roster has always used.
  ...(party.colors.length ? { colors: party.colors.map(c => c.replace(/^#/, '')) } : {}),
  ...(party.founded_year ? { foundedYear: party.founded_year } : {}),
  // Not a party anyone can be asked to name. `coalition` is the existing flag
  // for "counts in the chamber's arithmetic, never dealt as a subject", and
  // three of polity's `kind` values mean exactly that: an electoral alliance
  // ("which logo is not a ruling party" has no honest answer when the answer is
  // an alliance of five), a parliamentary group, and the chamber's own
  // bookkeeping — the independents and vacancies that really do hold seats.
  ...(['electoral_alliance', 'parliamentary_group', 'independents', 'residual'].includes(party.kind)
    ? { coalition: true }
    : {}),
  ...(party.groupings.length
    ? { groupings: party.groupings.map(g => g.label).filter((l): l is string => !!l) }
    : {}),
  // The side of the chamber, decided by polity and checked against the seat
  // total. The whole reason for the swap.
  ...(seating ? { standing: seating.standing } : {}),
  ...(seating?.alliance ? { alliance: seating.alliance } : {}),
})

const main = async (): Promise<void> => {
  const force = process.argv.includes('--force')
  const only = process.argv.filter(argument => /^[A-Z]{2}$/.test(argument))

  process.stdout.write(`Fetching ${SOURCE}\n`)
  const response = await fetch(SOURCE)
  if (!response.ok) throw new Error(`polity fetch failed: ${response.status}`)
  const dataset = (await response.json()) as PolityDataset
  process.stdout.write(
    `  polity ${dataset.schema_version}, built ${dataset.generated_at.slice(0, 10)}, ` +
      `${Object.keys(dataset.countries).length} countries\n`
  )

  const mapping: PartyMapping = {}
  const report: string[] = []
  // Every party that needs a logo, gathered before any download so the pass is
  // one flat loop rather than a nest.
  const wanted: { iso: string; qid: string; file: string; party: Party }[] = []

  for (const [iso, country] of Object.entries(dataset.countries)) {
    if (only.length && !only.includes(iso)) continue
    const chamber = primaryChamber(country)
    if (!chamber) continue

    const parties: Party[] = []
    const seen = new Set<string>()

    // A party can hold TWO rows in one chamber — Sweden seats the Sweden
    // Democrats as 70 backing and 2 government, because two of their members
    // took ministerial posts. Keyed by Q-id, whichever row is read first wins,
    // and reading them in source order filed SD as a 2-seat government party
    // rather than the 70-seat backer it is. The LARGER row is the party's real
    // position, so rows are taken biggest-first.
    const governing = leadBench(country, chamber)
    // Seats are SUMMED across a party's rows while its SIDE comes from the
    // largest — the two answer different questions. Sweden seats the Sweden
    // Democrats as 70 backing and 2 government, because two of their members
    // took ministerial posts: their side is `backing` (the 70), and their seat
    // count is 72. Taking only the larger row lost 5 seats nationally and put
    // the governing bloc three short of the majority it actually holds.
    const seatsByParty = new Map<string, number>()
    for (const row of chamber.composition) {
      if (!row.party) continue
      seatsByParty.set(row.party, (seatsByParty.get(row.party) ?? 0) + row.seats)
    }
    const bySize = [...chamber.composition].sort((a, b) => b.seats - a.seats)
    for (const row of bySize) {
      if (!row.party) continue
      const source = country.parties[row.party]
      if (!source || seen.has(row.party)) continue
      seen.add(row.party)
      const party = partyFrom(source, { ...row, seats: seatsByParty.get(row.party) ?? row.seats })
      if (governing && row.party === governing.party) {
        party.leads = true
        // Where the bench is a parliamentary GROUP rather than a party, the
        // answer a player should give is the leader's own party — France's
        // chamber seats "Renaissance group" and Macron leads Renaissance — so
        // the group is renamed to it. The seats stay the group's, because those
        // are the seats the arc draws.
        const lead = leadPartyQid(country)
        // The leader's party is often absent from the country's own registry —
        // polity registers what holds SEATS, and Macron's Renaissance holds
        // none in its own name. Its label rides the group's `members` list,
        // which is the link that found the bench in the first place.
        const own =
          (lead ? country.parties[lead]?.name : undefined) ??
          source.members?.find(member => member.qid === lead)?.label
        if (source.kind === 'parliamentary_group' && own) {
          party.name = own
          delete party.coalition
        }
        // A bloc the leader personally belongs to is the answer a player would
        // give, whatever Wikidata files it as. Argentina's La Libertad Avanza
        // is classed an electoral alliance — defensible historically — but it
        // is Milei's party, and refusing to deal it would drop the country for
        // a taxonomy argument rather than a factual one.
        if (row.party === lead) delete party.coalition
      }
      parties.push(party)
      if (source.logo && !source.logo.non_free) {
        wanted.push({ iso, qid: row.party, file: source.logo.file, party })
      } else if (source.logo) {
        // Fair use, which this project publishes deliberately — political
        // parties are public entities and the round is educational.
        wanted.push({ iso, qid: row.party, file: source.logo.file, party })
        party.nonFree = true
        party.credit = source.logo.credit ?? source.name
        if (source.logo.license) party.license = source.logo.license
      }
      if (source.logo?.restrictions?.length) {
        party.logoRestrictions = source.logo.restrictions.join('|')
      }
      if (source.logo?.credit && !party.credit) party.credit = source.logo.credit
      if (source.logo?.license && !party.license) party.license = source.logo.license
    }

    // A seated row with no Q-id is still real seats. 398 of polity's 2140 rows
    // resolve to no Wikidata entity — small parties, independents, a chamber's
    // own bookkeeping — and dropping them lost 19% of the world's benches from
    // the arithmetic. Sweden's "Ambition Sweden" holds two backing seats, and
    // without them the governing bloc read 174 of 349: one short of the
    // majority it actually holds. Carried by NAME, with no logo, so they count
    // toward the arc without ever being dealt as an option.
    for (const row of chamber.composition) {
      if (row.party || !row.seats) continue
      parties.push({
        name: row.name,
        seats: row.seats,
        ...(row.share !== undefined ? { seatShare: row.share } : {}),
        standing: row.standing,
        ...(row.alliance ? { alliance: row.alliance } : {}),
        // Never dealt as a subject — it has no logo and, for the independents
        // and vacancies among these, no party to name.
        coalition: true,
      })
    }

    // Parties in the registry that hold no seats still belong to the roster —
    // they are what an impostor row is drawn from elsewhere.
    for (const [qid, source] of Object.entries(country.parties)) {
      if (seen.has(qid)) continue
      seen.add(qid)
      const party = partyFrom(source)
      parties.push(party)
      if (source.logo) wanted.push({ iso, qid, file: source.logo.file, party })
    }

    // And the parties the FACTBOOK roster held that polity does not.
    //
    // `data/parties-factbook.gen.ts` is a frozen snapshot of the last Factbook
    // harvest, kept as an input rather than regenerated: the Factbook mirror
    // stopped updating on 2026-01-22, so re-running it would fetch the same
    // bytes. It supplies BREADTH only — never seats, never standing.
    //
    // polity records a party when it holds seats; the CIA Factbook lists every
    // registered party a country has, seated or not. Replacing one with the
    // other outright cost 416 parties and 154 logos — and those unseated
    // parties are exactly what the Rulers mode draws its impostors from, so a
    // thinner roster makes a worse round even where the chamber is unaffected.
    //
    // Merged by Q-id, which both sides carry. A party polity already placed
    // wins, because its record is current and carries the standing; the rest
    // are kept verbatim, logo and all, so nothing already downloaded is lost.
    const carried = PREVIOUS[iso as ISOCountryCode]?.parties ?? []
    for (const old of carried) {
      if (old.qid && seen.has(old.qid)) continue
      // A seated party with no Q-id was matched by name above; skip a duplicate.
      if (parties.some(party => party.name === old.name)) continue
      if (old.qid) seen.add(old.qid)
      // Seats and standing come from polity ONLY. Carrying a stale seat count
      // from the Factbook would put two different chambers in one arc.
      const { seats, seatShare, standing, alliance, leads, ...rest } = old
      parties.push(rest)
    }

    const listedSeats = chamber.composition.reduce((sum, row) => sum + row.seats, 0)
    // A chamber that lists more members than it has seats is a double-counted
    // coalition somewhere upstream — Brazil listed 515 in a house of 513,
    // Colombia 202 in 183. The round asserts a chamber never seats more than it
    // holds, and a wrong arc is worse than a smaller pool, so the roster keeps
    // the parties (they are real) while the SEAT COUNTS are dropped, which
    // takes the chamber out of the dealable pool without losing the country.
    const overSeated = listedSeats > chamber.seats_total
    if (overSeated) for (const party of parties) delete party.seats
    const entry: CountryParties = {
      parties,
      legislature: chamber.name,
      structure: country.chambers.length > 1 ? 'bicameral' : 'unicameral',
      declaredSeats: chamber.seats_total,
      listedSeats: overSeated ? 0 : listedSeats,
      ...(chamber.last_election ? { lastElection: chamber.last_election } : {}),
    }
    mapping[iso as ISOCountryCode] = entry
  }

  process.stdout.write(`  ${wanted.length} logos to fetch\n`)

  let saved = 0
  let flat = 0
  for (const entry of wanted) {
    const slug = `${entry.iso}-${entry.qid}`
    const path = await saveCommonsImage(
      entry.file,
      `${OUTPUT_DIRECTORY}/${slug}`,
      `/${PUBLIC_BASE}/${slug}`,
      { width: LOGO_WIDTH, force }
    )
    if (!path) continue

    const onDisk = `${OUTPUT_DIRECTORY}/${slug}${extname(path)}`
    if (existsSync(onDisk) && statSync(onDisk).size < FLAT_IMAGE_BYTES) {
      report.push(`${entry.iso}: "${entry.party.name}" logo is a flat flag, not a mark`)
      flat += 1
      continue
    }
    entry.party.logo = path
    saved += 1
    if (saved % 25 === 0) process.stdout.write(`\r  ${saved} logos`)
  }
  process.stdout.write(`\r  ${saved} logos saved, ${flat} rejected as flat\n`)

  const countries = Object.keys(mapping).length
  const withStandings = Object.values(mapping).filter(entry =>
    entry.parties.some(party => party.seats)
  ).length
  process.stdout.write(`  ${countries} countries, ${withStandings} with seat counts\n`)
  for (const line of report.slice(0, 20)) process.stdout.write(`  ${line}\n`)
  if (report.length > 20) process.stdout.write(`  … ${report.length - 20} more\n`)

  await Bun.write(
    'data/parties.gen.ts',
    `// Generated by generators/create-polity-file.ts — do not edit by hand.\n` +
      `// Source: ${SOURCE} (${dataset.schema_version}, ${dataset.generated_at})\n` +
      `import type { PartyMapping } from '../generators/create-parties-file'\n\n` +
      `export const PARTIES: PartyMapping = ${jsonParseLiteral(mapping)}\n`
  )
  process.stdout.write('wrote data/parties.gen.ts\n')
}

await main()
