/**
 * Pure logic for picking a country's political leader out of the CIA's
 * world-leaders payload, and for deciding when Wikidata should override it.
 *
 * Lives in lib/ (not generators/) so vitest can reach it: the generators are
 * top-level scripts that fetch and write on import. Nothing here imports
 * `data/countries.gen`, so the generator can use it without a cycle.
 */

/** One row of the CIA's `page.leaders[]` array. */
export interface CiaLeader {
  name: string
  title: string
  honorific?: string
}

/** The subset of a Wikidata leader record the merge needs. */
export interface WikidataLeader {
  name: string
  description?: string
  /** Day the term began, when Wikidata records it to day precision. */
  sinceDate?: string
}

/**
 * Countries whose head of government is the political leader. Everywhere else
 * the head of state is (presidential and semi-presidential systems, absolute
 * monarchies). The CIA payload carries titles but no signal for which office
 * is politically dominant, so this list cannot be derived from it.
 *
 * A naive "head of government first" rule would name Mishustin for Russia,
 * Svyrydenko for Ukraine, Lecornu for France and Kim Min-seok for South Korea.
 *
 * Ported from the previous Factbook-based `getLeader`, with three corrections:
 * `CV`, `SK` and `XK` are parliamentary — their presidents are ceremonial.
 */
export const HEAD_OF_GOVERNMENT_LED = new Set([
  'AL',
  'AD',
  'AG',
  'AM',
  'AU',
  'AT',
  'BS',
  'BD',
  'BB',
  'BE',
  'BZ',
  'BT',
  'BG',
  'KH',
  'CA',
  'CV',
  'HR',
  'CZ',
  'DK',
  'DM',
  'TL',
  'EE',
  'ET',
  'FJ',
  'FI',
  'GE',
  'DE',
  'GR',
  'GD',
  'HU',
  'IS',
  'IN',
  'IQ',
  'IE',
  'IL',
  'IT',
  'JM',
  'JP',
  'XK',
  'LV',
  'LB',
  'LS',
  'LY',
  'LU',
  'LI',
  'MY',
  'MT',
  'MU',
  'MD',
  'MN',
  'ME',
  'NP',
  'NL',
  'NZ',
  'MK',
  'NO',
  'PK',
  'PG',
  'PL',
  'RO',
  'KN',
  'LC',
  'RS',
  'SG',
  'SK',
  'SI',
  'SL',
  'SB',
  'ES',
  'SE',
  'TH',
  'TO',
  'TT',
  'TV',
  'GB',
  'VU',
])

const HEAD_OF_GOVERNMENT_TITLES = new Set([
  'prime min.',
  'prime minister',
  'premier',
  'chancellor',
  'taoiseach',
  'chief executive',
  'head of govt.',
  'head of government',
  // Spain's premier is styled "President of the Government"; Sierra Leone's is
  // the Chief Minister. Neither is a president in the head-of-state sense.
  'pres. of the govt.',
  'president of the government',
  'chief min.',
  'chief minister',
])

/**
 * Anything that turns a real office into a subordinate one. The CIA lists
 * fifty-odd rows like "First Dep. Prime Min.", "Min. in the Prime Minister's
 * Office" and "Prime Minister's Chief of Staff" — every one of them would
 * match a naive substring test, which is why titles are matched exactly and
 * only ever on a LEADING phrase.
 */
const SUBORDINATE =
  /^(first|second|third|deputy|dep\.|vice|acting dep\.|senior|special|permanent|executive vice)\b|\bmin\.? (in|at|to|of state|delegate|-member)\b|\bchief of staff\b|'s (office|department|chancellery)/i

const HEAD_OF_STATE_TITLES = new Set([
  'pres.',
  'president',
  'president of the republic',
  'pres. of the republic',
  'king',
  'queen',
  'emperor',
  'emir',
  'amir',
  'sultan',
  'supreme leader',
  'head of state',
  'governor gen.',
  'grand duke',
  'chief of state',
  'sovereign',
  'overall taliban leader',
  'general secretary',
  'supreme pontiff',
])

/** A ceremonial head of state means the head of government leads. */
const MONARCH_TITLES = new Set([
  'king',
  'queen',
  'emperor',
  'emir',
  'amir',
  'sultan',
  'grand duke',
  'governor gen.',
])

/**
 * Whoever actually runs the country, whatever the constitution calls them.
 * Outranks both other roles: North Korea's SAC presidency, Iran's Supreme
 * Leader, Afghanistan's Taliban leader.
 */
const DE_FACTO_EXECUTIVE = /state affairs commission|supreme leader|overall taliban leader/i

/** No single nameable person holds the office. */
const COLLECTIVE_BODY = /captain regent|presidency member|sovereignty council|co-head of state/i

/** Qualifiers that precede a real national office ("Acting Pres."). */
const OFFICE_QUALIFIER = /^(acting|interim|transitional|transition|co-)\s+/i

/** A trailing scope that keeps the office national rather than subordinate. */
const NATIONAL_SCOPE = /^(the republic|swiss confederation|roman catholic church)$/i

/**
 * A body the office sits INSIDE, rather than a second office the same person
 * holds. "Premier, Cabinet" is North Korea's cabinet premier and "Pres.,
 * Central Bank" is Venezuela's central banker — neither leads the country.
 * Contrast "Prime Minister, First Lord of the Treasury", where the tail is
 * another title the prime minister also holds.
 */
const SCOPING_BODY =
  /\b(cabinet|bank|council|commission|yuan|board|committee|assembly|court|authority|secretariat|sac)\b/i

const normalise = (title: string) => title.trim().toLowerCase()

/**
 * Every canonical office name a raw CIA title might denote.
 *
 * A title is only ever read from its LEADING phrase, because the payload is
 * full of near-misses that a substring test would swallow: "First Dep. Prime
 * Min.", "Min. in the Prime Minister's Office", "Prime Minister's Chief of
 * Staff", "Premier, Cabinet" (North Korea's cabinet premier, not the leader).
 * Anything that reads as subordinate yields no office at all.
 *
 * Splitting is generous — `&`, `;`, `,` and the word "and" all separate the
 * conjoined offices real leaders hold ("King & Prime Min.", "Prime Minister,
 * First Lord of the Treasury", "Prime Min. and Min. for Investment") — but
 * only the FIRST segment can name the office. That keeps "Premier, Cabinet"
 * scoped: `cabinet` is never a head-of-government title.
 */
export const officeNames = (title: string): string[] => {
  const cleaned = title.replace(/\([^)]*\)/g, ' ').trim()
  if (SUBORDINATE.test(cleaned)) return []

  const names: string[] = []
  const segments = cleaned.split(/\s*[&;,]\s*|\s+and\s+/i)

  // "Premier, Cabinet" scopes the premiership to the cabinet; it is not the
  // national premiership. A conjoined office ("Prime Minister, First Lord of
  // the Treasury") names a second title the same person holds, and is kept.
  if (segments.length > 1 && SCOPING_BODY.test(normalise(segments[1] ?? ''))) return []

  const first = normalise(segments[0] ?? '')
    .replace(OFFICE_QUALIFIER, '')
    .trim()
  if (first) names.push(first)

  // A conjoined office ("King & Prime Min.") is still this person's office;
  // a trailing scope ("Pres., Swiss Confederation") is not a second office.
  for (const segment of segments.slice(1)) {
    const canonical = normalise(segment).replace(OFFICE_QUALIFIER, '').trim()
    if (!canonical || NATIONAL_SCOPE.test(canonical)) continue
    names.push(canonical)
  }

  // Ireland styles the office "Taoiseach (Prime Min.)" — the parenthetical we
  // stripped above was the only English gloss, so keep the raw one too.
  const parenthetical = /\(([^)]*)\)/.exec(title)?.[1]
  if (parenthetical) names.push(normalise(parenthetical))

  return names
}

const matches = (leader: CiaLeader, titles: Set<string>) =>
  officeNames(leader.title).some(name => titles.has(name))

/** The CIA prints "(Acting)" and the like inside the name field. */
const stripParentheticals = (name: string) => name.replace(/\s*\([^)]*\)/g, '').trim()

/**
 * The political leader of a country, from its CIA `leaders[]` rows.
 *
 * Returns `undefined` when no single person holds the office — San Marino's
 * Captains Regent, Bosnia's tripartite presidency, a vacant presidency.
 *
 * Rule order matters: the de-facto executive is resolved BEFORE choosing
 * between head of state and head of government, or North Korea's Kim Jong Un
 * loses to the SAC's premier.
 */
export const politicalLeaderOf = (isoCode: string, leaders: CiaLeader[]): CiaLeader | undefined => {
  // A vacant office is listed with an empty name (Sudan's prime ministership).
  const named = leaders.filter(leader => leader.name.trim() && leader.title.trim())

  const deFacto = named.find(leader => DE_FACTO_EXECUTIVE.test(leader.title))
  if (deFacto) return { ...deFacto, name: stripParentheticals(deFacto.name) }

  const headOfGovernment = named.find(leader => matches(leader, HEAD_OF_GOVERNMENT_TITLES))
  const headOfState = named.find(leader => matches(leader, HEAD_OF_STATE_TITLES))

  const monarchIsCeremonial =
    !!headOfState && officeNames(headOfState.title).some(name => MONARCH_TITLES.has(name))

  const chosen =
    headOfGovernment && (HEAD_OF_GOVERNMENT_LED.has(isoCode) || monarchIsCeremonial)
      ? headOfGovernment
      : (headOfState ?? headOfGovernment)

  if (!chosen) return undefined
  if (COLLECTIVE_BODY.test(chosen.title)) return undefined
  return { ...chosen, name: stripParentheticals(chosen.name) }
}

/** Which Wikidata role corresponds to the office `politicalLeaderOf` picked. */
export const wikidataRoleFor = (
  isoCode: string,
  leaders: CiaLeader[]
): 'headOfState' | 'headOfGovernment' => {
  const headOfState = leaders.find(leader => matches(leader, HEAD_OF_STATE_TITLES))
  const monarchIsCeremonial =
    !!headOfState && officeNames(headOfState.title).some(name => MONARCH_TITLES.has(name))
  return HEAD_OF_GOVERNMENT_LED.has(isoCode) || monarchIsCeremonial
    ? 'headOfGovernment'
    : 'headOfState'
}

/**
 * Do two spellings of a name refer to the same person? Sources transliterate
 * differently ("Christodoulidis"/"Christodoulides", "al-Shara'"/"al-Sharaa"),
 * so compare on shared long tokens rather than equality.
 *
 * A local copy: `lib/leaders.ts` has the same idea, but it imports
 * `data/countries.gen`, and importing it from the generator that WRITES that
 * file would be circular.
 */
export const sharesSurname = (a?: string, b?: string): boolean => {
  if (!a || !b) return false
  const tokens = (value: string) =>
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .split(/[^a-z]+/)
      .filter(token => token.length >= 4)
  const second = tokens(b)
  return tokens(a).some(token => second.includes(token))
}

/** A Wikidata record that admits it is not describing a sitting leader. */
const selfDescribesAsStale = (leader: WikidataLeader): boolean => {
  if (/\bformer\b/i.test(leader.description ?? '')) return true
  return /\b(council|commission|presidency)\b/i.test(leader.name)
}

/**
 * Wikidata wins only when the CIA's page is provably older than the current
 * term. The CIA is the better source overall (18/23 vs 15/23 on a verified
 * sample) but 38 of its pages have not been touched since 2024.
 *
 * Staleness is decided by DATE, never by the `office` label: Wikidata records
 * Takaichi's office as "party leader", and rejecting on that would fall
 * through to Japan's head of state — the Emperor.
 */
export const preferWikidata = (
  ciaUpdatedAt: string | undefined,
  wikidata: WikidataLeader | undefined
): boolean => {
  if (!wikidata?.sinceDate || !ciaUpdatedAt) return false
  if (selfDescribesAsStale(wikidata)) return false
  return ciaUpdatedAt.slice(0, 10) < wikidata.sinceDate
}
