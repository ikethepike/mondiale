import { COUNTRIES } from '~~/data/countries.gen'
import { PARTIES } from '~~/data/parties.gen'
import type { Party, CountryParties } from '~~/types/party.types'
import type { ISOCountryCode } from '~~/types/geography.types'
import { INDEPENDENT, politicalLeader } from './leaders'

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
  const country = isoCode ? COUNTRIES[isoCode] : undefined
  const fold = (term: string) => term.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

  // Wikipedia disambiguates an article title by its country — "Republican Party
  // (United States)", "Liberal Democratic Party (Japan)". That parenthetical is
  // the encyclopedia talking, not part of the name, and the gloss unfold below
  // would turn it into tokens the roster's plain "Republican Party" can never
  // carry.
  //
  // Dropped only when the parenthetical is the country and NOTHING else. A year
  // beside it is disambiguating one party from another of the same name rather
  // than from another country's: South Korea's "Democratic Party (South Korea,
  // 2015)" must keep it to reach "Democratic Party of Korea", and stripping to a
  // bare "Democratic Party" loses the roster entirely.
  let value = name
  const identifiers = [country?.name.english, ...(country?.name.demonyms ?? [])]
    .filter((term): term is string => !!term && term.length >= 4)
    .map(fold)
  if (identifiers.length) {
    value = value.replace(/\s*\(([^)]*)\)\s*$/, (whole, inner: string) =>
      identifiers.includes(fold(inner).trim()) ? '' : whole
    )
  }

  // The Factbook lists a party's aliases inline — "Conservative People's Party
  // or DKF", "Green Left or SF or F", "Japan Innovation Party or Nippon Ishin
  // no kai". Everything from the first " or " is a SECOND NAME for the same
  // party, not part of the first one, and tokenising it whole left the roster
  // carrying `or` and an abbreviation the chamber's own spelling never has —
  // so Denmark's Conservatives and Japan's DPFP matched nothing at all.
  value = value.replace(/\s+\bor\b\s+.*$/i, '')

  value = value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\blabour\b/g, 'labor')
    .replace(/\bcentre\b/g, 'center')
    .replace(/\bdemocratic\b/g, 'democrat')
    // "Labor (Labour) Party" — the gloss repeats the name; keep one copy.
    .replace(/\(([^)]*)\)/g, ' $1 ')

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
    // "ANO 2011" vs "…or ANO" — a year suffix is not a different party. Nor is
    // the family word: the chamber seats Indonesia's Gerindra as "Gerindra
    // Party" where the Factbook files it as "…or GERINDRA", and without this
    // the bench found no roster entry, so the largest party in the government
    // reached the screen with no logo and no colour.
    const bare = name
      .toLowerCase()
      .replace(/\s+\d{4}$/, '')
      .replace(/\s+part(y|ies)$/, '')
      .trim()
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
  // Stamped on the roster by Q-id, not matched by name. The leader frequently
  // does not sit under their own party's name — France's chamber seats
  // "Together for the Republic group" while Macron leads Renaissance — and
  // comparing the leader's party name against bench names found none of those.
  const marked = partiesOf(isoCode).find(party => party.leads)
  if (marked) return marked
  // Fall back to the leader join for a country the roster has not marked.
  const party = politicalLeader(isoCode)?.party
  if (!party || party === INDEPENDENT) return undefined
  return matchInRoster(party, partiesOf(isoCode), isoCode)
}

/** Everyone but the party in power — Rulers' impostor pool. */
export const oppositionParties = (isoCode: ISOCountryCode): Party[] => {
  const governing = governingParty(isoCode)
  return partiesOf(isoCode).filter(party => party !== governing && isDealableParty(party))
}

/** Where a bench stands in relation to the government. */
export type Standing = 'government' | 'backing' | 'opposition'

export interface Benches {
  government: Bench[]
  /** Confidence and supply: props the government up, holds no ministries. */
  backing: Bench[]
  opposition: Bench[]
}

/**
 * The chamber split three ways, from the standing polity gives each bench.
 *
 * Only the GOVERNMENT is read from the source; opposition is everything left
 * over, by construction. That inversion matters: Wikipedia's `opposition_party`
 * field is populated for a fraction of cabinets, while the seated benches are
 * something we already hold in full, so deriving is both better covered and
 * impossible to leave inconsistent with the arc the player is looking at.
 *
 * Backers are the third case and the reason this is not a boolean. Sweden's
 * government is M+KD+L; the Sweden Democrats hold no ministries but supply the
 * majority, so calling them either government or opposition is wrong.
 */
export const benchStandings = (isoCode: ISOCountryCode): Benches | undefined => {
  const benches = benchesOf(isoCode)
  if (!benches.length) return undefined

  // `standing` travels on the party, decided by polity against the chamber's
  // own seat total. What used to stand here matched cabinet party names against
  // roster party names through a normaliser that stripped articles, diacritics,
  // trailing country disambiguators and " or " aliases, then guarded the result
  // with a coverage floor and a share floor because the matching still went
  // wrong — Croatia filed its real 61-seat government as opposition, because
  // the chamber seats an "HDZ-led coalition" bench while the cabinet named
  // HDZ's individual partners.
  //
  // Neither floor survives the swap. They were catching a broken join, and
  // there is no join left to break.
  const sideOf = (bench: Bench): string => bench.party?.standing ?? 'opposition'
  const government = benches.filter(bench => sideOf(bench) === 'government')
  if (!government.length) return undefined

  return {
    government,
    backing: benches.filter(bench => sideOf(bench) === 'backing'),
    // Everything left over, by construction — including the speaker's chair,
    // the non-attached and the vacant seats, which sit with nobody.
    opposition: benches.filter(bench => !['government', 'backing'].includes(sideOf(bench))),
  }
}

/**
 * Chambers whose government we can name — what a government round deals from.
 *
 * Called `chambersWithCabinet` until the polity swap, when the cabinet stopped
 * being involved: there is no cabinet list to join against any more, only each
 * bench's own stated standing.
 */
export const chambersWithGovernment = (): ISOCountryCode[] =>
  playableChambers().filter(isoCode => benchStandings(isoCode))

/**
 * A party's name at map size — the caption under a logo on a framed stage.
 *
 * Full names do not fit: "Croatian Democratic Union" is wider than Croatia, and
 * five of them overlap into an unreadable smear. The Factbook's own
 * abbreviation is the right label where it has one (59 of 69 governing parties
 * do); the rest fall back to the name's own trailing acronym ("…or ANO") or its
 * first two words.
 */
export const shortPartyName = (party: Party): string => {
  if (party.abbreviation) return party.abbreviation
  const trailing = /\bor\s+([A-Za-zÀ-ÿ0-9-]{2,})\s*$/.exec(party.name)?.[1]
  if (trailing) return trailing
  const words = party.name.split(/\s+/)
  return words.length <= 2 ? party.name : words.slice(0, 2).join(' ')
}

/** Countries whose governing party carries a logo — Rulers' stage pool. */
export const countriesWithGoverningLogo = (): ISOCountryCode[] =>
  (Object.keys(PARTIES) as ISOCountryCode[]).filter(isoCode => {
    const governing = governingParty(isoCode)
    // Albania's "governing party" is an electoral coalition — a stage asking
    // which mark is not a ruling PARTY cannot use one as its truth.
    return governing?.logo && isDealableParty(governing)
  })

/**
 * Opposition parties that can stand in for a country's government without
 * giving the game away — Rulers' impostor pool.
 *
 * The test is the logo FILE, not party identity. Two roster rows can resolve to
 * one Wikidata entity and therefore wear one image (Albania's Social Democrats
 * and Socialists both landed on Q642882), and an impostor wearing a file
 * identical to the real government's is a question with no answer. The
 * generator now refuses those collisions, but this holds the line here too:
 * a stale `.gen` must never be able to deal an unanswerable round.
 */
export const impostorParties = (isoCode: ISOCountryCode): Party[] => {
  const governing = governingParty(isoCode)
  if (!governing?.logo) return []
  // Everyone the CABINET puts in government, not just the leader's own party.
  // `oppositionParties` excludes only the latter, so every coalition partner
  // was eligible to be dealt as "the party that does not govern here" —
  // Finland's Finns Party, Denmark's Moderates, seventeen candidates in all,
  // each a question whose answer is false.
  const standings = benchStandings(isoCode)
  const inGovernment = new Set<Party>([
    governing,
    ...(standings?.government ?? []).flatMap(bench => (bench.party ? [bench.party] : [])),
    ...(standings?.backing ?? []).flatMap(bench => (bench.party ? [bench.party] : [])),
  ])
  return partiesOf(isoCode).filter(
    party => !inGovernment.has(party) && party.logo && party.logo !== governing.logo
  )
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

/** The five bands as a player reads them, not as the enum spells them. */
export const SPECTRUM_LABELS: Record<Spectrum, string> = {
  left: 'Left',
  'centre-left': 'Centre-left',
  centre: 'Centre',
  'centre-right': 'Centre-right',
  right: 'Right',
}

/**
 * A party's politics in one line: where it sits, and what it calls itself.
 *
 * The band comes from `partySpectrum`/`SPECTRUM_LABELS` rather than the raw
 * `position` — Wikidata's own vocabulary reads as a database ("centrism",
 * "far-left politics", "right-wing extremism"), and the five bands are already
 * the phrasing the spectrum gate puts on screen.
 *
 * ONE ideology, not the list: the arrays run past twenty entries in Wikidata's
 * statement order rather than by salience, and a reveal card has one line.
 * Taking the first is the same call `lib/government.ts` makes for a bench, so
 * the two can never disagree about what a party's ideology IS.
 *
 * Either half stands alone — parties state an ideology with no position far
 * more often than the reverse — and the whole thing is undefined when neither
 * is known, so a caller drops the row rather than printing an empty one.
 */
export const partyLeaning = (party: Party): string | undefined => {
  const band = partySpectrum(party)
  const line = [band ? SPECTRUM_LABELS[band] : undefined, party.ideologies?.[0]]
    .filter(Boolean)
    .join(' · ')
  return line || undefined
}

/**
 * The spectrum question is answered by sliding along the axis rather than
 * picking one of five buttons — the left–right dimension IS the answer, and a
 * row of buttons throws that away.
 *
 * A continuous slider needs a continuous truth, so `0…1` maps onto the five
 * bands as equal fifths and a drop lands in whichever band contains it. That
 * makes the tolerance the band's own width: anywhere inside the right fifth
 * counts, which is the slop a dragged answer needs. Nothing finer is graded —
 * `Spectrum` is deliberately coarse (see `spectrumRank` for why the finer
 * scale is real but unfair to quiz).
 */
export const spectrumAt = (position: number): Spectrum =>
  SPECTRUM_BANDS[
    Math.min(SPECTRUM_BANDS.length - 1, Math.max(0, Math.floor(position * SPECTRUM_BANDS.length)))
  ]!

/** The midpoint of a band, 0–1 — where the reveal parks the true marker. */
export const spectrumCentre = (band: Spectrum): number =>
  (SPECTRUM_BANDS.indexOf(band) + 0.5) / SPECTRUM_BANDS.length

/**
 * What Logo Politics is asking, in words. The round's interstitial and its
 * gate both show this, so it lives here rather than in either of them — the
 * two had already drifted apart once, with the interstitial promising "Whose
 * party is this?" over a question about who governs.
 */
export const logoPoliticsPrompt = (
  ask: 'origin' | 'ruling' | 'spectrum' | undefined,
  country: string
): string => {
  if (ask === 'ruling') return `Does this party govern ${country}?`
  if (ask === 'spectrum') return 'Where does this party sit?'
  return 'Whose party is this?'
}

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
/**
 * An electoral coalition, as the Factbook's own endonym declares it ("electoral
 * coalition led by PD"). It stays in `partiesOf` because the chamber's seats
 * really are held by it, but no mode may DEAL one: "which logo is not a ruling
 * party" has no honest answer when the answer is an alliance of five parties.
 */
export const isDealableParty = (party: Party): boolean => !party.coalition

export const partiesWithLogo = (isoCode: ISOCountryCode): Party[] =>
  partiesOf(isoCode).filter(party => !!party.logo && isDealableParty(party))

/** Marks a decorative pool must never scatter, whatever the licence permits.
 *  The two `nazi` rows are the Syrian Social Nationalist Party's zawba'a,
 *  which reads as a swastika at a glance — and a drifting field parks a tile
 *  mid-screen eventually. Insignia are somebody's armed forces. */
const UNSCATTERABLE = /nazi|insignia|communist/i

/** Licences that owe nobody a credit line. */
const UNATTRIBUTED = /^(public domain|cc0|pd)$/i

/**
 * A logo that may be used as DECORATION — wallpaper behind a title, where no
 * caption can name it and nothing about it is the question.
 *
 * A far narrower gate than `partiesWithLogo`. Fair use is a use, not a
 * property: showing a mark AS the subject of a question is the context that
 * earns it, and scattering the same mark as texture is not, so `nonFree` is
 * out. Attribution-bearing licences are out because the surface has nowhere to
 * print a credit. Leaves ~732 marks.
 *
 * Trademarked marks are KEPT — around half the pool, and unlike fair use a
 * trademark bars confusing use in trade rather than depiction. If that reading
 * is ever revisited, `UNSCATTERABLE` is where it changes.
 */
export const isDecorativeLogo = (party: Party): boolean =>
  !!party.logo &&
  isDealableParty(party) &&
  !party.nonFree &&
  UNATTRIBUTED.test(party.license ?? '') &&
  !UNSCATTERABLE.test(party.logoRestrictions ?? '')

/** Every scatterable mark on the roster, country order. The pool a decorative
 *  field samples — never `PARTIES` itself, which is 40% unusable here. */
export const decorativeLogos = (): Party[] =>
  (Object.keys(PARTIES) as ISOCountryCode[]).flatMap(isoCode =>
    partiesOf(isoCode).filter(isDecorativeLogo)
  )

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
 * Seats, standing and alliance all ride the roster now, which polity fills:
 * one record per bench, rather than an election article joined to a separate
 * party list by name. The roster also supplies what a bloc looks like — its
 * logo and colour — so nothing has to be joined here at all.
 */
export interface Bench {
  /** The party, as the roster names it. */
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
  const roster = partiesOf(isoCode)
  const seated = roster.filter(party => party.seats)
  if (!seated.length) return []
  const total = PARTIES[isoCode]?.declaredSeats ?? seated.reduce((sum, p) => sum + p.seats!, 0)
  if (!total) return []

  // One record per bench. What used to stand here read a separate ELECTIONS
  // file and matched each of its party names back against this roster — two
  // sources that could disagree about the same chamber, joined by a name
  // comparison. The roster now carries the seats itself, so there is nothing
  // to match.
  return seated
    .map(party => ({
      name: party.name,
      seats: party.seats!,
      share: party.seatShare ?? party.seats! / total,
      party,
      ...(party.alliance ? { alliance: party.alliance } : {}),
      ...(party.groupings?.length ? { groupings: party.groupings } : {}),
    }))
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
/**
 * What a country calls its lower house.
 *
 * The election infobox names one for exactly ONE country (Poland's Sejm) —
 * everywhere else the field holds the article's title, which `chamberName`
 * rejects. So the names are curated here: a chamber is renamed roughly never,
 * and "the Riksdag" is the half of this round worth teaching.
 *
 * Only distinctive names earn a row. A country whose house is called the
 * "National Assembly" or the "House of Representatives" teaches nothing by
 * being named, and reads worse than "the Swedish chamber".
 */
const CHAMBER_NAMES: { [isoCode in ISOCountryCode]?: string } = {
  CA: 'House of Commons',
  DE: 'Bundestag',
  DK: 'Folketing',
  EE: 'Riigikogu',
  ES: 'Congreso de los Diputados',
  FI: 'Eduskunta',
  GB: 'House of Commons',
  ID: 'Dewan Perwakilan Rakyat',
  IE: 'Dáil Éireann',
  IL: 'Knesset',
  IN: 'Lok Sabha',
  IS: 'Althing',
  IT: 'Camera dei Deputati',
  JP: 'House of Representatives',
  LT: 'Seimas',
  LV: 'Saeima',
  NL: 'Tweede Kamer',
  NO: 'Storting',
  PL: 'Sejm',
  SE: 'Riksdag',
  UA: 'Verkhovna Rada',
}

export const chamberName = (isoCode: ISOCountryCode): string | undefined => {
  // The curated table stays as an override — a handful of chambers a player
  // knows by a name the source does not print.
  const curated = CHAMBER_NAMES[isoCode]
  if (curated) return curated
  // Otherwise the chamber's own name, which polity resolves for every country.
  // What stood here read an election ARTICLE title and then had to guard
  // against getting one — stripping anything containing "election" or opening
  // with a year, because "2022 Swedish general election" is not a chamber.
  return PARTIES[isoCode]?.legislature?.trim() || undefined
}

/** The chamber's full size, which the benches are a fraction of. */
export const chamberSeats = (isoCode: ISOCountryCode): number | undefined => {
  const entry = PARTIES[isoCode]
  if (!entry) return undefined
  return entry.declaredSeats ?? entry.listedSeats
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
  // Keyed on the ROSTER, which is every country polity resolved a chamber for.
  // This used to walk ELECTIONS, a file of 71 hand-seeded election articles,
  // so a country could hold a full, correct chamber and still be unreachable
  // because nobody had listed its election. That capped the pool at 66 while
  // 123 countries held a nameable government.
  (Object.keys(PARTIES) as ISOCountryCode[]).filter(
    isoCode => benchesOf(isoCode).length >= minimumBenches
  )
