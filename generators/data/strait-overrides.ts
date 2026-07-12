import type { ISOCountryCode } from '../../types/geography.types'

/**
 * Editorial corrections to the computed strait graph (create-straits-file).
 * Exclusions drop a pair even when its coastlines sit within the threshold;
 * additions force a pair in from beyond it. Review every run's output in
 * generators/data/straits-report.txt before touching these.
 */
export const STRAIT_EXCLUSIONS: [ISOCountryCode, ISOCountryCode][] = [
  // Both measured to Navassa Island — an uninhabited US islet in the Windward
  // Passage. "The US borders Haiti" is technically true and terrible gameplay.
  ['HT', 'US'],
  ['JM', 'US'],
]

/**
 * Real maritime neighbours whose NEAREST crossings all graze a third country's
 * median-line waters, so the Voronoi test drops them.
 */
export const STRAIT_ADDITIONS: [ISOCountryCode, ISOCountryCode][] = [
  // Otranto grazes Albania; Italian–Greek waters meet just south (Bari–Igoumenitsa ferries).
  ['GR', 'IT'],
  // Nuweiba–Aqaba ferry; the head-of-gulf crossing at Taba grazes Eilat.
  ['EG', 'JO'],
  // Timor Sea boundary (Ashmore); the Torres-side minimum grazes PNG waters.
  ['AU', 'ID'],
]
