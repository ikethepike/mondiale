import type { Fame } from './fame.types'
import type { ISOCountryCode } from './geography.types'

export const CLAIM_FAMILIES = [
  'borders',
  'language',
  'capital',
  'currency',
  'club',
  'rank',
  'versus',
  'trade',
  'clock',
  'river',
] as const

export type ClaimFamily = (typeof CLAIM_FAMILIES)[number]

/** What a claim's receipt draws once its seat is graded. */
export type ClaimEvidence =
  | { kind: 'countries'; label: string; countries: ISOCountryCode[] }
  | {
      kind: 'bars'
      label: string
      rows: { isoCode?: ISOCountryCode; name: string; value: number; display: string }[]
    }

/**
 * One stamped claim from the Two Truths deck (`data/claims.gen.ts`). Truth,
 * plausibility and fame are stamped by the generator; nothing re-derives them
 * at deal time.
 */
export interface Claim {
  id: string
  family: ClaimFamily
  /** Claims sharing a topic answer each other — a sheet holds one at most. */
  topic: string
  /** Whose card it is: the country the sheet is about. */
  subject: ISOCountryCode
  /** Every country the sentence names, subject first. */
  countries: ISOCountryCode[]
  text: string
  truth: boolean
  /** How true the claim SOUNDS to someone reasoning from the obvious proxy
   *  (size for population, neighbours for borders…), 0–1. Spice is the gap
   *  between this and `truth`. */
  plausibility: number
  fame: Fame
  /** The receipt's line: what is actually so. */
  note: string
  evidence: ClaimEvidence
}

/** A claim as dealt — the sentence, never its verdict. */
export type TwoTruthsCard = Pick<Claim, 'id' | 'family' | 'text' | 'countries'>

/** A graded card's receipt, delivered only to a socket allowed to see it. */
export interface TwoTruthsReceipt {
  index: number
  truth: boolean
  note: string
  evidence: ClaimEvidence
  /** The claim rang the opposite of what it was — the reveal says so. */
  trap: boolean
}

export type TwoTruthsStamp = 'true' | 'lie'

/** One seat's sheet: a stamp per card, `null` where the card was left blank. */
export type TwoTruthsSheet = (TwoTruthsStamp | null)[]
