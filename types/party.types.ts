import type { ISOCountryCode } from './geography.types'
import type { MediaCredit } from '~~/lib/attribution'

/**
 * The party roster, as `data/parties.gen.ts` carries it.
 *
 * Lived in `generators/create-parties-file.ts` while that generator was the
 * only thing that produced this shape. It is now written by
 * `create-polity-file.ts` and read by `lib/parties.ts`, so the type belongs
 * with the other domain types rather than inside one of its two producers —
 * app code importing from `generators/` is exactly what CLAUDE.md forbids.
 */

export interface Party extends MediaCredit {
  /** As the Factbook lists it, parentheticals and abbreviation stripped. */
  name: string
  /** The party's own name, when the Factbook glosses it ("Centerpartiet"). */
  endonym?: string
  /** The Factbook's own abbreviation ("or AfD"), when it prints one. */
  abbreviation?: string
  /** Wikidata Q-id, when the party resolved past all three gates. */
  qid?: string
  /** Seats held, when the Factbook publishes a breakdown for this chamber. */
  seats?: number
  /** Share of the LISTED seats, 0–1. Computed, never parsed. */
  seatShare?: number
  /** Political ideologies (P1142), English labels. */
  ideologies?: string[]
  /** Left–right position (P1387), English label. */
  position?: string
  /** Party colours (P465) as bare hex, no leading `#`. */
  colors?: string[]
  /** Year founded (P571). */
  foundedYear?: number
  /** The Factbook's own endonym declares this an electoral coalition, not a
   *  party. Kept for the chamber's arithmetic; never dealt as a subject. */
  coalition?: boolean
  /** Logo path under /public, when one was saved. */
  logo?: string
  /** Commons' own `Restrictions` note — "trademarked" for most party logos. */
  logoRestrictions?: string
  /** Commons says the file is non-free (fair-use). Travels with the logo so a
   *  licensing policy is a filter rather than a re-run. */
  nonFree?: boolean
  /** Transnational groupings this party belongs to (P463, open statements
   *  only): the EPP, the Progressive Alliance, Socialist International. */
  groupings?: string[]
  /**
   * Which side of the chamber this party sits on.
   *
   * From polity, where it is decided at the source and checked against the
   * chamber's own seat total. This replaces the whole cabinet-name-matching
   * route: the previous generator read a cabinet list from Wikipedia and tried
   * to match its party names against this roster's, through a normaliser that
   * stripped articles, diacritics, trailing country disambiguators and " or "
   * aliases — with a coverage floor to catch the joins that still went wrong.
   * Croatia used to file its real 61-seat government as opposition because of
   * it.
   *
   * Absent for a party that holds no seats in the chamber.
   */
  standing?: 'government' | 'backing' | 'opposition' | 'speaker' | 'non_attached' | 'vacant'
  /**
   * The NATIONAL bloc this party stood in — Sweden's Red-Greens, Poland's
   * United Right. What orders a hemicycle rather than a bare seat ranking.
   */
  alliance?: string
  /**
   * This is the party the head of government belongs to.
   *
   * Resolved by Q-id at the source, which is the only way it works: the leader
   * frequently does not sit under their own party's name. France's chamber
   * seats "Together for the Republic group" while Macron leads Renaissance,
   * Poland's seats "Civic Coalition" while Tusk leads Civic Platform, Brazil's
   * seats "Brazil of Hope" while Lula leads the Workers' Party. Matching the
   * leader's party NAME against bench names found none of those.
   */
  leads?: boolean
}

export interface CountryParties {
  parties: Party[]
  /** The chamber the seat counts describe, as the Factbook names it. */
  legislature?: string
  /** 'unicameral' | 'bicameral', as the Factbook states it. */
  structure?: string
  /** The chamber's declared size — may exceed the listed seats. */
  declaredSeats?: number
  /** Sum of the seats actually listed; the seatShare denominator. */
  listedSeats?: number
  /** The Factbook's most recent legislative election date, verbatim. */
  lastElection?: string
}

export type PartyMapping = { [isoCode in ISOCountryCode]?: CountryParties }
