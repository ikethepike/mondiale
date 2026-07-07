import { COUNTRIES } from '~~/data/countries.gen'
import { ISOCountryCodes } from '~~/data/iso-codes.gen'
import type { GameVariant } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * Regions folded into a broader playable variant — the dataset splits the
 * Middle East out of Asia, but as a board it belongs to the Asia game
 * (otherwise those countries appear in no continental variant at all).
 */
const VARIANT_EXTRA_REGIONS: { [variant in GameVariant]?: string[] } = {
  asia: ['middle-east'],
}

/**
 * The countries a game variant plays with. Every dealer draws its subjects
 * from this pool so a Europe game asks about Europe — decoys and neighbour
 * answers may still reach outside it where the question demands (a border
 * doesn't stop at the variant's edge).
 */
export const variantCountries = (variant: GameVariant = 'world'): ISOCountryCode[] => {
  if (variant === 'world') return [...ISOCountryCodes]
  const regions = new Set<string>([variant, ...(VARIANT_EXTRA_REGIONS[variant] ?? [])])
  return ISOCountryCodes.filter(isoCode => regions.has(COUNTRIES[isoCode].region))
}
