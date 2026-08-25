/**
 * Provenance for every dataset the game ships: who published it, which
 * release, and what year the numbers are from.
 *
 * One home for three questions a view may ask about any figure it renders:
 *   - provider: who published or redistributes it (`PROVIDERS`)
 *   - sourcing: which dataset/series inside that provider (`SOURCES` + origins)
 *   - year: the value's own vintage, else the release's (`attributionFor`)
 *
 * Stats resolve through `attributionFor(accessorId, amount)`; whole datasets
 * (maps, photos, city lights) through `datasetAttribution(datasetId)`. The
 * generators stamp `Amount.source` with the same ids, so a value that fell back
 * to a secondary source is credited to the source it actually came from.
 */
import type { GroupChallengeAccessorId } from '~~/types/challenges/group-challenge.type'
import type { IndividualChallengeAccessorId } from '~~/types/challenges/individual-challenge.type'
import type { TrendMetricId } from '~~/lib/trends'
import type { Amount } from '~~/types/geography.types'

export type ProviderId =
  | 'imf'
  | 'polity'
  | 'cia'
  | 'cepii'
  | 'owid'
  | 'worldbank'
  | 'un-wpp'
  | 'un-pd-migration'
  | 'untc'
  | 'ucdp'
  | 'naturalearth'
  | 'openstreetmap'
  | 'geonames'
  | 'wikidata'
  | 'commons'
  | 'wikipedia'
  | 'unsplash'
  | 'historical-basemaps'
  | 'cshapes'
  | 'flag-icons'
  | 'countries-list'
  | 'mozilla'
  | 'mondiale'
  | 'nasa'
  | 'usgs'

export interface Provider {
  name: string
  url: string
  /** File name in assets/logos/sources; absent providers render as a wordmark. */
  logo?: string
  /** Pale logos vanish under plain grayscale — pull them toward mid-gray. */
  dimLogo?: boolean
  description: string
}

export const PROVIDERS: Record<ProviderId, Provider> = {
  cia: {
    name: 'CIA World Factbook',
    url: 'https://www.cia.gov/the-world-factbook/',
    logo: 'cia.svg',
    description: 'Country profiles and world leaders: geography, people, government and economy.',
  },
  imf: {
    logo: 'imf.svg',
    dimLogo: true,
    name: 'International Monetary Fund',
    url: 'https://www.imf.org/en/Publications/WEO',
    description:
      'World Economic Outlook: macro-fiscal aggregates for its member economies, published twice a year.',
  },
  polity: {
    name: 'polity',
    url: 'https://github.com/Kodwerk-AB/polity',
    description:
      "Every country's government, parliament and parties as structured data: chambers, seat counts, and which side of the house each party sits on.",
  },
  cepii: {
    name: 'CEPII',
    url: 'https://www.cepii.fr',
    description:
      'BACI: reconciled bilateral trade flows for 200 economies at the HS6 product level, from the French research center in international economics.',
  },
  owid: {
    name: 'Our World in Data',
    url: 'https://ourworldindata.org',
    logo: 'owid.png',
    description:
      'Indices and historical series on democracy, human development, health and lifestyle, environment and biodiversity, energy, tourism and the economy — aggregating V-Dem, Transparency International, UNDP, the WHO, the FAO, SIPRI, the IUCN, the World Bank, UNODC, UN agencies, NCD-RisC, the IEA and the Energy Institute.',
  },
  worldbank: {
    name: 'World Bank Open Data',
    url: 'https://data.worldbank.org',
    logo: 'worldbank.svg',
    description: 'Development indicators.',
  },
  'un-wpp': {
    name: 'UN World Population Prospects',
    url: 'https://population.un.org/wpp/',
    logo: 'un-wpp.svg',
    description:
      'Population estimates and projections 1950–2100 from the UN Population Division: age structures, fertility, mortality and migration.',
  },
  // Same UN Population Division desk as un-wpp, but a separate publication on
  // its own four-yearly cycle. Filing the migrant stock under WPP would have
  // the sources page claim WPP publishes it, which it does not.
  'un-pd-migration': {
    name: 'UN Population Division',
    url: 'https://www.un.org/development/desa/pd/',
    logo: 'un-wpp.svg',
    description:
      'International Migrant Stock: where the world’s foreign-born live, counted by country of birth and country of residence.',
  },
  untc: {
    name: 'UN Treaty Collection',
    url: 'https://treaties.un.org',
    // The same UN wordmark the Population Division entries carry — one
    // organisation, three desks.
    logo: 'un-wpp.svg',
    description:
      'The depositary’s own record for multilateral treaties: who signed, who ratified, and who never got round to it.',
  },
  ucdp: {
    name: 'Uppsala Conflict Data Program',
    url: 'https://ucdp.uu.se',
    logo: 'uppsala.svg',
    description: 'Armed-conflict data from Uppsala University.',
  },
  openstreetmap: {
    logo: 'openstreetmap.svg',
    name: 'OpenStreetMap',
    url: 'https://www.openstreetmap.org',
    description:
      'The world mapped by volunteers: every street, railway, river and park, down to the lane.',
  },
  naturalearth: {
    name: 'Natural Earth',
    url: 'https://www.naturalearthdata.com',
    logo: 'naturalearth.png',
    dimLogo: true,
    description: 'Public-domain map data: country shapes, seas, lakes and rivers.',
  },
  geonames: {
    name: 'GeoNames',
    url: 'https://www.geonames.org',
    description: 'Populated places with coordinates and local spellings, for the city rounds.',
  },
  wikidata: {
    name: 'Wikidata',
    url: 'https://www.wikidata.org',
    logo: 'wikidata.svg',
    description: 'Structured data on leaders, capitals, currencies and landmarks.',
  },
  commons: {
    name: 'Wikimedia Commons',
    url: 'https://commons.wikimedia.org',
    logo: 'commons.svg',
    description:
      'Photography of leaders, capitals, banknotes, landmarks and flags, plus emblems of international organizations.',
  },
  wikipedia: {
    name: 'Wikipedia',
    url: 'https://www.wikipedia.org',
    logo: 'wikipedia.svg',
    description: 'Supplementary facts and figures.',
  },
  unsplash: {
    name: 'Unsplash',
    url: 'https://unsplash.com',
    logo: 'unsplash.svg',
    description: 'Selected landmark photography.',
  },
  'historical-basemaps': {
    name: 'historical-basemaps',
    url: 'https://github.com/aourednik/historical-basemaps',
    logo: 'historical-basemaps.svg',
    description:
      'World country borders across five millennia of snapshots, for the empire extents.',
  },
  cshapes: {
    name: 'CShapes 2.0',
    url: 'https://icr.ethz.ch/data/cshapes/',
    logo: 'cshapes.svg',
    description:
      'State borders and capitals 1886–2019, dated to the day — Schvitz et al. 2022, Journal of Conflict Resolution.',
  },
  'flag-icons': {
    name: 'flag-icons',
    url: 'https://github.com/lipis/flag-icons',
    description: 'The open-source flag set every country flag in the game is drawn from.',
  },
  'countries-list': {
    name: 'countries-list',
    url: 'https://github.com/annexare/Countries',
    description: 'Currency codes and spoken languages per country.',
  },
  mozilla: {
    logo: 'mozilla.svg',
    name: 'Mozilla Common Voice',
    url: 'https://commonvoice.mozilla.org',
    description:
      'Crowd-sourced speech recordings in over a hundred languages, donated and validated by volunteers and released into the public domain.',
  },
  mondiale: {
    logo: 'mondiale.svg',
    name: 'Mondiale',
    url: 'https://github.com/ikethepike/mondiale',
    description:
      'Hand-maintained editorial data: land and sea adjacency, empire and landmark selections, legal milestones.',
  },
  nasa: {
    name: 'NASA Earth Observatory',
    url: 'https://earthobservatory.nasa.gov',
    logo: 'nasa.svg',
    description:
      'Matched satellite pairs of one place decades apart, from the Landsat and Terra archives.',
  },
  usgs: {
    logo: 'usgs.svg',
    name: 'U.S. Geological Survey',
    url: 'https://eros.usgs.gov',
    description:
      'Five decades of Landsat imagery, curated by the EROS Center into matched views of a changing planet.',
  },
}

export type SourceId =
  | 'polity'
  | 'cia-factbook'
  | 'cia-world-leaders'
  | 'cepii-baci'
  | 'owid-grapher'
  | 'equaldex-marriage'
  | 'worldbank-wdi'
  | 'imf-weo'
  | 'un-wpp-2024'
  | 'un-migrant-stock-2024'
  | 'untc-mtdsg'
  | 'ucdp-acd'
  | 'ucdp-ged'
  | 'naturalearth-10m'
  | 'osm-overpass'
  | 'geonames-cities15000'
  | 'wikidata-items'
  | 'commons-media'
  | 'wikipedia-articles'
  | 'unsplash-photos'
  | 'historical-basemaps-geojson'
  | 'cshapes-2'
  | 'flag-icons-svg'
  | 'countries-list-package'
  | 'common-voice-clips'
  | 'mondiale-editorial'
  | 'nasa-earth-observatory'
  | 'usgs-earthshots'

export interface Source {
  provider: ProviderId
  /** The dataset as its publisher names it. */
  title: string
  url: string
  /** Release the committed data was generated from. */
  edition?: string
  license?: string
  /** Vintage of the release, for values that carry no year of their own. */
  year?: number
  /**
   * Keep this release off the public /sources page.
   *
   * The registry is still the truth — `attributionFor` resolves through it, the
   * coverage test still requires every `.gen.ts` to be claimed, and per-figure
   * credits in reveals are unaffected. This hides only the provider listing.
   *
   * Used for a source whose data we hold but no longer present as a live feed.
   */
  unlisted?: boolean
}

export const SOURCES: Record<SourceId, Source> = {
  'cia-factbook': {
    provider: 'cia',
    title: 'The World Factbook',
    url: 'https://www.cia.gov/the-world-factbook/',
    // Frozen deliberately: the factbook.json mirror stopped updating its data
    // on 2026-01-22 and the snapshot lives in the repo as data/factbook.gen.ts.
    edition: 'factbook.json mirror, frozen 2026-01-22',
    // Off the /sources listing by request. The figures it still backs — land
    // area, highest peak, independence year, the rail network, the religion
    // pair — are consensus facts available from many places; the Factbook is
    // just where this project happened to read them, and it is public domain,
    // so nothing is owed. Wikidata carries all four static ones at better
    // coverage (area 257, inception 241, peaks 234) whenever they are moved.
    unlisted: true,
    // The mirror's last data commit. Fields the Factbook publishes without a
    // year of their own — land area, highest peak, independence — rendered
    // undated before this; now they carry the vintage they actually have.
    year: 2026,
    license: 'Public domain',
  },
  polity: {
    provider: 'polity',
    title: 'polity',
    url: 'https://kodwerk-ab.github.io/polity/v1/polity.json',
    edition: 'v1',
    license: 'ODbL-1.0',
  },
  'cia-world-leaders': {
    provider: 'cia',
    title: 'World Leaders',
    url: 'https://www.cia.gov/resources/world-leaders/',
    license: 'Public domain',
    // Off the listing alongside the Factbook, which leaves the CIA off the
    // page entirely. The registry still resolves it, so the leader roster it
    // backs stays credited wherever a reveal names its source — hiding the
    // provider is not the same as dropping the attribution, and the data is
    // public domain either way.
    unlisted: true,
  },
  'cepii-baci': {
    provider: 'cepii',
    title: 'BACI: International Trade Database at the Product-Level',
    url: 'https://www.cepii.fr/CEPII/en/bdd_modele/bdd_modele_item.asp?id=37',
    edition: 'HS22, V202601',
    license: 'Etalab Open Licence 2.0',
    year: 2024,
  },
  'owid-grapher': {
    provider: 'owid',
    title: 'Grapher datasets',
    url: 'https://ourworldindata.org/charts',
    edition: 'full CSV downloads',
    license: 'CC BY 4.0',
  },
  'equaldex-marriage': {
    provider: 'owid',
    title: 'Marriage for same-sex partners',
    url: 'https://ourworldindata.org/grapher/marriage-same-sex-partners-equaldex',
    edition: '2026',
    license: 'CC BY 4.0',
  },
  'worldbank-wdi': {
    provider: 'worldbank',
    title: 'World Development Indicators',
    url: 'https://data.worldbank.org',
    edition: 'API v2',
    license: 'CC BY 4.0',
  },
  'imf-weo': {
    provider: 'imf',
    title: 'World Economic Outlook',
    url: 'https://www.imf.org/external/datamapper/GGXWDG_NGDP',
    edition: 'DataMapper API',
    license: 'IMF terms — free for non-commercial use with attribution',
  },
  'un-wpp-2024': {
    provider: 'un-wpp',
    title: 'World Population Prospects',
    url: 'https://population.un.org/wpp/',
    edition: '2024 revision',
    license: 'CC BY 3.0 IGO',
    // The revision's last estimate year; later rows are projections and never
    // enter the game.
    year: 2023,
  },
  'un-migrant-stock-2024': {
    provider: 'un-pd-migration',
    title: 'International Migrant Stock',
    url: 'https://www.un.org/development/desa/pd/content/international-migrant-stock',
    edition: '2024 revision',
    // Licence and citation are not on the landing page — they are stated
    // inside the workbook itself: "Copyright © 2024 by United Nations, made
    // available under a Creative Commons license CC BY 3.0 IGO", citing
    // "United Nations Department of Economic and Social Affairs, Population
    // Division (2024). International Migrant Stock 2024."
    license: 'CC BY 3.0 IGO',
    // Mid-year stock. The matrix counts the foreign-born — people living
    // outside the country they were born in — not ancestry or descent.
    year: 2024,
  },
  'ucdp-acd': {
    provider: 'ucdp',
    title: 'UCDP/PRIO Armed Conflict Dataset',
    url: 'https://ucdp.uu.se/downloads/',
    edition: 'v25.1',
    license: 'CC BY 4.0',
    year: 2024,
  },
  'ucdp-ged': {
    provider: 'ucdp',
    title: 'UCDP Georeferenced Event Dataset',
    url: 'https://ucdp.uu.se/downloads/',
    edition: 'v25.1',
    license: 'CC BY 4.0',
    year: 2024,
  },
  'osm-overpass': {
    provider: 'openstreetmap',
    title: 'OpenStreetMap via Overpass',
    // OSM's own copyright page, not the Overpass endpoint: ODbL asks the
    // credit to point at the database and its licence, and Overpass is only
    // how the extract was taken.
    url: 'https://www.openstreetmap.org/copyright',
    // OSM has no vintage year — the extract's own timestamp is the edition.
    edition: '2026-08-25 extract',
    license: 'ODbL-1.0',
  },
  'naturalearth-10m': {
    provider: 'naturalearth',
    title: 'Natural Earth 1:10m',
    url: 'https://www.naturalearthdata.com/downloads/10m-cultural-vectors/',
    edition: 'v5.1.2',
    license: 'Public domain',
  },
  'untc-mtdsg': {
    provider: 'untc',
    title: 'Multilateral Treaties Deposited with the Secretary-General',
    url: 'https://treaties.un.org/Pages/ParticipationStatus.aspx',
    // The UN's terms let its material be reproduced freely without permission
    // where it is not for sale or commercial resale, with the source cited.
    license: 'UN publication — free reproduction with attribution',
  },
  'geonames-cities15000': {
    provider: 'geonames',
    title: 'cities15000 dump',
    url: 'https://download.geonames.org/export/dump/',
    license: 'CC BY 4.0',
  },
  'wikidata-items': {
    provider: 'wikidata',
    title: 'Wikidata items',
    url: 'https://www.wikidata.org',
    license: 'CC0 1.0',
  },
  'commons-media': {
    provider: 'commons',
    title: 'Wikimedia Commons media',
    url: 'https://commons.wikimedia.org',
    // Per-file: the committed images carry their own credit + licence line.
    license: 'Per file',
  },
  'wikipedia-articles': {
    provider: 'wikipedia',
    title: 'Wikipedia articles',
    url: 'https://www.wikipedia.org',
    license: 'CC BY-SA 4.0',
  },
  'unsplash-photos': {
    provider: 'unsplash',
    title: 'Unsplash photography',
    url: 'https://unsplash.com',
    license: 'Unsplash Licence',
  },
  'historical-basemaps-geojson': {
    provider: 'historical-basemaps',
    title: 'World historical basemaps',
    url: 'https://github.com/aourednik/historical-basemaps',
    edition: '@ 62d8f1a',
    license: 'GPL-3.0',
  },
  'cshapes-2': {
    provider: 'cshapes',
    title: 'CShapes 2.0',
    url: 'https://icr.ethz.ch/data/cshapes/',
    edition: '2.0 (1886–2019)',
    license: 'CC BY-NC-SA 4.0',
    year: 2019,
  },
  'flag-icons-svg': {
    provider: 'flag-icons',
    title: 'flag-icons',
    url: 'https://github.com/lipis/flag-icons',
    edition: 'v7.5.0',
    license: 'MIT',
  },
  'countries-list-package': {
    provider: 'countries-list',
    title: 'countries-list',
    url: 'https://github.com/annexare/Countries',
    edition: 'v3.3.0',
    license: 'MIT',
  },
  'common-voice-clips': {
    provider: 'mozilla',
    title: 'Common Voice speech corpus',
    url: 'https://commonvoice.mozilla.org/datasets',
    // Read through Hugging Face's ungated Common Voice 17 mirror, which serves
    // individual clips — Mozilla's own endpoint is account-gated and ships
    // whole-language archives. Same corpus, same CC0 terms.
    edition: 'v17.0',
    license: 'CC0 1.0',
  },
  'mondiale-editorial': {
    provider: 'mondiale',
    title: 'Hand-maintained game data',
    url: 'https://github.com/ikethepike/mondiale',
    license: 'Compiled from public reporting',
  },
  'nasa-earth-observatory': {
    provider: 'nasa',
    title: 'World of Change imagery',
    url: 'https://earthobservatory.nasa.gov/world-of-change',
    license: 'Public domain',
  },
  'usgs-earthshots': {
    provider: 'usgs',
    title: 'Earthshots Landsat imagery',
    url: 'https://eros.usgs.gov/earthshots',
    license: 'Public domain',
  },
}

/** Where one figure comes from, down to the series inside its source. */
export interface DataOrigin {
  source: SourceId
  /** The body behind the numbers when the source only compiles them
   *  (OWID mirrors V-Dem, SIPRI, the WHO…). */
  originator?: string
  /** The series/indicator inside the source. */
  dataset?: string
  /** Deep link to that series, when it has one. */
  url?: string
  /** Sources the generator falls back to when the primary has no value, in
   *  the order it tries them. */
  fallback?: readonly SourceId[]
}

const owid = (slug: string, originator?: string): DataOrigin => ({
  source: 'owid-grapher',
  originator,
  dataset: slug,
  url: `https://ourworldindata.org/grapher/${slug}`,
})

const worldBank = (indicator: string): DataOrigin => ({
  source: 'worldbank-wdi',
  dataset: indicator,
  url: `https://data.worldbank.org/indicator/${indicator}`,
})

const wpp = (indicator: string, fallback?: readonly SourceId[]): DataOrigin => ({
  source: 'un-wpp-2024',
  dataset: indicator,
  ...(fallback ? { fallback } : {}),
})

/** The demography stats the countries generator backstops with a Factbook node. */
const FACTBOOK_BACKSTOP = ['cia-factbook'] as const

const factbook = (field: string): DataOrigin => ({ source: 'cia-factbook', dataset: field })

/**
 * Every ranked stat, mapped to where its value is generated from
 * (see generators/create-countries-file.ts — this table mirrors that dealer's
 * choices, and `Amount.source` records which one actually won per country).
 */
export const STAT_ORIGINS: Record<GroupChallengeAccessorId, DataOrigin> = {
  'economics.gdpPerCapita': {
    ...worldBank('NY.GDP.PCAP.PP.KD'),
    fallback: FACTBOOK_BACKSTOP,
  },
  'economics.gdpTotal': {
    ...worldBank('NY.GDP.MKTP.PP.KD'),
    fallback: FACTBOOK_BACKSTOP,
  },
  'economics.gdpGrowth': {
    ...worldBank('NY.GDP.MKTP.KD.ZG'),
    fallback: FACTBOOK_BACKSTOP,
  },
  'economics.publicDebt': { source: 'imf-weo', dataset: 'General government gross debt, % of GDP' },
  'economics.budgetBalance': {
    source: 'imf-weo',
    dataset: 'General government net lending/borrowing, % of GDP',
  },
  'economics.inflation': {
    ...worldBank('FP.CPI.TOTL.ZG'),
    fallback: FACTBOOK_BACKSTOP,
  },
  'economics.equality': owid('economic-inequality-gini-index', 'World Bank'),
  'economics.populationBelowPovertyLine': owid(
    'share-of-population-in-extreme-poverty',
    'World Bank PIP'
  ),
  'economics.militarySpending': {
    ...owid('military-expenditure-share-gdp', 'SIPRI'),
    fallback: ['cia-factbook'],
  },
  'economics.touristArrivals': owid('international-tourist-arrivals', 'UNWTO'),
  'economics.workingHours': owid('annual-working-hours-per-worker', 'Penn World Table'),

  'geography.area.land': factbook('Geography › Area › land'),
  'geography.area.water': factbook('Geography › Area › water'),
  'geography.area.total': factbook('Geography › Area › total'),
  'geography.area.arable': factbook('Geography › Land use › arable land'),
  'geography.area.forested': {
    ...owid('forest-area-as-share-of-land-area', 'FAO'),
    fallback: ['cia-factbook'],
  },
  'geography.highestPeak': factbook('Geography › Elevation › highest point'),

  'unemployment.youth': {
    ...worldBank('SL.UEM.1524.ZS'),
    fallback: FACTBOOK_BACKSTOP,
  },
  'unemployment.total': {
    ...worldBank('SL.UEM.TOTL.ZS'),
    fallback: FACTBOOK_BACKSTOP,
  },

  'infrastructure.rail': factbook('Transportation › Railways › total'),
  'infrastructure.internetAccess': owid(
    'share-of-individuals-using-the-internet',
    'ITU via World Bank'
  ),

  'energy.electricityAccess': owid(
    'share-of-the-population-with-access-to-electricity',
    'World Bank'
  ),
  'energy.fossilFuels': owid('share-electricity-fossil-fuels', 'Ember / Energy Institute'),
  'energy.consumptionPerCapita': owid('per-capita-energy-use', 'Energy Institute'),

  'gender.womenInParliament': worldBank('SG.GEN.PARL.ZS'),
  'gender.motherMeanAgeAtBirth': wpp('MAC'),

  'people.population': wpp('TPopulation1July', FACTBOOK_BACKSTOP),
  'people.medianAge': wpp('MedianAgePop', FACTBOOK_BACKSTOP),
  'people.lifeExpectancy': wpp('LEx', FACTBOOK_BACKSTOP),
  'people.childrenPerWoman': wpp('TFR', FACTBOOK_BACKSTOP),
  'people.populationGrowthRate': wpp('PopGrowthRate', FACTBOOK_BACKSTOP),
  'people.birthRate': wpp('CBR', FACTBOOK_BACKSTOP),
  'people.netMigration': wpp('CNMR', FACTBOOK_BACKSTOP),
  'people.deathRate': wpp('CDR'),
  'people.density': wpp('PopDensity'),
  'people.sexRatio': wpp('PopSexRatio'),
  'people.share65Plus': { source: 'un-wpp-2024', dataset: 'PopulationByAge5GroupSex' },
  'people.urbanization': {
    ...owid('share-of-population-urban', 'UN World Urbanization Prospects'),
    fallback: ['cia-factbook'],
  },

  'education.literacy': owid('literacy-rate-adults', 'UNESCO'),
  'education.averageYearsOfStudy': owid('mean-years-of-schooling', 'UNDP'),

  'health.obesity': {
    ...owid('share-of-adults-defined-as-obese', 'WHO'),
    fallback: ['cia-factbook'],
  },
  'health.tobaccoUse': { ...owid('share-of-adults-who-smoke', 'WHO'), fallback: ['cia-factbook'] },
  'health.alcoholConsumption': {
    ...owid('total-alcohol-consumption-per-capita-litres-of-pure-alcohol', 'WHO'),
    fallback: ['cia-factbook'],
  },
  'health.meatConsumption': owid('meat-supply-per-person', 'FAO'),
  'health.maleHeight': owid('average-height-of-men', 'NCD-RisC'),
  'health.roadDeaths': owid('death-rate-road-traffic-injuries', 'WHO'),
  'health.doctors': owid('physicians-per-1000-people', 'WHO'),
  'health.hospitalBeds': owid('hospital-beds-per-1000-people', 'WHO / OECD'),
  'health.accessToContraceptives': {
    ...worldBank('SP.DYN.CONU.ZS'),
    fallback: ['cia-factbook'],
  },

  'religion.atheism': factbook('People and Society › Religions'),
  'religion.believers': factbook('People and Society › Religions'),

  'environment.CO2Emissions': owid('annual-co2-emissions-per-country', 'Global Carbon Budget'),
  'environment.methaneEmissions': owid('methane-emissions', 'Climate Watch / Jones et al.'),
  'environment.renewables': {
    ...owid('share-electricity-renewables', 'Ember & the Energy Institute'),
    fallback: ['cia-factbook'],
  },
  'environment.airPollution': owid('pm25-air-pollution', 'World Bank'),
  'environment.redListIndex': owid('red-list-index', 'IUCN'),
  'environment.threatenedMammals': owid('threatened-mammal-species', 'IUCN'),
  'environment.protectedLand': owid('terrestrial-protected-areas', 'UNEP-WCMC'),
  'environment.freshwaterPerCapita': owid('renewable-water-resources-per-capita', 'FAO AQUASTAT'),
  'environment.evSalesShare': owid('electric-car-sales-share', 'IEA'),

  'government.democracyIndex': owid('electoral-democracy-index', 'V-Dem'),
  'government.corruptionIndex': owid(
    'TI-corruption-perception-index',
    'Transparency International'
  ),
  'government.humanDevelopmentIndex': owid('human-development-index', 'UNDP'),
  'government.happiness': owid('happiness-cantril-ladder', 'World Happiness Report'),
  'government.conflictsFought': { source: 'ucdp-acd', dataset: 'UCDP/PRIO ACD, primary parties' },
  'government.yearsAtWar': { source: 'ucdp-acd', dataset: 'Years at war intensity since 1946' },
  'government.recentConflicts': {
    source: 'ucdp-acd',
    dataset: 'Conflicts active in the last 5 years',
  },
  // Legacy — no country carries this value anymore, kept so in-flight games
  // keep rendering (see GROUP_CHALLENGES).
  'government.amountOfMilitaryConflicts': { source: 'ucdp-acd' },

  'humanRights.refugees': owid('refugee-population-by-country-or-territory-of-asylum', 'UNHCR'),
  'humanRights.gayMarriageLegalized': {
    source: 'equaldex-marriage',
    originator: 'Equaldex',
    dataset: 'Marriage for same-sex partners',
  },
}

/** The gate stats, which name a country rather than rank it. */
export const INDIVIDUAL_STAT_ORIGINS: Record<IndividualChallengeAccessorId, DataOrigin> = {
  flag: { source: 'flag-icons-svg' },
  isoCode: { source: 'cia-factbook', dataset: 'ISO 3166-1 alpha-2' },
  'capital.name': factbook('Government › Capital › name'),
  'government.leader': {
    source: 'cia-world-leaders',
    dataset: 'Chiefs of State and Cabinet Members',
    fallback: ['wikidata-items'],
  },
  // The Factbook names the roster; Wikidata supplies the ideology, colour and
  // logo the gates actually show.
  'government.parties': {
    source: 'cia-factbook',
    dataset: 'Government › Political parties',
    fallback: ['wikidata-items', 'commons-media'],
  },
  currency: { source: 'countries-list-package', dataset: 'ISO 4217 code per country' },
  landmarks: { source: 'wikidata-items', fallback: ['commons-media'] },
  // Chronicle's cards are the curated timeline library; the tile itself only
  // ever asks that library's questions (or the find fallback's map).
  history: {
    source: 'mondiale-editorial',
    dataset: 'generators/data/event-seeds.ts',
    fallback: ['wikidata-items'],
  },
  // The misprint is drawn on the projected map and its lineup grown over the
  // border graph; the names themselves are the Factbook's.
  errata: {
    source: 'naturalearth-10m',
    dataset: 'Admin 0 countries',
    fallback: ['cia-factbook'],
  },
  // An analogy's terms are capitals, peaks and currencies from the Factbook,
  // with leaders and landmarks arriving through Wikidata.
  lexicon: {
    source: 'cia-factbook',
    dataset: 'Capital, Highest point, Currency',
    fallback: ['wikidata-items'],
  },
}

/** Every stored trend series, by the id it is keyed under in TRENDS. */
export const TREND_ORIGINS: Record<TrendMetricId, DataOrigin> = {
  democracyIndex: owid('electoral-democracy-index', 'V-Dem'),
  politicalCorruption: owid('political-corruption-index', 'V-Dem'),
  humanDevelopmentIndex: owid('human-development-index', 'UNDP'),
  gdp: owid('gdp-worldbank', 'World Bank'),
  gdpPerCapita: owid('gdp-per-capita-worldbank', 'World Bank'),
  gini: owid('economic-inequality-gini-index', 'World Bank'),
  methaneEmissions: owid('methane-emissions', 'Climate Watch / Jones et al.'),
  budgetBalance: { source: 'imf-weo', dataset: 'General government net lending/borrowing' },
  publicDebt: { source: 'imf-weo', dataset: 'General government gross debt' },
  co2Emissions: owid('annual-co2-emissions-per-country', 'Global Carbon Budget'),
  refugees: owid('refugee-population-by-country-or-territory-of-asylum', 'UNHCR'),
  literacy: owid('literacy-rate-adults', 'UNESCO'),
  povertyLine: owid('share-of-population-in-extreme-poverty', 'World Bank PIP'),
  fossilElectricity: owid('share-electricity-fossil-fuels', 'Ember / Energy Institute'),
  internetAccess: owid('share-of-individuals-using-the-internet', 'ITU via World Bank'),
  electricityAccess: owid('share-of-the-population-with-access-to-electricity', 'World Bank'),
  physicians: owid('physicians-per-1000-people', 'WHO'),
  hospitalBeds: owid('hospital-beds-per-1000-people', 'WHO / OECD'),
  yearsOfSchooling: owid('mean-years-of-schooling', 'UNDP'),
  homicideRate: owid('homicide-rate-unodc', 'UNODC'),
  co2PerCapita: owid('co-emissions-per-capita', 'Global Carbon Budget'),
  lifeExpectancy: owid('life-expectancy', 'UN WPP & the Human Mortality Database'),
  fertility: owid('children-per-woman-un', 'UN WPP'),
  childMortality: owid('child-mortality', 'UN IGME'),
  internetUse: owid('share-of-individuals-using-the-internet', 'ITU'),
  alcoholConsumption: owid('total-alcohol-consumption-per-capita-litres-of-pure-alcohol', 'WHO'),
  obesity: owid('share-of-adults-defined-as-obese', 'WHO'),
  tobaccoUse: owid('share-of-adults-who-smoke', 'WHO'),
  roadDeaths: owid('death-rate-road-traffic-injuries', 'WHO'),
  meatConsumption: owid('meat-supply-per-person', 'FAO'),
  militarySpending: owid('military-expenditure-share-gdp', 'SIPRI'),
  renewables: owid('share-electricity-renewables', 'Ember & the Energy Institute'),
  energyUse: owid('per-capita-energy-use', 'Energy Institute'),
  urbanization: owid('share-of-population-urban', 'UN World Urbanization Prospects'),
  forested: owid('forest-area-as-share-of-land-area', 'FAO'),
  touristArrivals: owid('international-tourist-arrivals', 'UNWTO'),
  workingHours: owid('annual-working-hours-per-worker', 'Penn World Table'),
  airPollution: owid('pm25-air-pollution', 'World Bank'),
  redListIndex: owid('red-list-index', 'IUCN'),
  freshwaterPerCapita: owid('renewable-water-resources-per-capita', 'FAO AQUASTAT'),
  population: wpp('TPopulation1July'),
  medianAge: wpp('MedianAgePop'),
  motherMeanAgeAtBirth: wpp('MAC'),
  birthRate: wpp('CBR'),
  netMigration: wpp('CNMR'),
  populationGrowthRate: wpp('PopGrowthRate'),
}

export type DataSetId =
  | 'countries'
  | 'migration'
  | 'treaties'
  | 'flags'
  | 'flag-meanings'
  | 'name-facts'
  | 'map'
  | 'far-flung'
  | 'water'
  | 'recognition'
  | 'borders'
  | 'straits'
  | 'cities'
  | 'city-plans'
  | 'capitals'
  | 'anthems'
  | 'anthem-lyrics'
  | 'tongues'
  | 'currencies'
  | 'leaders'
  | 'publicFinance'
  | 'parties'
  | 'places'
  | 'events'
  | 'changes'
  | 'empires'
  | 'conflicts'
  | 'conflict-events'
  | 'commodity-exporters'
  | 'owid'
  | 'marriage-rights'
  | 'worldbank'
  | 'wpp'

export interface DataSet {
  /** What a view would call it. */
  label: string
  /** The committed files it covers — every data/*.gen.ts belongs to exactly
   *  one dataset (enforced in attribution.test.ts). */
  files: readonly string[]
  /** Primary origin first; the rest contribute (photos, borders, fallbacks). */
  origins: readonly DataOrigin[]
}

export const DATASETS: Record<DataSetId, DataSet> = {
  countries: {
    label: 'Country profiles',
    files: ['data/countries.gen.ts', 'data/iso-codes.gen.ts', 'data/factbook.gen.ts'],
    origins: [
      { source: 'cia-factbook' },
      { source: 'owid-grapher' },
      { source: 'un-wpp-2024' },
      { source: 'worldbank-wdi' },
      { source: 'ucdp-acd' },
      // The markup itself lives in the flags dataset; only the derived
      // national colours (identity.colors) remain here.
      { source: 'flag-icons-svg', dataset: 'National colours from flag SVGs' },
      { source: 'countries-list-package', dataset: 'Currencies and languages' },
      { source: 'mondiale-editorial', dataset: 'Membership and marriage-rights corrections' },
    ],
  },
  'commodity-exporters': {
    label: 'Top commodity exporters',
    files: ['data/commodity-exporters.gen.ts'],
    // The Made In answer key is a union: BACI's global top exporters plus the
    // Factbook's per-country export lists — both legs earn their credit here.
    origins: [
      { source: 'cepii-baci' },
      { source: 'cia-factbook', dataset: 'Economy › Exports - commodities' },
      { source: 'mondiale-editorial', dataset: 'generators/data/commodity-hs-codes.ts' },
    ],
  },
  flags: {
    label: 'Country flags',
    files: ['data/flags.gen.ts', 'data/flags-wide.gen.ts'],
    origins: [
      { source: 'flag-icons-svg', dataset: 'Country flag SVGs' },
      { source: 'flag-icons-svg', dataset: 'Recomposed 3:1 variants' },
    ],
  },
  'flag-meanings': {
    label: 'Flag symbolism',
    files: ['data/flag-meanings.gen.ts'],
    origins: [{ source: 'cia-factbook', dataset: 'Government › Flag' }],
  },
  'name-facts': {
    label: 'Country name origins',
    files: ['data/name-facts.gen.ts'],
    origins: [{ source: 'cia-factbook', dataset: 'Government › Country name' }],
  },
  map: {
    label: 'World map',
    files: ['data/map.gen.ts', 'data/map-hd.gen.ts'],
    origins: [{ source: 'naturalearth-10m', dataset: 'admin_0_map_units' }],
  },
  'far-flung': {
    label: 'Far-flung fragments',
    files: ['data/far-flung.gen.ts'],
    origins: [
      { source: 'naturalearth-10m', dataset: 'admin_0_map_units rings' },
      { source: 'mondiale-editorial', dataset: 'generators/data/far-flung-seeds.ts' },
    ],
  },
  water: {
    label: 'Seas, lakes, rivers and ranges',
    // sea-lanes is derived adjacency (shared named seas), regenerated with water
    files: ['data/water.gen.ts', 'data/water-facts.gen.ts', 'data/sea-lanes.gen.ts'],
    origins: [
      { source: 'naturalearth-10m', dataset: '1:10m physical layers' },
      { source: 'cia-factbook', dataset: 'Geography › Major rivers and lakes' },
    ],
  },
  recognition: {
    label: 'Disputed territories',
    files: ['data/recognition.gen.ts', 'data/recognition-flags.gen.ts'],
    origins: [
      { source: 'naturalearth-10m', dataset: 'admin_0_disputed_areas' },
      { source: 'commons-media', dataset: 'De facto state flags' },
      { source: 'mondiale-editorial', dataset: 'data/static/recognition-corrections.ts' },
    ],
  },
  borders: {
    label: 'Land borders',
    files: ['data/borders.gen.ts'],
    origins: [{ source: 'mondiale-editorial', dataset: 'Authored adjacency pairs' }],
  },
  straits: {
    label: 'Sea crossings',
    files: ['data/straits.gen.ts'],
    origins: [
      { source: 'naturalearth-10m', dataset: 'Coastline distances between country shapes' },
      { source: 'mondiale-editorial', dataset: 'generators/data/strait-overrides.ts' },
    ],
  },
  'city-plans': {
    label: 'City street plans',
    // Every tile is enumerated rather than globbed because DATASETS.files takes
    // literal paths; the generator rewrites this block so the list cannot drift
    // from the roster.
    files: [
      'data/city-plans.gen.ts',
      'data/city-plans/abu-dhabi-centre.gen.ts',
      'data/city-plans/abuja-centre.gen.ts',
      'data/city-plans/accra-centre.gen.ts',
      'data/city-plans/addis-ababa-centre.gen.ts',
      'data/city-plans/algiers-centre.gen.ts',
      'data/city-plans/amman-centre.gen.ts',
      'data/city-plans/amsterdam-grachtengordel.gen.ts',
      'data/city-plans/andorra-la-vella-centre.gen.ts',
      'data/city-plans/ankara-centre.gen.ts',
      'data/city-plans/antananarivo-centre.gen.ts',
      'data/city-plans/ashgabat-centre.gen.ts',
      'data/city-plans/astana-centre.gen.ts',
      'data/city-plans/asuncion-centre.gen.ts',
      'data/city-plans/athens-centre.gen.ts',
      'data/city-plans/baghdad-centre.gen.ts',
      'data/city-plans/baku-centre.gen.ts',
      'data/city-plans/bamako-centre.gen.ts',
      'data/city-plans/bangkok-centre.gen.ts',
      'data/city-plans/barcelona-eixample.gen.ts',
      'data/city-plans/barcelona-gothic.gen.ts',
      'data/city-plans/beijing-centre.gen.ts',
      'data/city-plans/beirut-centre.gen.ts',
      'data/city-plans/belgrade-centre.gen.ts',
      'data/city-plans/berlin-mitte.gen.ts',
      'data/city-plans/bern-centre.gen.ts',
      'data/city-plans/bishkek-centre.gen.ts',
      'data/city-plans/bogota-centre.gen.ts',
      'data/city-plans/brasilia-plano-piloto.gen.ts',
      'data/city-plans/bratislava-centre.gen.ts',
      'data/city-plans/brazzaville-centre.gen.ts',
      'data/city-plans/brussels-centre.gen.ts',
      'data/city-plans/bucharest-centre.gen.ts',
      'data/city-plans/budapest-centre.gen.ts',
      'data/city-plans/buenos-aires-microcentro.gen.ts',
      'data/city-plans/cairo-downtown.gen.ts',
      'data/city-plans/canberra-centre.gen.ts',
      'data/city-plans/caracas-centre.gen.ts',
      'data/city-plans/chi-in-u-centre.gen.ts',
      'data/city-plans/chicago-loop.gen.ts',
      'data/city-plans/colombo-centre.gen.ts',
      'data/city-plans/copenhagen-centre.gen.ts',
      'data/city-plans/dakar-centre.gen.ts',
      'data/city-plans/damascus-centre.gen.ts',
      'data/city-plans/dhaka-centre.gen.ts',
      'data/city-plans/djibouti-centre.gen.ts',
      'data/city-plans/dodoma-centre.gen.ts',
      'data/city-plans/doha-centre.gen.ts',
      'data/city-plans/dublin-centre.gen.ts',
      'data/city-plans/dushanbe-centre.gen.ts',
      'data/city-plans/fez-medina.gen.ts',
      'data/city-plans/fez-ville-nouvelle.gen.ts',
      'data/city-plans/freetown-centre.gen.ts',
      'data/city-plans/gaborone-centre.gen.ts',
      'data/city-plans/georgetown-centre.gen.ts',
      'data/city-plans/guatemala-city-centre.gen.ts',
      'data/city-plans/hanoi-centre.gen.ts',
      'data/city-plans/harare-centre.gen.ts',
      'data/city-plans/havana-vieja.gen.ts',
      'data/city-plans/helsinki-kruununhaka.gen.ts',
      'data/city-plans/istanbul-besiktas.gen.ts',
      'data/city-plans/istanbul-golden-horn.gen.ts',
      'data/city-plans/jakarta-centre.gen.ts',
      'data/city-plans/jerusalem-centre.gen.ts',
      'data/city-plans/kabul-centre.gen.ts',
      'data/city-plans/kampala-centre.gen.ts',
      'data/city-plans/karlsruhe-schloss.gen.ts',
      'data/city-plans/kathmandu-centre.gen.ts',
      'data/city-plans/khartoum-centre.gen.ts',
      'data/city-plans/kigali-centre.gen.ts',
      'data/city-plans/kingston-centre.gen.ts',
      'data/city-plans/kinshasa-centre.gen.ts',
      'data/city-plans/kuala-lumpur-centre.gen.ts',
      'data/city-plans/kuwait-city-centre.gen.ts',
      'data/city-plans/kyiv-centre.gen.ts',
      'data/city-plans/la-paz-centre.gen.ts',
      'data/city-plans/lagos-island.gen.ts',
      'data/city-plans/libreville-centre.gen.ts',
      'data/city-plans/lilongwe-centre.gen.ts',
      'data/city-plans/lima-centre.gen.ts',
      'data/city-plans/lisbon-centre.gen.ts',
      'data/city-plans/ljubljana-centre.gen.ts',
      'data/city-plans/lome-centre.gen.ts',
      'data/city-plans/london-chelsea.gen.ts',
      'data/city-plans/london-isle-of-dogs.gen.ts',
      'data/city-plans/london-westminster.gen.ts',
      'data/city-plans/luanda-centre.gen.ts',
      'data/city-plans/lusaka-centre.gen.ts',
      'data/city-plans/luxembourg-centre.gen.ts',
      'data/city-plans/madrid-centre.gen.ts',
      'data/city-plans/managua-centre.gen.ts',
      'data/city-plans/manama-centre.gen.ts',
      'data/city-plans/manila-centre.gen.ts',
      'data/city-plans/maputo-centre.gen.ts',
      'data/city-plans/mexico-city-centre.gen.ts',
      'data/city-plans/minsk-centre.gen.ts',
      'data/city-plans/mogadishu-centre.gen.ts',
      'data/city-plans/monaco-centre.gen.ts',
      'data/city-plans/montevideo-centre.gen.ts',
      'data/city-plans/moscow-kremlin.gen.ts',
      'data/city-plans/nairobi-centre.gen.ts',
      'data/city-plans/nassau-centre.gen.ts',
      'data/city-plans/naypyidaw-centre.gen.ts',
      'data/city-plans/new-delhi-lutyens.gen.ts',
      'data/city-plans/new-york-battery.gen.ts',
      'data/city-plans/new-york-midtown.gen.ts',
      'data/city-plans/niamey-centre.gen.ts',
      'data/city-plans/nicosia-centre.gen.ts',
      'data/city-plans/nouakchott-centre.gen.ts',
      'data/city-plans/oslo-centre.gen.ts',
      'data/city-plans/ottawa-centre.gen.ts',
      'data/city-plans/ouagadougou-centre.gen.ts',
      'data/city-plans/panama-city-centre.gen.ts',
      'data/city-plans/paramaribo-centre.gen.ts',
      'data/city-plans/paris-belleville.gen.ts',
      'data/city-plans/paris-etoile.gen.ts',
      'data/city-plans/paris-ile-de-la-cite.gen.ts',
      'data/city-plans/phnom-penh-centre.gen.ts',
      'data/city-plans/podgorica-centre.gen.ts',
      'data/city-plans/port-au-prince-centre.gen.ts',
      'data/city-plans/port-louis-centre.gen.ts',
      'data/city-plans/port-of-spain-centre.gen.ts',
      'data/city-plans/prague-centre.gen.ts',
      'data/city-plans/pretoria-centre.gen.ts',
      'data/city-plans/pristina-centre.gen.ts',
      'data/city-plans/pyongyang-centre.gen.ts',
      'data/city-plans/quito-centre.gen.ts',
      'data/city-plans/rabat-centre.gen.ts',
      'data/city-plans/reykjavik-centre.gen.ts',
      'data/city-plans/riga-centre.gen.ts',
      'data/city-plans/riyadh-centre.gen.ts',
      'data/city-plans/rome-centre.gen.ts',
      'data/city-plans/saint-petersburg-nevsky.gen.ts',
      'data/city-plans/salt-lake-city-temple.gen.ts',
      'data/city-plans/san-jose-centre.gen.ts',
      'data/city-plans/sanaa-centre.gen.ts',
      'data/city-plans/santiago-centre.gen.ts',
      'data/city-plans/santo-domingo-centre.gen.ts',
      'data/city-plans/sarajevo-centre.gen.ts',
      'data/city-plans/seoul-jongno.gen.ts',
      'data/city-plans/singapore-centre.gen.ts',
      'data/city-plans/skopje-centre.gen.ts',
      'data/city-plans/sofia-centre.gen.ts',
      'data/city-plans/stockholm-gamla-stan.gen.ts',
      'data/city-plans/sydney-harbour.gen.ts',
      'data/city-plans/taipei-centre.gen.ts',
      'data/city-plans/tallinn-centre.gen.ts',
      'data/city-plans/tashkent-centre.gen.ts',
      'data/city-plans/tbilisi-centre.gen.ts',
      'data/city-plans/tegucigalpa-centre.gen.ts',
      'data/city-plans/tehran-centre.gen.ts',
      'data/city-plans/thimphu-centre.gen.ts',
      'data/city-plans/tirana-centre.gen.ts',
      'data/city-plans/tokyo-marunouchi.gen.ts',
      'data/city-plans/tokyo-shinjuku.gen.ts',
      'data/city-plans/tripoli-centre.gen.ts',
      'data/city-plans/tunis-centre.gen.ts',
      'data/city-plans/turin-centro.gen.ts',
      'data/city-plans/ulaanbaatar-centre.gen.ts',
      'data/city-plans/valletta-centre.gen.ts',
      'data/city-plans/venice-grand-canal.gen.ts',
      'data/city-plans/vienna-centre.gen.ts',
      'data/city-plans/vientiane-centre.gen.ts',
      'data/city-plans/vilnius-centre.gen.ts',
      'data/city-plans/warsaw-centre.gen.ts',
      'data/city-plans/washington-dupont.gen.ts',
      'data/city-plans/washington-mall.gen.ts',
      'data/city-plans/wellington-centre.gen.ts',
      'data/city-plans/windhoek-centre.gen.ts',
      'data/city-plans/yamoussoukro-centre.gen.ts',
      'data/city-plans/yaounde-centre.gen.ts',
      'data/city-plans/yerevan-centre.gen.ts',
      'data/city-plans/zagreb-centre.gen.ts',
    ],
    origins: [{ source: 'osm-overpass', dataset: 'Highways, railways, water and green space' }],
  },
  cities: {
    label: 'City lights',
    files: ['data/cities.gen.ts'],
    origins: [
      { source: 'geonames-cities15000' },
      { source: 'mondiale-editorial', dataset: 'data/static/city-endonyms.ts' },
    ],
  },
  capitals: {
    label: 'Capital photography',
    files: ['data/capitals.gen.ts', 'data/capital-facts.gen.ts'],
    origins: [
      { source: 'wikidata-items', dataset: 'P36 capital' },
      { source: 'commons-media', dataset: 'P18 images' },
      { source: 'cia-factbook', dataset: 'Government › Capital' },
    ],
  },
  anthems: {
    label: 'National anthem recordings',
    files: ['data/anthems.gen.ts'],
    origins: [
      { source: 'wikidata-items', dataset: 'P85 anthem, P51 audio' },
      { source: 'commons-media', dataset: 'Anthem recordings' },
    ],
  },
  'anthem-lyrics': {
    label: 'National anthem lyrics',
    // The index is generated; the verse files it indexes are curated by hand
    // under public/anthems/lyrics/. Both columns come from the same articles.
    files: ['data/anthem-lyrics.gen.ts'],
    origins: [{ source: 'wikipedia-articles', dataset: 'National anthem articles' }],
  },
  tongues: {
    label: 'Spoken-language recordings',
    files: ['data/tongues.gen.ts', 'data/tongue-facts.gen.ts'],
    origins: [
      { source: 'common-voice-clips', dataset: 'Validated clips by locale' },
      { source: 'wikidata-items', dataset: 'P1098 speakers, P282 scripts' },
    ],
  },
  currencies: {
    label: 'Banknotes',
    files: ['data/currencies.gen.ts'],
    origins: [
      { source: 'wikidata-items', dataset: 'P498 ISO 4217' },
      { source: 'commons-media', dataset: 'Banknote photography' },
    ],
  },
  leaders: {
    label: 'Heads of state and government',
    files: ['data/leaders.gen.ts'],
    origins: [
      { source: 'wikidata-items', dataset: 'P35 head of state, P6 head of government' },
      { source: 'commons-media', dataset: 'Portraits' },
      { source: 'cia-world-leaders' },
    ],
  },
  publicFinance: {
    label: 'Public finance',
    files: ['data/imf.gen.ts'],
    origins: [
      { source: 'imf-weo', dataset: 'World Economic Outlook: general government gross debt' },
    ],
  },
  parties: {
    label: 'Political parties',
    files: ['data/parties.gen.ts', 'data/parties-factbook.gen.ts'],
    origins: [
      // polity is the roster and, crucially, the STANDINGS — which side of the
      // chamber each party sits on. That used to be inferred by matching a
      // cabinet's party names against the Factbook's spelling of them.
      { source: 'polity', dataset: 'Chambers, seat counts, government/backing/opposition' },
      // The Factbook snapshot supplies BREADTH: parties that hold no seats,
      // which polity does not record and the impostor pools draw from.
      { source: 'cia-factbook', dataset: 'Government: political parties, legislative branch' },
      {
        source: 'wikidata-items',
        dataset: 'P1142 ideology, P1387 position, P465 colour, P463 membership',
      },
      { source: 'commons-media', dataset: 'Party logos' },
    ],
  },
  places: {
    label: 'Landmarks & World Heritage Sites',
    files: ['data/places.gen.ts'],
    // One roster from two selections, so both are claimed here: a place may be
    // a curated seed, an entry off the UNESCO register, or (sixty of them) both.
    origins: [
      { source: 'wikidata-items', dataset: 'Curated seeds resolved by Q-id' },
      { source: 'wikidata-items', dataset: 'P1435 = UNESCO World Heritage Site' },
      { source: 'commons-media' },
      { source: 'unsplash-photos' },
      { source: 'mondiale-editorial', dataset: 'generators/data/landmark-seeds.ts' },
    ],
  },
  events: {
    label: 'Timeline events',
    files: ['data/events.gen.ts'],
    origins: [
      { source: 'wikidata-items', dataset: 'Date claims verifying each seed' },
      { source: 'commons-media' },
      { source: 'wikipedia-articles' },
      { source: 'mondiale-editorial', dataset: 'generators/data/event-seeds.ts' },
    ],
  },
  changes: {
    label: 'World of Change',
    files: ['data/changes.gen.ts'],
    origins: [
      { source: 'nasa-earth-observatory', dataset: 'Matched Landsat/Terra pairs' },
      { source: 'usgs-earthshots', dataset: 'Matched Landsat pairs' },
      { source: 'naturalearth-10m', dataset: 'On-land validation of each subject' },
      { source: 'mondiale-editorial', dataset: 'generators/data/change-seeds.ts' },
    ],
  },
  empires: {
    label: 'Empire extents',
    files: ['data/empires.gen.ts', 'data/empire-paths.gen.ts', 'data/empire-flags.gen.ts'],
    origins: [
      { source: 'historical-basemaps-geojson' },
      { source: 'cshapes-2' },
      { source: 'commons-media', dataset: 'Historical flags' },
      { source: 'mondiale-editorial', dataset: 'generators/data/empire-seeds.ts' },
    ],
  },
  conflicts: {
    label: 'Armed conflicts',
    files: ['data/conflicts.gen.ts', 'data/conflict-profiles.gen.ts'],
    origins: [{ source: 'ucdp-acd' }],
  },
  'conflict-events': {
    label: 'Conflict fields',
    files: ['data/conflict-events.gen.ts'],
    origins: [{ source: 'ucdp-ged' }, { source: 'naturalearth-10m', dataset: 'Shared projection' }],
  },
  owid: {
    label: 'Indices and long series',
    files: ['data/owid.gen.ts', 'data/trends.gen.ts'],
    origins: [{ source: 'owid-grapher' }],
  },
  'marriage-rights': {
    label: 'Same-sex marriage legalization',
    files: ['data/marriage-rights.gen.ts'],
    origins: [{ source: 'equaldex-marriage', originator: 'Equaldex' }],
  },
  worldbank: {
    label: 'World Bank indicators',
    files: ['data/worldbank.gen.ts'],
    origins: [{ source: 'worldbank-wdi' }],
  },
  wpp: {
    label: 'Demography and population pyramids',
    files: ['data/wpp.gen.ts', 'data/wpp-trends.gen.ts', 'data/pyramids.gen.ts'],
    origins: [{ source: 'un-wpp-2024' }],
  },
  migration: {
    label: 'Where the foreign-born live',
    files: ['data/migration.gen.ts'],
    origins: [
      { source: 'un-migrant-stock-2024', dataset: 'Table 1 — stock by destination and origin' },
    ],
  },
  treaties: {
    label: 'Who signed what',
    files: ['data/treaties.gen.ts'],
    origins: [
      { source: 'untc-mtdsg', dataset: 'Status of treaties, by chapter' },
      { source: 'wikidata-items', dataset: 'Schengen Area membership' },
      { source: 'mondiale-editorial', dataset: 'data/static/treaty-corrections.ts' },
    ],
  },
}

/** A resolved credit, ready for a view. */
export interface Attribution {
  sourceId: SourceId
  source: Source
  providerId: ProviderId
  provider: Provider
  /** Who to name in one line: "SIPRI via Our World in Data". */
  credit: string
  /** The value's own year when it has one, else the release's. */
  year?: number
  /** Deepest link available: the series, else the source. */
  url: string
  dataset?: string
  license?: string
}

const resolve = (
  origin: DataOrigin,
  value?: Pick<Amount<unknown>, 'year' | 'source'>
): Attribution => {
  // A stamped value wins: it records the source the generator actually used,
  // which may be a fallback rather than the primary named above.
  const stamped = value?.source && value.source !== origin.source ? value.source : undefined
  const sourceId = stamped ?? origin.source
  const source = SOURCES[sourceId]
  const provider = PROVIDERS[source.provider]
  const originator = stamped ? undefined : origin.originator

  return {
    sourceId,
    source,
    providerId: source.provider,
    provider,
    credit: originator ? `${originator} via ${provider.name}` : provider.name,
    year: value?.year ?? source.year,
    url: (stamped ? undefined : origin.url) ?? source.url,
    dataset: stamped ? undefined : origin.dataset,
    license: source.license,
  }
}

/**
 * Where a stat's figure came from. Pass the Amount too — it carries the year
 * the value is from, and (once regenerated) the source that won its fallback
 * chain.
 */
export const attributionFor = (
  accessorId: GroupChallengeAccessorId | IndividualChallengeAccessorId,
  value?: Pick<Amount<unknown>, 'year' | 'source'>
): Attribution => {
  const origin =
    accessorId in STAT_ORIGINS
      ? STAT_ORIGINS[accessorId as GroupChallengeAccessorId]
      : INDIVIDUAL_STAT_ORIGINS[accessorId as IndividualChallengeAccessorId]
  return resolve(origin, value)
}

/** Where a trend series came from; `year` is the series' last point when given. */
export const trendAttribution = (metric: TrendMetricId, endYear?: number): Attribution =>
  resolve(TREND_ORIGINS[metric], endYear === undefined ? undefined : { year: endYear })

/** Every credit behind a whole dataset (photos, maps, city lights), primary first. */
export const datasetAttribution = (datasetId: DataSetId): Attribution[] =>
  DATASETS[datasetId].origins.map(origin => resolve(origin))

/** Collapse repeated credits when several figures share a panel (a clue
 *  recap, an atlas section): one entry per source+credit pair, first wins —
 *  its deep link and dataset stand for the group. */
export const dedupeAttributions = (attributions: Attribution[]): Attribution[] => {
  const seen = new Set<string>()
  return attributions.filter(attribution => {
    const key = `${attribution.sourceId}|${attribution.credit}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** One-line credit for a caption: "SIPRI via Our World in Data · 2024". */
export const attributionLine = (attribution: Attribution): string =>
  attribution.year ? `${attribution.credit} · ${attribution.year}` : attribution.credit

/** The caption a view puts under a stat, e.g. "UN World Population Prospects · 2023". */
export const statSourceLine = (
  accessorId: GroupChallengeAccessorId | IndividualChallengeAccessorId,
  value?: Pick<Amount<unknown>, 'year' | 'source'>
): string => attributionLine(attributionFor(accessorId, value))

/**
 * Per-file credit for a shipped photo. Commons and Unsplash both licence under
 * attribution terms, so the photographer travels with the image rather than
 * with its dataset — every generated entry that carries an `image` carries
 * these too.
 */
export interface MediaCredit {
  /** Author/photographer, as the source publishes it. */
  credit?: string
  /** Licence short name, e.g. "CC BY-SA 4.0". */
  license?: string
  /** Only where a dataset mixes sources (landmarks pull from both); otherwise
   *  the dataset's own origins say where the file came from. */
  imageSource?: SourceId
}

/** Just the credit fields of an entry that also holds game data — the one way
 *  to carry a photo's credit from one generator run to the next. Callers pass
 *  a whole generator row (a landmark with its name, image and coordinates);
 *  the extra fields are simply ignored. */
export const pickMediaCredit = (entry: MediaCredit | undefined): MediaCredit | undefined => {
  if (!entry?.credit && !entry?.license) return undefined
  return {
    ...(entry.credit ? { credit: entry.credit } : {}),
    ...(entry.license ? { license: entry.license } : {}),
    ...(entry.imageSource ? { imageSource: entry.imageSource } : {}),
  }
}

/** The line a view prints under a photo: "Jane Doe · CC BY-SA 4.0 · Wikimedia
 *  Commons". Undefined when nothing was captured — never render an empty rule. */
export const mediaCreditLine = (
  media: MediaCredit | undefined,
  fallbackSource?: SourceId
): string | undefined => {
  if (!media?.credit && !media?.license) return undefined
  const sourceId = media.imageSource ?? fallbackSource
  const provider = sourceId ? PROVIDERS[SOURCES[sourceId].provider].name : undefined
  return [media.credit, media.license, provider].filter(Boolean).join(' · ')
}
