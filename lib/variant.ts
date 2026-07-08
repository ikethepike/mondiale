import { COUNTRIES } from '~~/data/countries.gen'
import { ISOCountryCodes } from '~~/data/iso-codes.gen'
import type { GameVariant } from '~~/types/game.types'
import type { ISOCountryCode, Region } from '~~/types/geography.types'

/** Player-facing region names (regions are stored as kebab-case slugs). */
export const REGION_LABELS: { [region in Region]: string } = {
  africa: 'Africa',
  asia: 'Asia',
  europe: 'Europe',
  'middle-east': 'the Middle East',
  'north-america': 'North America',
  oceania: 'Oceania',
  'south-america': 'South America',
}

/**
 * Regions folded into a broader playable variant — the dataset splits the
 * Middle East out of Asia, but as a board it belongs to the Asia game
 * (otherwise those countries appear in no continental variant at all).
 */
const VARIANT_EXTRA_REGIONS: { [variant in GameVariant]?: string[] } = {
  asia: ['middle-east'],
}

/**
 * Countries that play on more than one continental board despite the single
 * `region` the dataset stores. Transcontinental states are the honest case:
 * Russia sits mostly in Asia by our taxonomy but is unmistakably a European
 * power too, so it appears on both boards.
 *
 * This only widens the continental POOLS. The stored `region` is left alone,
 * so world mode, the "which region is X in?" question, and its validation
 * (which compare the single stored value) are untouched.
 */
const COUNTRY_EXTRA_VARIANTS: { [isoCode in ISOCountryCode]?: GameVariant[] } = {
  RU: ['europe'], // stored as asia; a European power too
  TR: ['europe'], // stored as middle-east (→ asia board); straddles the Bosphorus
  EG: ['asia'], // stored as africa; the Sinai is in Asia, borders IL/PS
}

/** Does a country belong to a variant's board — by region or by extra membership? */
export const countryInVariant = (isoCode: ISOCountryCode, variant: GameVariant): boolean => {
  if (variant === 'world') return true
  const region = COUNTRIES[isoCode].region
  if (region === variant) return true
  if (VARIANT_EXTRA_REGIONS[variant]?.includes(region)) return true
  return COUNTRY_EXTRA_VARIANTS[isoCode]?.includes(variant) ?? false
}

/**
 * The countries a game variant plays with. Every dealer draws its subjects
 * from this pool so a Europe game asks about Europe — decoys and neighbour
 * answers may still reach outside it where the question demands (a border
 * doesn't stop at the variant's edge).
 */
export const variantCountries = (variant: GameVariant = 'world'): ISOCountryCode[] => {
  if (variant === 'world') return [...ISOCountryCodes]
  return ISOCountryCodes.filter(isoCode => countryInVariant(isoCode, variant))
}
