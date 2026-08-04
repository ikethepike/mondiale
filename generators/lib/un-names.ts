import { COUNTRIES } from '~~/data/countries.gen'
import { type ISOCountryCode, isValidISOCode } from '~~/types/geography.types'

/**
 * UN location names → ISO 3166-1 alpha-2, shared by every generator reading a
 * UN table (the DESA migrant stock matrix, the Treaty Collection's status
 * pages). Most names match the game's own English names outright, so only the
 * UN's own naming conventions are listed here — formal long forms, endonyms
 * ("Naoero" for Nauru) and the parenthetical style.
 *
 * Everything else those tables ship — dependencies, overseas collectivities,
 * the SARs, the Cook Islands and Niue — is not a playable country and drops
 * silently through the isValidISOCode gate, exactly as the WPP and BACI
 * generators drop their non-ISO rows.
 */
const UN_NAME_ALIASES: { [unName: string]: ISOCountryCode } = {
  'bahamas (the)': 'BS',
  'bolivia (plurinational state of)': 'BO',
  'brunei darussalam': 'BN',
  'china, taiwan province of china': 'TW',
  'czech republic': 'CZ',
  "dem. people's republic of korea": 'KP',
  "democratic people's republic of korea": 'KP',
  'iran (islamic republic of)': 'IR',
  "lao people's democratic republic": 'LA',
  'micronesia (fed. states of)': 'FM',
  'micronesia (federated states of)': 'FM',
  myanmar: 'MM',
  naoero: 'NR',
  'netherlands (kingdom of the)': 'NL',
  'republic of korea': 'KR',
  'republic of moldova': 'MD',
  'russian federation': 'RU',
  'st. kitts and nevis': 'KN',
  'st. lucia': 'LC',
  'state of palestine': 'PS',
  'syrian arab republic': 'SY',
  türkiye: 'TR',
  'united kingdom of great britain and northern ireland': 'GB',
  'united republic of tanzania': 'TZ',
  'united states of america': 'US',
  'venezuela (bolivarian republic of)': 'VE',
  'viet nam': 'VN',
}

/** UN tables mark several names with a trailing asterisk or footnote number. */
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
 * Resolve a UN table's location name to a playable country, or undefined when
 * it names something the game does not play.
 */
export const resolveUnLocation = (name: string): ISOCountryCode | undefined => {
  const key = normalize(name)
  const iso = UN_NAME_ALIASES[key] ?? englishNames.get(key)
  return iso && isValidISOCode(iso) ? iso : undefined
}
