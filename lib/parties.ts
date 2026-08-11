import { COUNTRIES } from '~~/data/countries.gen'
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

  for (const demonym of isoCode ? (COUNTRIES[isoCode]?.name.demonyms ?? []) : []) {
    const cleaned = demonym.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    if (cleaned.length >= 4) value = value.replace(new RegExp(`\\b${cleaned}\\b`, 'g'), ' ')
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
export const governingParty = (isoCode: ISOCountryCode): Party | undefined => {
  const party = politicalLeader(isoCode)?.party
  if (!party || party === INDEPENDENT) return undefined

  const roster = partiesOf(isoCode)
  const wanted = partyTokens(party, isoCode)
  if (!wanted.length) return undefined

  const abbreviations = (entry: Party): string[] => {
    const listed = entry.abbreviation ? [entry.abbreviation] : []
    // The Factbook buries the abbreviation mid-name too: "Action of
    // Dissatisfied Citizens or ANO" is how Czechia's ANO is listed.
    const trailing = /\bor\s+([A-Za-zÀ-ÿ0-9]{2,})\s*$/.exec(entry.name)?.[1]
    return [...listed, ...(trailing ? [trailing] : [])].map(value => value.toLowerCase())
  }

  const wantedKey = wanted.join('')

  return roster.find(entry => {
    // "ANO 2011" vs "…or ANO" — a year suffix is not a different party.
    const bare = party.toLowerCase().replace(/\s+\d{4}$/, '')
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
