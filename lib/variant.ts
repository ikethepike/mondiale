import { COUNTRIES } from '~~/data/countries.gen'
import { ISOCountryCodes } from '~~/data/iso-codes.gen'
import { boardRegions, type BoardRegion, type Game, type GameVariant } from '~~/types/game.types'
import type { ISOCountryCode, Region } from '~~/types/geography.types'
import { listJoin } from './strings'

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
  // Generated datasets can smuggle in codes outside the playable set (typed as
  // ISOCountryCode but never typechecked at generation time) — exclude, never throw.
  const region = COUNTRIES[isoCode]?.region
  if (!region) return false
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

/** The board a home-page template opens: its one continent, or the whole world. */
export const regionsForVariant = (variant: GameVariant): BoardRegion[] =>
  variant === 'world' ? [] : [variant]

/** Deduped and in picker order, so one board always reads (and keys) the same. */
export const normalizeBoardRegions = (regions: readonly BoardRegion[]): BoardRegion[] =>
  boardRegions.filter(region => regions.includes(region))

export const isWorldBoard = (regions: readonly BoardRegion[]): boolean => !regions.length

/** The lobby's pick: World clears the board, a continent toggles in or out —
 *  and dropping the last one leaves the whole world. */
export const toggleBoardRegion = (
  regions: readonly BoardRegion[],
  picked: GameVariant
): BoardRegion[] => {
  if (picked === 'world') return []
  return regions.includes(picked)
    ? regions.filter(region => region !== picked)
    : normalizeBoardRegions([...regions, picked])
}

/** Does a country belong to a board — on any one of its regions? */
export const countryOnBoard = (isoCode: ISOCountryCode, regions: readonly BoardRegion[]): boolean =>
  isWorldBoard(regions) || regions.some(region => countryInVariant(isoCode, region))

/** The board in words, ready to follow "in": "Europe", "Europe and Africa", "the world". */
export const boardLabel = (regions: readonly BoardRegion[]): string =>
  isWorldBoard(regions) ? 'the world' : listJoin(regions.map(region => REGION_LABELS[region]))

/**
 * Rooms saved before a board could hold several regions carry one `variant`
 * and single-region language `scope`s. Upgraded in place on fetch.
 */
export const upgradeLegacyBoard = (game: Game): void => {
  const legacy = game as Game & { variant?: GameVariant }
  if (!legacy.regions) legacy.regions = regionsForVariant(legacy.variant ?? 'world')
  delete legacy.variant
  for (const { groupChallenge } of game.rounds ?? []) {
    const scoped = groupChallenge as { scope?: BoardRegion | BoardRegion[] } | undefined
    if (scoped && typeof scoped.scope === 'string') scoped.scope = [scoped.scope]
  }
}
