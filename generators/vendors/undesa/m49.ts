import { COUNTRIES } from '~~/data/countries.gen'
import { type ISOCountryCode, isValidISOCode } from '~~/types/geography.types'

/**
 * UN M49 numeric location codes → ISO 3166-1 alpha-2, for the DESA migrant
 * stock matrix. The matrix names 233 entities; 176 match the game's own
 * English names outright, so only the UN's naming conventions are listed
 * here. Everything else it ships — dependencies, overseas collectivities and
 * the SARs (Hong Kong, Réunion, Puerto Rico, Greenland…) — is not a playable
 * country and drops silently through the isValidISOCode gate, exactly as the
 * WPP and BACI generators drop their non-ISO rows.
 *
 * Codes at or above 900 are regional and development-group aggregates
 * ("World", "Sub-Saharan Africa"). The generator drops those on their numeric
 * code before a name ever reaches this table — belt and braces, since their
 * names would also fail to resolve here.
 */
const UN_NAME_ALIASES: { [unName: string]: ISOCountryCode } = {
  'bolivia (plurinational state of)': 'BO',
  'brunei darussalam': 'BN',
  'china, taiwan province of china': 'TW',
  "dem. people's republic of korea": 'KP',
  'iran (islamic republic of)': 'IR',
  "lao people's democratic republic": 'LA',
  myanmar: 'MM',
  'republic of korea': 'KR',
  'republic of moldova': 'MD',
  'russian federation': 'RU',
  'state of palestine': 'PS',
  'syrian arab republic': 'SY',
  türkiye: 'TR',
  'united republic of tanzania': 'TZ',
  'united states of america': 'US',
  'venezuela (bolivarian republic of)': 'VE',
  'micronesia (fed. states of)': 'FM',
}

/** The UN marks several names with a trailing asterisk footnote. */
const normalize = (raw: string) =>
  raw
    .replace(/\*+$/, '')
    .trim()
    .replace(/^the\s+/i, '')
    .toLowerCase()

/** English name → ISO, built from the game's own country table. */
const byEnglishName = (): Map<string, ISOCountryCode> => {
  const lookup = new Map<string, ISOCountryCode>()
  for (const country of Object.values(COUNTRIES)) {
    lookup.set(normalize(country.name.english), country.isoCode)
  }
  return lookup
}

const englishNames = byEnglishName()

/**
 * Resolve one of the matrix's location names to a playable country, or
 * undefined when it names something the game does not play.
 */
export const resolveUnLocation = (name: string): ISOCountryCode | undefined => {
  const key = normalize(name)
  const iso = UN_NAME_ALIASES[key] ?? englishNames.get(key)
  return iso && isValidISOCode(iso) ? iso : undefined
}
