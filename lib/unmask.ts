import { COUNTRIES } from '~~/data/countries.gen'
import { INDEPENDENT, leaderTitle, quizLeader, type LeaderProfile } from './leaders'
import { governingParty, partySpectrum, SPECTRUM_LABELS, type Spectrum } from './parties'
import { mentionsCountry } from './country'
import { REGION_LABELS } from './variant'
import type { UnmaskClue, UnmaskOffice, UnmaskRungKind } from '~~/types/challenges/group-modes.type'
import type { ISOCountryCode, Region } from '~~/types/geography.types'

/**
 * What an Unmask file can say — the facts, the field they narrow and the copy
 * — shared by the dealer and the view. The portrait pixels and the answer
 * never live here: they are server data (`unmask-deal.ts`). The clock and the
 * pay are data-free and live in `unmask-pace.ts`.
 */

/** Keyed by the person as well as the file: a regenerated roster reuses
 *  `/leaders/XX-government.webp` for whoever holds the office next. */
export const unmaskPortraitKey = (leader: Pick<LeaderProfile, 'image' | 'name'>) =>
  `${leader.image}#${leader.name}`

const OFFICE_PATTERNS: [UnmaskOffice, RegExp][] = [
  ['monarch', /\b(king|queen|emir|sultan|prince|grand duke|monarch|emperor|pope)\b/i],
  ['premier', /\b(prime minister|premier|chancellor|taoiseach)\b/i],
  ['president', /\bpresident\b/i],
]

/** The office title decides; the description only where the title names no
 *  office — Macron's reads "president of France and Co-Prince of Andorra". */
export const unmaskOffice = (leader: LeaderProfile): UnmaskOffice => {
  const read = (text = '') => OFFICE_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0]
  return read(leaderTitle(leader)) ?? read(leader.description) ?? 'ruler'
}

const NAME_PARTICLES = new Set([
  'al',
  'bin',
  'bint',
  'ibn',
  'da',
  'de',
  'del',
  'der',
  'di',
  'dos',
  'du',
  'el',
  'la',
  'le',
  'van',
  'von',
])

/** "Emmanuel Macron" → "E. M." — particles drop, regnal numerals stay whole. */
export const unmaskInitials = (name: string): string =>
  name
    .split(/[\s-]+/)
    .filter(word => word && !NAME_PARTICLES.has(word.toLowerCase()))
    .map(word => (/^[IVXL]+$/.test(word) ? word : `${word[0]!.toUpperCase()}.`))
    .join(' ')

export interface UnmaskFacts {
  leader: LeaderProfile
  region: Region
  office: UnmaskOffice
  /** Birth decade. */
  born?: number
  since?: number
  /** Undefined where the leader has a party we cannot place. */
  band?: Spectrum | 'none'
  /** The roster's logo file and shape, when the governing party has one. */
  logo?: { path: string; ratio?: number }
}

/**
 * What a file can say about a country's leader, or nothing when the country
 * cannot be a subject: no single leader, no portrait, or a name that names
 * its own country ("…of Brunei").
 */
const factsCache = new Map<ISOCountryCode, UnmaskFacts | undefined>()

export const unmaskFacts = (isoCode: ISOCountryCode): UnmaskFacts | undefined => {
  if (!factsCache.has(isoCode)) factsCache.set(isoCode, readFacts(isoCode))
  return factsCache.get(isoCode)
}

const readFacts = (isoCode: ISOCountryCode): UnmaskFacts | undefined => {
  const leader = quizLeader(isoCode)
  const country = COUNTRIES[isoCode]
  if (!leader?.image || !country || mentionsCountry(leader.name, isoCode)) return undefined
  const party = governingParty(isoCode)
  const partyless = !party && (!leader.party || leader.party === INDEPENDENT)
  const band = party ? partySpectrum(party) : partyless ? 'none' : undefined
  return {
    leader,
    region: country.region,
    office: unmaskOffice(leader),
    ...(leader.bornYear ? { born: Math.floor(leader.bornYear / 10) * 10 } : {}),
    ...(leader.sinceYear ? { since: leader.sinceYear } : {}),
    ...(band ? { band } : {}),
    ...(party?.logo ? { logo: { path: party.logo, ratio: party.logoRatio } } : {}),
  }
}

/** Does this clue fit that country's file? Undefined for a clue that names no
 *  property another file could share (a picture, a name). */
export const clueAdmits = (clue: UnmaskClue, facts: UnmaskFacts): boolean | undefined => {
  switch (clue.kind) {
    case 'region':
      return facts.region === clue.region
    case 'born':
      return facts.born === clue.decade
    case 'tenure':
      return facts.since === clue.since
    case 'office':
      return facts.office === clue.office
    case 'party':
      return facts.band === clue.band
    default:
      return undefined
  }
}

/**
 * The suspects still lit after each rung. A narrowing clue applies only while
 * the field stays at `floor` or above — past that it still shows, but the map
 * stops doing the player's reasoning for them. The subject is never dimmed.
 */
export const narrowFields = (
  suspects: readonly ISOCountryCode[],
  clues: readonly UnmaskClue[],
  factsOf: (isoCode: ISOCountryCode) => UnmaskFacts | undefined,
  floor: number
): ISOCountryCode[][] => {
  let field = [...suspects]
  return clues.map(clue => {
    const narrowed = field.filter(isoCode => {
      const facts = factsOf(isoCode)
      return !!facts && clueAdmits(clue, facts) !== false
    })
    if (narrowed.length >= floor) field = narrowed
    return field
  })
}

/** The wash every suspect still lit wears on the map. */
export const UNMASK_SUSPECT_FILL = 'hsla(36, 88%, 60%, 0.55)'

export const OFFICE_LINES: Record<UnmaskOffice, string> = {
  monarch: 'Reigns as a monarch',
  president: 'Governs as president',
  premier: 'Heads the government, not the state',
  ruler: 'Rules under another title',
}

/** A rung as the file prints it: its label and its line. Pictures have no line. */
export const unmaskClueLine = (clue: UnmaskClue): { label: string; line?: string } => {
  switch (clue.kind) {
    case 'portrait':
      return { label: 'Photograph' }
    case 'region':
      return { label: 'Region', line: REGION_LABELS[clue.region] }
    case 'born':
      return { label: 'Born', line: `In the ${clue.decade}s` }
    case 'tenure':
      return { label: 'In office', line: `Since ${clue.since}` }
    case 'office':
      return { label: 'Office', line: OFFICE_LINES[clue.office] }
    case 'party':
      return {
        label: 'Party',
        line: clue.band === 'none' ? 'Answers to no party' : `${SPECTRUM_LABELS[clue.band]} party`,
      }
    case 'logo':
      return { label: 'Party mark' }
    case 'initials':
      return { label: 'Initials', line: clue.initials }
    case 'name':
      return { label: 'Name', line: clue.name }
  }
}

export const UNMASK_RUNG_LABELS: Record<UnmaskRungKind, string> = {
  portrait: 'Photograph',
  region: 'Region',
  born: 'Born',
  tenure: 'In office',
  office: 'Office',
  party: 'Party',
  logo: 'Party mark',
  initials: 'Initials',
  name: 'Name',
}

/** Base64 RGB ↔ bytes, isomorphic (`atob`/`btoa` exist on both ends). */
export const decodePixels = (pixels: string): Uint8Array =>
  Uint8Array.from(atob(pixels), char => char.charCodeAt(0))

export const encodePixels = (bytes: Uint8Array): string =>
  btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''))

/** Area-average a square RGB image down to `to`×`to`; `to` must divide `from`. */
export const downsamplePixels = (bytes: Uint8Array, from: number, to: number): Uint8Array => {
  const block = from / to
  const out = new Uint8Array(to * to * 3)
  for (let y = 0; y < to; y++) {
    for (let x = 0; x < to; x++) {
      for (let channel = 0; channel < 3; channel++) {
        let sum = 0
        for (let dy = 0; dy < block; dy++) {
          for (let dx = 0; dx < block; dx++) {
            sum += bytes[((y * block + dy) * from + x * block + dx) * 3 + channel]!
          }
        }
        out[(y * to + x) * 3 + channel] = Math.round(sum / (block * block))
      }
    }
  }
  return out
}
