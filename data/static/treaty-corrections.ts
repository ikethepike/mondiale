import type { ISOCountryCode } from '~~/types/geography.types'
import type { TreatyId, TreatyStatus } from '~~/types/treaty.type'

/**
 * Treaty status the UNTC scrape cannot supply, applied last in
 * generators/vendors/untc/create-treaties.ts.
 *
 * The European Convention on Human Rights is here in full rather than fetched:
 * the Council of Europe's own signature chart refuses scripted requests (403),
 * and Wikidata's item for the convention has no signatory statements at all.
 * It is a small, slow-moving list — 46 member states, all of which must ratify
 * the Convention as a condition of membership — so a curated table is honest
 * where a scrape would be fiction.
 *
 * Update when Council of Europe membership changes, then re-run
 * `generate:treaties`. Russia was expelled in March 2022 and ceased to be a
 * party that September.
 */

const partiesFrom = (isoCodes: readonly ISOCountryCode[]) =>
  Object.fromEntries(isoCodes.map(isoCode => [isoCode, { standing: 'party' } as TreatyStatus]))

/** The 46 Council of Europe member states, every one a party. */
const COUNCIL_OF_EUROPE: readonly ISOCountryCode[] = [
  'AL', 'AD', 'AM', 'AT', 'AZ', 'BE', 'BA', 'BG', 'HR', 'CY', 'CZ', 'DK',
  'EE', 'FI', 'FR', 'GE', 'DE', 'GR', 'HU', 'IS', 'IE', 'IT', 'LV', 'LI',
  'LT', 'LU', 'MT', 'MD', 'MC', 'ME', 'NL', 'MK', 'NO', 'PL', 'PT', 'RO',
  'SM', 'RS', 'SK', 'SI', 'ES', 'SE', 'CH', 'TR', 'UA', 'GB',
]

export const TREATY_CORRECTIONS: {
  [treaty in TreatyId]?: { [isoCode: string]: TreatyStatus }
} = {
  echr: {
    ...partiesFrom(COUNCIL_OF_EUROPE),
    // Expelled from the Council of Europe on 2022-03-16; ceased to be a party
    // to the Convention on 2022-09-16.
    RU: { standing: 'withdrawn', year: 2022 },
  },
}
