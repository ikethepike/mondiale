import { COUNTRIES } from '~~/data/countries.gen'
import { LEADERS } from '~~/data/leaders.gen'
import type { ISOCountryCode } from '~~/types/geography.types'

export interface LeaderProfile {
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

/** Loose surname overlap between two leader-name strings (sources drift). */
const sharesName = (a?: string, b?: string): boolean => {
  if (!a || !b) return false
  const tokens = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .split(/[^a-z]+/)
      .filter(token => token.length >= 4)
  const bt = tokens(b)
  return tokens(a).some(token => bt.includes(token))
}

/**
 * The POLITICAL leader to surface for a country — matching the challenge
 * builder's selection so quiz and reveal agree. Prefers the role whose name
 * matches the factbook `government.leader`, then the role the factbook TITLE
 * implies, else head of government (the political office by construction).
 * Unlike the challenge's `portraitFor`, this does NOT require a portrait — the
 * caller can fall back to the name when `image` is absent.
 */
export const politicalLeader = (isoCode: ISOCountryCode): LeaderProfile | undefined => {
  const entry = LEADERS[isoCode]
  if (!entry) return undefined
  const state = entry.headOfState
  const government = entry.headOfGovernment
  if (!state && !government) return undefined

  const factbookLeader = COUNTRIES[isoCode]?.government?.leader ?? ''

  const named = [state, government].find(role => sharesName(role?.name, factbookLeader))
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
