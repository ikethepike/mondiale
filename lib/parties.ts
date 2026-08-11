import { COUNTRIES } from '~~/data/countries.gen'
import { ELECTIONS } from '~~/data/elections.gen'
import { PARTIES } from '~~/data/parties.gen'
import type { Party, CountryParties } from '~~/generators/create-parties-file'
import type { ISOCountryCode } from '~~/types/geography.types'
import { politicalLeader } from './leaders'

/**
 * The one home for political-party data: the roster, the governing-party join,
 * the left–right spectrum and the transnational groupings.
 *
 * Dealers, views and reveals ALL read through here — nothing imports
 * `data/parties.gen` directly. `governingParty` in particular is the single
 * join between a country's leader and its party roster, so a quiz that asks
 * "who governs here" and a reveal that answers it can never disagree.
 */

export type { Party, CountryParties }

/** Wikidata's stand-in for a partyless politician; never a real answer. */
const INDEPENDENT = 'independent politician'

/**
 * Words that name a political FAMILY rather than a party. Half the world's
 * parties are a "Democratic Party" or a "Workers' Party" of somewhere, so a
 * name whose only content is one of these identifies nothing on its own.
 */
const FAMILY_WORDS = new Set([
  'democrat',
  'democracy',
  'socialist',
  'social',
  'workers',
  'people',
  'peoples',
  'national',
  'nationalist',
  'liberal',
  'conservative',
  'green',
  'communist',
  'republican',
  'progressive',
  'christian',
  'union',
  'front',
  'movement',
  'congress',
  'independent',
  'independents',
  'new',
  'united',
  's',
])

/**
 * Belgium and a few others group their roster under headings — "Flemish
 * parties:", "Francophone parties:". The generator drops them, but this reads
 * a committed file: filtering here too means a stale `.gen` can never put a
 * heading in front of a player, and costs nothing once the data is refreshed.
 */
const isHeading = (party: Party) => /\bparties\s*:\s*$/i.test(party.name.trim())

export const partiesOf = (isoCode: ISOCountryCode): Party[] =>
  (PARTIES[isoCode]?.parties ?? []).filter(party => !isHeading(party))

export const chamberOf = (isoCode: ISOCountryCode): CountryParties | undefined => PARTIES[isoCode]

/**
 * Party names are written by two different hands — the Factbook's roster and
 * its seat table, and again by Wikidata via the leader's `party`. They disagree
 * constantly, and every disagreement is systematic rather than a one-off:
 *
 *   "Labour Party"            vs "Labor (Labour) Party"   parenthetical gloss
 *   "Norwegian Labour Party"  vs "Labor Party"            demonym prefix
 *   "ANO 2011"                vs "…or ANO"                abbreviation only
 *
 * So the key folds the spelling variants, expands parentheticals to both
 * tokens, drops the country's own demonym, and strips the words that decorate
 * a party name rather than identify it. What survives is what actually
 * distinguishes one party from another WITHIN one country — which is the only
 * place these keys are ever compared.
 */
// `alliance` and `coalition` are deliberately NOT decoration: they are exactly
// what separates a party from the bloc it stands in. Poland's leader belongs to
// Civic Platform while the roster lists Civic Coalition, and stripping the
// distinguishing word would join two different entities.
const DECORATION = /\b(party|parties|the|of|for|and)\b/g

export const partyKey = (name: string, isoCode?: ISOCountryCode): string =>
  partyTokens(name, isoCode).join('')

/**
 * The identifying words of a party name, in order. Comparing TOKENS rather
 * than one squashed string is what separates a spelling variant from a
 * different party: "Labour Party" and "Labor (Labour) Party" share the token
 * `labor`, while Poland's "Civic Platform" and "Civic Coalition" share only
 * the decoration `civic` and differ on the word that names them.
 */
export const partyTokens = (name: string, isoCode?: ISOCountryCode): string[] => {
  let value = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\blabour\b/g, 'labor')
    .replace(/\bcentre\b/g, 'center')
    .replace(/\bdemocratic\b/g, 'democrat')
    // "Labor (Labour) Party" — the gloss repeats the name; keep one copy.
    .replace(/\(([^)]*)\)/g, ' $1 ')

  const country = isoCode ? COUNTRIES[isoCode] : undefined
  const fold = (term: string) => term.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

  // The demonym is always decoration — "Norwegian Labour Party" is the "Labor
  // Party" at home.
  for (const demonym of country?.name.demonyms ?? []) {
    const cleaned = fold(demonym)
    if (cleaned.length >= 4) value = value.replace(new RegExp(`\\b${cleaned}\\b`, 'g'), ' ')
  }

  // The country's NAME is decoration only as a trailing qualifier: the "Social
  // Democratic Party of Germany" is the roster's "Social Democratic Party",
  // but the "Sweden Democrats" are not the "Democrats" — strip that and they
  // collapse onto a family word and match whichever Democrats come first.
  const english = fold(country?.name.english ?? '')
  if (english.length >= 4) {
    value = value.replace(new RegExp(`\\b(?:of|in)\\s+(?:the\\s+)?${english}\\b`, 'g'), ' ')
  }

  const tokens = value
    .replace(DECORATION, ' ')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)

  return [...new Set(tokens)]
}

/**
 * The party that governs a country, joined from the leader's `party` string to
 * the Factbook roster. THE join — Rulers, Parliament and every reveal resolve
 * through this one function.
 *
 * Returns undefined for a genuinely partyless leader, and for the cases where
 * the two sources name different things rather than spelling one thing two
 * ways: Poland's leader belongs to Civic Platform while the roster lists its
 * alliance (Civic Coalition), and Hungary's governing party is missing from
 * the Factbook altogether. Guessing at those would be worse than a gap.
 */
/**
 * Find a named party in a country's roster. THE matcher — the leader join and
 * the election-bench join both run through it, so the two can never grow
 * separate ideas of when two spellings are the same party.
 */
export const matchInRoster = (
  name: string,
  roster: Party[],
  isoCode: ISOCountryCode
): Party | undefined => {
  const wanted = partyTokens(name, isoCode)
  if (!wanted.length) return undefined
  const wantedKey = wanted.join('')

  const abbreviations = (entry: Party): string[] => {
    const listed = entry.abbreviation ? [entry.abbreviation] : []
    // The Factbook buries the abbreviation mid-name too: "Action of
    // Dissatisfied Citizens or ANO" is how Czechia's ANO is listed.
    const trailing = /\bor\s+([A-Za-zÀ-ÿ0-9]{2,})\s*$/.exec(entry.name)?.[1]
    return [...listed, ...(trailing ? [trailing] : [])].map(value => value.toLowerCase())
  }

  return roster.find(entry => {
    // "ANO 2011" vs "…or ANO" — a year suffix is not a different party.
    const bare = name.toLowerCase().replace(/\s+\d{4}$/, '')
    if (abbreviations(entry).some(abbreviation => abbreviation === bare)) return true

    for (const candidate of [entry.name, ...(entry.endonym ? [entry.endonym] : [])]) {
      const tokens = partyTokens(candidate, isoCode)
      if (!tokens.length) continue
      if (tokens.join('') === wantedKey) return true

      // One side may carry an extra word the other drops — Hungary's roster
      // says "TISZA – Respect and Freedom Party" where the leader's party is
      // "Respect and Freedom Party". That is the same party with a prefix.
      //
      // Two guards keep that from swallowing different parties. EVERY token of
      // the shorter name must appear in the longer one (Poland's "Civic
      // Platform" vs "Civic Coalition" differ on the naming word), and the
      // shorter name must carry something more distinguishing than a single
      // family word — otherwise Kenya's "Democratic Party" absorbs the "United
      // Democratic Alliance", and Brazil's "Workers' Party" absorbs the
      // "United Socialist Workers' Party".
      const [fewer, more] = tokens.length < wanted.length ? [tokens, wanted] : [wanted, tokens]
      const distinguishing = fewer.filter(token => !FAMILY_WORDS.has(token))
      if (distinguishing.length && fewer.every(token => more.includes(token))) return true
    }
    return false
  })
}

export const governingParty = (isoCode: ISOCountryCode): Party | undefined => {
  const party = politicalLeader(isoCode)?.party
  if (!party || party === INDEPENDENT) return undefined
  return matchInRoster(party, partiesOf(isoCode), isoCode)
}

/** Everyone but the party in power — Rulers' impostor pool. */
export const oppositionParties = (isoCode: ISOCountryCode): Party[] => {
  const governing = governingParty(isoCode)
  return partiesOf(isoCode).filter(party => party !== governing)
}

/**
 * Wikidata's `P1387` position vocabulary collapsed onto the five bands a
 * player can actually be asked about. The raw labels are too fine to quiz
 * ("centrism" vs "big tent" is not a question), and the tail is long.
 */
export type Spectrum = 'left' | 'centre-left' | 'centre' | 'centre-right' | 'right'

export const SPECTRUM_BANDS: readonly Spectrum[] = [
  'left',
  'centre-left',
  'centre',
  'centre-right',
  'right',
]

const SPECTRUM_BY_POSITION: Record<string, Spectrum> = {
  'far-left politics': 'left',
  'radical left': 'left',
  'left-wing': 'left',
  'centre-left': 'centre-left',
  centrism: 'centre',
  'big tent': 'centre',
  'syncretic politics': 'centre',
  'centre-right': 'centre-right',
  'right-wing': 'right',
  'right-wing extremism': 'right',
  'far-right': 'right',
}

export const partySpectrum = (party: Party): Spectrum | undefined =>
  party.position ? SPECTRUM_BY_POSITION[party.position] : undefined

/**
 * Where a party sits on the left–right axis, as a number to SORT by — finer
 * than `Spectrum`, which exists to be quizzed and is deliberately coarse
 * ("centrism" vs "big tent" is not a fair question, but it is a real seating
 * difference).
 *
 * A hemicycle is read left to right, so this is what places a bench. The scale
 * is ordinal, not metric: only the ordering is claimed, and the gaps between
 * adjacent values mean nothing.
 */
const SPECTRUM_RANKS: Record<string, number> = {
  'far-left politics': -4,
  'radical left': -3,
  'left-wing': -2,
  'centre-left': -1,
  centrism: 0,
  'big tent': 0,
  'syncretic politics': 0,
  'centre-right': 1,
  'right-wing': 2,
  'right-wing extremism': 3,
  'far-right': 4,
}

export const spectrumRank = (party: Party | undefined): number | undefined => {
  const rank = party?.position ? SPECTRUM_RANKS[party.position] : undefined
  return rank === undefined ? undefined : rank
}

/** Parties carrying a logo — the pool every logo-facing mode deals from. */
export const partiesWithLogo = (isoCode: ISOCountryCode): Party[] =>
  partiesOf(isoCode).filter(party => !!party.logo)

/**
 * Every country with a party in this transnational grouping (EPP, ECR, the
 * Progressive Alliance). Membership rides Wikidata's `P463`, already filtered
 * to open statements by the generator, so a party that has LEFT a grouping is
 * never counted.
 */
export const countriesInGrouping = (grouping: string): ISOCountryCode[] =>
  (Object.keys(PARTIES) as ISOCountryCode[]).filter(isoCode =>
    partiesOf(isoCode).some(party => party.groupings?.includes(grouping))
  )

export const groupingsOf = (party: Party): string[] => party.groupings ?? []

/**
 * A party's share of the seats actually listed for its chamber, 0–1.
 *
 * The denominator is the LISTED total rather than the chamber's declared size:
 * the two disagree often enough — Malta lists 79 seats against a declared 65,
 * Sierra Leone 135 against 149 — that dividing by the declared size would
 * print shares which do not add to 100.
 */
export const seatShare = (party: Party): number | undefined => party.seatShare

/** Parties holding seats, largest first — Parliament's blocks in reading order. */
export const seatedParties = (isoCode: ISOCountryCode): Party[] =>
  partiesOf(isoCode)
    .filter(party => party.seats !== undefined)
    .sort((a, b) => (b.seats ?? 0) - (a.seats ?? 0))

/**
 * A chamber's benches: every seated bloc, largest first, with the party from
 * the roster attached where the two sources agree on a name.
 *
 * The election articles are the seat source rather than the Factbook, which
 * publishes no seat table for ANY bicameral country (0 of 84) and no vote
 * percentages anywhere. The roster still supplies what a bloc looks like — its
 * logo and colour — so the two are joined here rather than in a view.
 */
export interface Bench {
  /** The party, as the election named it. */
  name: string
  seats: number
  /** Share of the chamber's total seats, 0–1. */
  share: number
  votePct?: number
  /** The roster party behind the bench, when its name resolves to one. */
  party?: Party
  /**
   * The NATIONAL bloc this party stood in — Sweden's Red-Greens, Poland's
   * United Right. Real chambers seat allies together, so this is what orders a
   * hemicycle rather than a bare seat ranking, and it explains a small party
   * sitting where its size alone would not put it.
   */
  alliance?: string
  /** The TRANSNATIONAL family — the EPP, the Progressive Alliance (P463). */
  groupings?: string[]
}

export const benchesOf = (isoCode: ISOCountryCode): Bench[] => {
  const election = ELECTIONS[isoCode]
  if (!election) return []
  const total =
    election.totalSeats ?? election.parties.reduce((sum, party) => sum + party.seats, 0) ?? 0
  if (!total) return []

  const roster = partiesOf(isoCode)
  return election.parties
    .map(entry => {
      const party = matchInRoster(entry.party, roster, isoCode)
      return {
        name: entry.party,
        seats: entry.seats,
        share: entry.seats / total,
        ...(entry.votePct !== undefined ? { votePct: entry.votePct } : {}),
        ...(party ? { party } : {}),
        ...(entry.alliance ? { alliance: entry.alliance } : {}),
        ...(party?.groupings?.length ? { groupings: party.groupings } : {}),
      }
    })
    .sort((a, b) => b.seats - a.seats)
}

/**
 * The benches in SEATING order — LEFT to RIGHT, the way a chamber is read and
 * the way every hemicycle in the press is drawn.
 *
 * Two facts pull against each other and the order in which they are applied is
 * the whole design. Sweden seats V, MP, S and C as one bloc, but C sits to the
 * RIGHT of S on the spectrum — so "keep allies adjacent" and "run left to
 * right" genuinely disagree, and one has to win.
 *
 * The spectrum wins, because it is what the picture is FOR: a player reading
 * the arc should see the left and the right, not a coalition seating chart.
 * Alliances still matter, but as the tie-breaker — parties at the same
 * position sit beside their partners rather than in arbitrary order, which is
 * what puts V and MP together at the left end.
 *
 * Only 36% of benches carry a position, so the unplaced are not scattered
 * through the arc: they are seated as a block on the right of those that are
 * placed, ordered by size. Guessing a position from a party's name would put a
 * party somewhere it does not belong, which is worse than admitting we do not
 * know — and `Bench.party?.position` says which is which.
 */
export const seatingOrder = (isoCode: ISOCountryCode): Bench[] => {
  const benches = benchesOf(isoCode)

  // A bloc sits at the average position of the parties in it that have one, so
  // an alliance lands where its centre of gravity is rather than at whichever
  // member happens to be largest.
  const blocRanks = new Map<string, number[]>()
  for (const bench of benches) {
    const rank = spectrumRank(bench.party)
    if (bench.alliance && rank !== undefined) {
      blocRanks.set(bench.alliance, [...(blocRanks.get(bench.alliance) ?? []), rank])
    }
  }
  const blocRank = (alliance: string | undefined): number | undefined => {
    const ranks = alliance ? blocRanks.get(alliance) : undefined
    if (!ranks?.length) return undefined
    return ranks.reduce((total, rank) => total + rank, 0) / ranks.length
  }

  return [...benches].sort((a, b) => {
    const rankA = spectrumRank(a.party)
    const rankB = spectrumRank(b.party)

    // Unplaced benches sit together to the right of everything placed.
    if (rankA === undefined && rankB === undefined) return b.seats - a.seats
    if (rankA === undefined) return 1
    if (rankB === undefined) return -1

    if (rankA !== rankB) return rankA - rankB

    // Same position: partners together, then the larger party first.
    const blocA = blocRank(a.alliance)
    const blocB = blocRank(b.alliance)
    if (blocA !== undefined && blocB !== undefined && blocA !== blocB) return blocA - blocB
    if (a.alliance !== b.alliance) {
      return (a.alliance ?? '').localeCompare(b.alliance ?? '')
    }
    return b.seats - a.seats
  })
}

/** Every national bloc in a chamber, with the parties that stood in it. */
export const alliancesOf = (isoCode: ISOCountryCode): { alliance: string; benches: Bench[] }[] => {
  const grouped = new Map<string, Bench[]>()
  for (const bench of benchesOf(isoCode)) {
    if (!bench.alliance) continue
    grouped.set(bench.alliance, [...(grouped.get(bench.alliance) ?? []), bench])
  }
  return [...grouped.entries()]
    .map(([alliance, benches]) => ({ alliance, benches }))
    .sort(
      (a, b) =>
        b.benches.reduce((sum, bench) => sum + bench.seats, 0) -
        a.benches.reduce((sum, bench) => sum + bench.seats, 0)
    )
}

/**
 * The house the arc draws, when the data names one — "Sejm", "Chamber of
 * Deputies", "National Council".
 *
 * Most articles carry no separate name and the field holds their title
 * instead ("2023 Polish parliamentary election"), which is not a house, so
 * anything reading like an election is rejected rather than shown.
 */
export const chamberName = (isoCode: ISOCountryCode): string | undefined => {
  const named = ELECTIONS[isoCode]?.chamber?.trim()
  if (!named || /\belections?\b/i.test(named) || /^\d{4}\b/.test(named)) return undefined
  return named
}

/** The chamber's full size, which the benches are a fraction of. */
export const chamberSeats = (isoCode: ISOCountryCode): number | undefined => {
  const election = ELECTIONS[isoCode]
  if (!election) return undefined
  return election.totalSeats ?? election.parties.reduce((sum, party) => sum + party.seats, 0)
}

/**
 * Countries whose GOVERNING party belongs to a political family, keyed by that
 * family — the pool Rulers deals its lineups from.
 *
 * The family is an ideology rather than a transnational grouping: groupings are
 * institutions a party joins (the EPP has 33 countries), where an ideology is
 * what it IS, and covers far more of the world. A country appears under every
 * family its ruling party claims.
 */
export const countriesGovernedByFamily = (): Map<string, ISOCountryCode[]> => {
  const families = new Map<string, ISOCountryCode[]>()
  for (const isoCode of Object.keys(PARTIES) as ISOCountryCode[]) {
    for (const family of governingParty(isoCode)?.ideologies ?? []) {
      families.set(family, [...(families.get(family) ?? []), isoCode])
    }
  }
  return families
}

/**
 * Is this country's government demonstrably NOT of a family — the test an
 * impostor has to pass.
 *
 * A country whose ruling party we cannot identify is not an impostor, it is an
 * unknown, and putting one in a lineup would ask a question with no defensible
 * answer. So the guard is positive: we must know who governs, and know that
 * they do not belong.
 */
export const governedOutsideFamily = (isoCode: ISOCountryCode, family: string): boolean => {
  const governing = governingParty(isoCode)
  return !!governing?.ideologies?.length && !governing.ideologies.includes(family)
}

/** Countries whose chamber is complete enough to draw and play. */
export const playableChambers = (minimumBenches = 3): ISOCountryCode[] =>
  (Object.keys(ELECTIONS) as ISOCountryCode[]).filter(
    isoCode => benchesOf(isoCode).length >= minimumBenches
  )
