import { COUNTRIES } from '~~/data/countries.gen'
import { LEADERS } from '~~/data/leaders.gen'
import type { ISOCountryCode } from '~~/types/geography.types'
import type { MediaCredit } from './attribution'
import { mentionsCountry } from './country'
import { editDistance } from './strings'

export interface LeaderProfile extends MediaCredit {
  name: string
  image?: string
  description?: string
  office?: string
  party?: string
  bornYear?: number
  sinceYear?: number
}

/** Regnal numerals stay uppercase (Leo XIV, Frederik X). */
const ROMAN_NUMERAL = /^[IVXLCDM]+$/

/**
 * The factbook prints surnames in shouting caps ("Karin KELLER-SUTTER").
 * Soften only the all-caps words to title case — per hyphen/apostrophe
 * segment — leaving mixed-case words, particles, and regnal numerals alone.
 */
export const titlecaseLeader = (name: string): string =>
  name.replace(/[A-ZÀ-ÞŒ]{2,}(?:['’-][A-ZÀ-ÞŒ]+)*/g, word => {
    if (ROMAN_NUMERAL.test(word)) return word
    return word.toLowerCase().replace(/(?:^|['’-])\p{L}/gu, letter => letter.toUpperCase())
  })

const LEADER_TITLE_NOISE = new Set([
  'the',
  'king',
  'queen',
  'president',
  'prime',
  'minister',
  'chancellor',
  'taoiseach',
  'interim',
  'caretaker',
  'transition',
  'transitional',
  'general',
  'leader',
])

/** Name tokens robust to titles, diacritics and punctuation. */
const leaderNameTokens = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z]+/)
    .filter(token => token.length >= 3 && !LEADER_TITLE_NOISE.has(token))

/**
 * Same person? Tokens match fuzzily (Christodoulidis≈Christodoulides,
 * Tiani≈Tchiani — transliterations drift between sources). The ONE leader
 * name matcher: quiz dealing and reveal copy select through the same ruler.
 */
export const leaderNamesOverlap = (a?: string, b?: string): boolean => {
  if (!a || !b) return false
  const aTokens = leaderNameTokens(a)
  const bTokens = leaderNameTokens(b)
  return aTokens.some(tokenA =>
    bTokens.some(tokenB => {
      const budget = Math.min(tokenA.length, tokenB.length) >= 6 ? 2 : 1
      return editDistance(tokenA, tokenB, budget) <= budget
    })
  )
}

/**
 * The POLITICAL leader to surface for a country — never a ceremonial
 * figurehead by accident, and the ONE selector, so the quiz dealer and the
 * reveal can't disagree. Selection order:
 *  1. The role whose name matches the factbook's `government.leader`
 *     (fuzzy — transliterations drift between sources).
 *  2. The role the factbook's TITLE names ("Prime Minister…" → government,
 *     "President/King…" → state).
 *  3. Head of government — the political office by construction; defaulting
 *     to head of state was how Thailand dealt its king.
 * `requireImage` narrows the pick to roles with a portrait (the quiz needs a
 * face); reveals leave it off and fall back to the name.
 */
export const politicalLeader = (
  isoCode: ISOCountryCode,
  options: { requireImage?: boolean } = {}
): LeaderProfile | undefined => {
  const entry = LEADERS[isoCode]
  if (!entry) return undefined
  const eligible = (role?: LeaderProfile) =>
    role && (!options.requireImage || role.image) ? role : undefined
  const state = eligible(entry.headOfState)
  const government = eligible(entry.headOfGovernment)
  if (!state && !government) return undefined

  const factbookLeader = COUNTRIES[isoCode]?.government?.leader ?? ''

  const named = [state, government].find(role => leaderNamesOverlap(role?.name, factbookLeader))
  const byTitle = /prime minister|chancellor|taoiseach|premier/i.test(factbookLeader)
    ? government
    : /president|king|queen|emir|sultan|emperor|pope/i.test(factbookLeader)
      ? state
      : undefined

  return named ?? byTitle ?? government ?? state
}

/**
 * The best one-line title for a leader. Wikidata's P39 office often resolves to
 * a legislative SEAT ("member of the German Bundestag") that outranks the real
 * executive office by start date — so when the `office` looks like a seat, fall
 * back to the authoritative `description` ("Prime Minister of France since
 * 2025"), trimmed of its trailing "since YEAR" (we show tenure separately).
 */
const SEAT_OFFICE = /member of|parliament|bundestag|congress|assembly|senate|deputy of/i

export const leaderTitle = (leader: LeaderProfile): string | undefined => {
  if (leader.office && !SEAT_OFFICE.test(leader.office)) return leader.office
  if (leader.description) {
    // "Prime Minister of France since 2025" → "Prime Minister of France"
    const trimmed = leader.description.replace(/\s+since\s+\d{4}.*$/i, '').trim()
    // Skip bare biographical descriptions ("French politician") — only use the
    // description as a title when it actually names an office.
    if (
      /president|minister|chancellor|monarch|king|queen|emir|premier|leader|governor|sultan|pope|chief/i.test(
        trimmed
      )
    ) {
      return trimmed
    }
  }
  return leader.office
}

/**
 * The leader as a `government.leader`-phrased prompt names them: the
 * political leader, but only when the profile is the SAME person the
 * factbook string phrases — a drifted profile would hint the wrong face or
 * party. Any surface hinting against a phrased leader selects through here.
 */
export const phrasedLeader = (isoCode: ISOCountryCode): LeaderProfile | undefined => {
  const profile = politicalLeader(isoCode)
  const phrased = COUNTRIES[isoCode]?.government?.leader
  return profile && leaderNamesOverlap(profile.name, phrased) ? profile : undefined
}

/** Wikidata's stand-in for a partyless politician; never a real answer. */
export const INDEPENDENT = 'independent politician'

/**
 * A leader's party as a view prints it, or nothing at all.
 *
 * Wikidata files a partyless leader under a phrase that says less than silence
 * does. "Independent" is technically true of Zelenskyy — Ukraine's presidents
 * conventionally suspend party membership on taking office — but a card that
 * prints it invites the reader to conclude he has no party behind him, when
 * Servant of the People holds 254 of the chamber's seats. The honest move is
 * to drop the row: a leader with no party to name simply gets no party line.
 *
 * The one place that call is made, so a hint chip and a reveal card can never
 * disagree about whether a leader HAS a party.
 */
export const partyLabel = (party: string): string | undefined =>
  party === INDEPENDENT ? undefined : party

/**
 * Short on-screen facts for a leader quiz option (easy/normal modes): party
 * and tenure start. Never the office — "President of France" answers the
 * question outright, while a party and a start year merely narrow it. The
 * party gets the same treatment when it names its own country or people
 * ("United Seychelles Party", "Congolese Party of Labour").
 */
export const leaderHintFacts = (leader: LeaderProfile, isoCode: ISOCountryCode): string[] => {
  const facts: string[] = []
  const party = leader.party ? partyLabel(leader.party) : undefined
  if (party && !mentionsCountry(party, isoCode)) facts.push(party)
  if (leader.sinceYear) facts.push(`in office since ${leader.sinceYear}`)
  return facts
}

/**
 * Is this exact name one of the country's leader roles? Shared leaders are
 * real — Charles III reigns over 14 realms, Macron co-rules Andorra — so a
 * portrait question must never offer two countries the same person leads.
 */
export const countryLedBy = (isoCode: ISOCountryCode, name: string): boolean => {
  const entry = LEADERS[isoCode]
  return entry?.headOfState?.name === name || entry?.headOfGovernment?.name === name
}

/** Both distinct roles for a country's atlas/reveal (state + government). */
export const leaderRoles = (
  isoCode: ISOCountryCode
): { role: 'Head of state' | 'Head of government'; leader: LeaderProfile }[] => {
  const entry = LEADERS[isoCode]
  if (!entry) return []
  const roles: { role: 'Head of state' | 'Head of government'; leader: LeaderProfile }[] = []
  if (entry.headOfState) roles.push({ role: 'Head of state', leader: entry.headOfState })
  // Only list government separately when it's a different person.
  if (entry.headOfGovernment && entry.headOfGovernment.name !== entry.headOfState?.name) {
    roles.push({ role: 'Head of government', leader: entry.headOfGovernment })
  }
  return roles
}
