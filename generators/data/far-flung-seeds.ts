import type { ISOCountryCode } from '../../types/geography.types'

/**
 * Far Flung's editorial roster: detached pieces of countries — exclaves and
 * famous far-from-home islands. The generator resolves each anchor to the map
 * ring that contains it and drops (with a warning) any seed whose ring falls
 * under the visibility floor or is missing from the projected map entirely
 * (France's overseas departments and Spain's Canaries are separate Natural
 * Earth map units, so they cannot be seeded here).
 *
 * Blurbs are reveal copy, but stay owner-free anyway — the reveal names the
 * owner with a flag chip, and copy that never says the name can never leak
 * into a prompt surface later. Enforced by the generator via mentionsCountry.
 */
export interface FarFlungSeed {
  slug: string
  iso: ISOCountryCode
  /** The fragment's own name — "Cabinda", "Alaska". */
  name: string
  /** One reveal line: what it is and what separates it from home. */
  blurb: string
  /** A point inside the fragment, to find its map ring. */
  anchor: { lat: number; lng: number }
}

export const FAR_FLUNG_SEEDS: FarFlungSeed[] = [
  {
    slug: 'alaska',
    iso: 'US',
    name: 'Alaska',
    blurb:
      'Bought from Russia in 1867 for two cents an acre — and cut off from the lower 48 by the whole width of western Canada.',
    anchor: { lat: 64.8, lng: -152.5 },
  },
  {
    slug: 'hawaii',
    iso: 'US',
    name: 'Hawaii',
    blurb:
      'The most isolated major island chain on Earth — nearly 4,000 km of open Pacific to the nearest continental coast.',
    anchor: { lat: 19.6, lng: -155.5 },
  },
  {
    slug: 'kaliningrad',
    iso: 'RU',
    name: 'Kaliningrad',
    blurb:
      'Once Prussian Königsberg, annexed in 1945 — a Baltic exclave walled off from the motherland by Lithuania and Poland.',
    anchor: { lat: 54.7, lng: 21.0 },
  },
  {
    slug: 'cabinda',
    iso: 'AO',
    name: 'Cabinda',
    blurb:
      'An oil-rich exclave cut off from the rest of its country by a strip of the Democratic Republic of the Congo.',
    anchor: { lat: -5.05, lng: 12.35 },
  },
  {
    slug: 'nakhchivan',
    iso: 'AZ',
    name: 'Nakhchivan',
    blurb:
      'A mountain exclave separated from home by Armenian territory — connected only by air and a thin Iranian corridor.',
    anchor: { lat: 39.3, lng: 45.4 },
  },
  {
    slug: 'oecusse',
    iso: 'TL',
    name: 'Oecusse',
    blurb:
      'Where Dominican friars first made landfall — an enclave stranded inside the Indonesian half of the island when colonial borders split it.',
    anchor: { lat: -9.3, lng: 124.35 },
  },
  {
    slug: 'musandam',
    iso: 'OM',
    name: 'Musandam',
    blurb:
      'The fjord-cut peninsula guarding the Strait of Hormuz, separated from home by the United Arab Emirates.',
    anchor: { lat: 26.2, lng: 56.25 },
  },
  {
    slug: 'temburong',
    iso: 'BN',
    name: 'Temburong',
    blurb:
      'The rainforest half of a small sultanate, split from the other half by a finger of Malaysian Sarawak.',
    anchor: { lat: 4.6, lng: 115.15 },
  },
  {
    slug: 'bioko',
    iso: 'GQ',
    name: 'Bioko',
    blurb:
      'A volcanic island holding the national capital — while the larger mainland half of the country sits 250 km away across open sea.',
    anchor: { lat: 3.5, lng: 8.7 },
  },
  {
    slug: 'azores',
    iso: 'PT',
    name: 'The Azores',
    blurb:
      'Nine volcanic islands a third of the way across the Atlantic — the westernmost point of their country, and of Europe.',
    anchor: { lat: 37.78, lng: -25.5 },
  },
  {
    slug: 'madeira',
    iso: 'PT',
    name: 'Madeira',
    blurb:
      'A subtropical Atlantic island closer to Africa than to its own capital — famous for fortified wine and levada channels.',
    anchor: { lat: 32.75, lng: -17.0 },
  },
  {
    slug: 'galapagos',
    iso: 'EC',
    name: 'The Galápagos',
    blurb:
      "Darwin's laboratory: a volcanic archipelago 1,000 km out in the Pacific, governed from the Andes.",
    anchor: { lat: -0.6, lng: -90.4 },
  },
  {
    slug: 'bornholm',
    iso: 'DK',
    name: 'Bornholm',
    blurb:
      'A granite Baltic island far east of the rest of the kingdom — closer to Sweden and Poland than to its own capital region.',
    anchor: { lat: 55.1, lng: 14.9 },
  },
  {
    slug: 'crete',
    iso: 'GR',
    name: 'Crete',
    blurb:
      'Home of the Minoans, the first great European civilisation — the big southern anchor of an island-strewn state.',
    anchor: { lat: 35.2, lng: 24.9 },
  },
  {
    slug: 'corsica',
    iso: 'FR',
    name: 'Corsica',
    blurb:
      "Napoleon's birthplace: a granite Mediterranean island nearer to Italy's coast than to the mainland that governs it.",
    anchor: { lat: 42.15, lng: 9.1 },
  },
  {
    slug: 'zanzibar',
    iso: 'TZ',
    name: 'Zanzibar',
    blurb:
      'The spice island whose sultanate merged with the mainland in 1964 — the union gave the country half its name.',
    anchor: { lat: -6.1, lng: 39.35 },
  },
  {
    slug: 'socotra',
    iso: 'YE',
    name: 'Socotra',
    blurb:
      'The "Galápagos of the Indian Ocean", where dragon\'s blood trees grow — far closer to Somalia than to its own mainland.',
    anchor: { lat: 12.5, lng: 53.9 },
  },
  {
    slug: 'andaman-islands',
    iso: 'IN',
    name: 'The Andaman Islands',
    blurb:
      'A far-flung Bay of Bengal chain over 1,200 km from the mainland — nearer to Myanmar and Indonesia than to home.',
    anchor: { lat: 12.0, lng: 92.9 },
  },
  {
    slug: 'easter-island',
    iso: 'CL',
    name: 'Easter Island',
    blurb:
      'The moai-carved speck 3,500 km out in the Pacific — the most remote inhabited island governed from a continent.',
    anchor: { lat: -27.1, lng: -109.35 },
  },
  {
    slug: 'tasmania',
    iso: 'AU',
    name: 'Tasmania',
    blurb:
      'The island state across the Bass Strait — so routinely left off national maps that its residents keep a tally.',
    anchor: { lat: -42.0, lng: 146.5 },
  },
  {
    slug: 'jeju',
    iso: 'KR',
    name: 'Jeju',
    blurb:
      'A volcanic honeymoon island under the tallest peak in its country, a hundred kilometres off the peninsula.',
    anchor: { lat: 33.38, lng: 126.55 },
  },
  {
    slug: 'east-malaysia',
    iso: 'MY',
    name: 'East Malaysia',
    blurb:
      'Two whole states on Borneo, 600 km of open sea from the peninsula that holds the capital.',
    anchor: { lat: 2.5, lng: 113.0 },
  },
  {
    slug: 'gotland',
    iso: 'SE',
    name: 'Gotland',
    blurb:
      'The Baltic island whose Hanseatic port of Visby once out-traded the mainland that now governs it.',
    anchor: { lat: 57.5, lng: 18.5 },
  },
  {
    slug: 'svalbard',
    iso: 'NO',
    name: 'Svalbard',
    blurb:
      'The polar-bear archipelago halfway to the North Pole, governed under a 1920 treaty that lets any signatory nation settle it.',
    anchor: { lat: 78.2, lng: 16.0 },
  },
  {
    slug: 'mallorca',
    iso: 'ES',
    name: 'Mallorca',
    blurb:
      'The largest of the Balearics — a Mediterranean island province a night ferry away from the mainland.',
    anchor: { lat: 39.6, lng: 2.9 },
  },
]
// Seeded and dropped, for the record: Svalbard (not in Norway's map unit),
// Ceuta (too small for Natural Earth 10m — the near-ring fallback grabbed
// Iberia instead). France's overseas departments and the Canaries are
// separate map units and can never be seeded.
