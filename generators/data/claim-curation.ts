import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * Human rulings the Two Truths deck cannot derive. Every entry is a place the
 * data is right by its own rules and still wrong to put in front of a player
 * as a flat true-or-false.
 */

/** Countries whose capital is split or contested: "the capital is X" has two
 *  defensible answers, so neither a truth nor a lie may be dealt about it. */
export const SPLIT_CAPITALS: ReadonlySet<ISOCountryCode> = new Set<ISOCountryCode>([
  'BO', // Sucre constitutional, La Paz the seat of government
  'ZA', // three capitals
  'CI', // Yamoussoukro official, Abidjan the seat in practice
  'BJ', // Porto-Novo official, Cotonou the seat of government
  'LK', // Kotte official, Colombo the commercial capital
  'SZ', // Lobamba royal and legislative, Mbabane administrative
  'MY', // Kuala Lumpur official, Putrajaya administrative
  'NL', // Amsterdam constitutional, The Hague the seat
  'IL', // contested
  'PS', // contested
  'BI', // Gitega political since 2019, Bujumbura economic
  'GQ', // Ciudad de la Paz on paper, Malabo in practice
])

/**
 * Territories whose status is disputed. No border claim names one or runs a
 * near miss through one — "Albania borders Serbia" is true or false
 * depending on who you ask about Kosovo.
 */
export const CONTESTED: ReadonlySet<ISOCountryCode> = new Set<ISOCountryCode>(['XK', 'PS'])

/** Pairs the border data separates but a claimant joins: Morocco administers
 *  the Western Sahara coast that meets Mauritania. */
export const CONTESTED_BORDERS: readonly (readonly [ISOCountryCode, ISOCountryCode])[] = [
  ['MA', 'MR'],
]

/** Languages with a legal status short of national officiality — calling
 *  "official" a lie there is arguable, so no claim is dealt either way. */
export const MINORITY_LANGUAGES: readonly (readonly [ISOCountryCode, string])[] = [
  ['SE', 'Finnish'],
  ['NO', 'Finnish'],
  ['FI', 'Russian'],
  ['HU', 'German'],
]

/** Currencies the dataset files under one code while another circulates as
 *  legal tender — a claim either way would be arguable. */
export const DISPUTED_CURRENCY: ReadonlySet<ISOCountryCode> = new Set<ISOCountryCode>([
  'ZW', // dollarised, then the ZiG from 2024
  'PA', // the balboa and the US dollar side by side
  'LR', // Liberian and US dollars both legal tender
  'KH', // riel and dollar in daily use
])

/** Euro adopters recent enough that "uses the euro" still surprises. */
export const RECENT_EURO: ReadonlySet<ISOCountryCode> = new Set<ISOCountryCode>(['HR', 'BG'])

/**
 * Rivers the deck may name, with their prose name and the countries a lie may
 * NOT claim. A river on the terrain roster already carries both in its key —
 * its `accepted` tier is never a lie — so `disputed` only covers the rivers off
 * it, whose touch lists still trace Natural Earth's segments.
 */
export const CLAIM_RIVERS: Record<string, { name: string; disputed?: ISOCountryCode[] }> = {
  'river-danube': { name: 'the Danube' },
  'river-rhine': { name: 'the Rhine' },
  'river-elbe': { name: 'the Elbe' },
  'river-dnieper': { name: 'the Dnieper' },
  'river-nile': { name: 'the Nile' },
  'river-congo': { name: 'the Congo River' },
  'river-niger': { name: 'the Niger River' },
  'river-zambezi': { name: 'the Zambezi' },
  'river-limpopo': { name: 'the Limpopo' },
  'river-orange': { name: 'the Orange River' },
  'river-okavango': { name: 'the Okavango' },
  'river-senegal': { name: 'the Senegal River' },
  'river-amazonas': { name: 'the Amazon' },
  'river-orinoco': { name: 'the Orinoco' },
  'river-uruguay': { name: 'the Uruguay River' },
  'river-rio-grande': { name: 'the Rio Grande' },
  'river-colorado': { name: 'the Colorado River' },
  'river-columbia': { name: 'the Columbia River' },
  'river-yukon': { name: 'the Yukon' },
  'river-euphrates': { name: 'the Euphrates' },
  'river-tigris': { name: 'the Tigris' },
  'river-indus': { name: 'the Indus' },
  'river-ganges': { name: 'the Ganges', disputed: ['NP'] },
  'river-brahmaputra': { name: 'the Brahmaputra' },
  'river-mekong': { name: 'the Mekong' },
  'river-salween': { name: 'the Salween' },
  'river-amu-darya': { name: 'the Amu Darya' },
  'river-syr-darya': { name: 'the Syr Darya' },
  'river-amur': { name: 'the Amur', disputed: ['MN'] },
}

/** Commodities by the phrase a sentence uses, and which ones a pub quiz
 *  would know. Anything absent is not dealt. */
export const CLAIM_COMMODITIES: Record<string, { phrase: string; major: boolean }> = {
  aircraft: { phrase: 'aircraft', major: true },
  bananas: { phrase: 'bananas', major: true },
  beef: { phrase: 'beef', major: false },
  cars: { phrase: 'cars', major: true },
  cobalt: { phrase: 'cobalt', major: false },
  'cocoa beans': { phrase: 'cocoa beans', major: true },
  coffee: { phrase: 'coffee', major: true },
  'copper ore': { phrase: 'copper ore', major: false },
  cotton: { phrase: 'raw cotton', major: false },
  'crude petroleum': { phrase: 'crude oil', major: true },
  'cut flowers': { phrase: 'cut flowers', major: false },
  diamonds: { phrase: 'diamonds', major: true },
  footwear: { phrase: 'footwear', major: false },
  garments: { phrase: 'clothing', major: true },
  gold: { phrase: 'gold', major: true },
  'iron ore': { phrase: 'iron ore', major: false },
  'natural gas': { phrase: 'natural gas', major: true },
  'olive oil': { phrase: 'olive oil', major: true },
  'palm oil': { phrase: 'palm oil', major: false },
  rice: { phrase: 'rice', major: true },
  rubber: { phrase: 'natural rubber', major: false },
  soybeans: { phrase: 'soybeans', major: false },
  tea: { phrase: 'tea', major: true },
  vanilla: { phrase: 'vanilla', major: false },
  watches: { phrase: 'watches', major: true },
  wheat: { phrase: 'wheat', major: true },
}
