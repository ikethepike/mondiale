import type { AnthemEntry } from '../create-anthems-file'
import type { ISOCountryCode } from '../../types/geography.types'

/** `null` drops a harvested field that is wrong and has no curated replacement. */
export type AnthemOverride = Partial<Pick<AnthemEntry, 'title'>> & {
  [field in 'composer' | 'writtenYear']?: AnthemEntry[field] | null
}

/** Curated facts that win over Wikidata's. A title below that reads like a
 *  description is the anthem's actual name. */
export const ANTHEM_OVERRIDES: { [isoCode in ISOCountryCode]?: AnthemOverride } = {
  NZ: { title: 'God Defend New Zealand', composer: 'John Joseph Woods', writtenYear: 1876 },
  AG: { title: 'Fair Antigua, We Salute Thee', composer: 'Walter Garnet Picart Chambers' },
  BZ: { title: 'Land of the Free', composer: 'Selwyn Walford Young' },
  GD: { title: 'Hail Grenada', composer: 'Louis Arnold Masanto' },
  PS: { title: "Fida'i" },

  AR: { title: 'Himno Nacional Argentino' },
  BB: { title: 'In Plenty and In Time of Need' },
  BO: { title: 'Himno Nacional de Bolivia' },
  BR: { title: 'Hino Nacional Brasileiro' },
  CL: { title: 'Himno Nacional de Chile' },
  CO: { title: 'Himno Nacional de la República de Colombia', composer: 'Oreste Síndici' },
  DE: { title: 'Deutschlandlied' },
  DO: { title: 'Quisqueyanos valientes' },
  GT: { title: 'Himno Nacional de Guatemala' },
  GY: { title: 'Dear Land of Guyana, of Rivers and Plains' },
  HN: { title: 'Himno Nacional de Honduras' },
  LB: { title: 'Kulluna lil-watan', writtenYear: null },
  MR: { title: 'Bilāda l-ʾubāti l-hudāti l-kirām' },
  MV: { title: 'Qaumii salaam' },
  MX: { title: 'Himno Nacional Mexicano' },
  PA: { title: 'Himno Istmeño' },
  PE: { title: 'Himno Nacional del Perú' },
  PY: { title: 'Paraguayos, República o Muerte' },
  SG: { title: 'Majulah Singapura' },
  SV: { title: 'Himno Nacional de El Salvador' },
  TH: { title: 'Phleng Chat Thai' },
  TJ: { title: 'Surudi Milli' },
  TM: { title: 'Garaşsyz, Bitarap Türkmenistanyň Döwlet Gimni' },
  UY: { title: 'Himno Nacional de Uruguay' },
  UZ: { title: 'Oʻzbekiston Respublikasining Davlat madhiyasi' },
  VE: { title: 'Gloria al Bravo Pueblo' },
  YE: { title: 'United Republic', writtenYear: null },
  ZW: { title: 'Simudzai Mureza wedu WeZimbabwe' },

  IT: { writtenYear: 1847 },
  PL: { writtenYear: 1797 },
  TD: { composer: 'Paul Villard' },
  TZ: { writtenYear: 1897 },
  NL: { composer: null },
  AZ: { writtenYear: null },
  BY: { writtenYear: null },
  UA: { writtenYear: null },

  IR: { title: 'National Anthem of the Islamic Republic of Iran' },
  JO: { title: 'The Royal Anthem of Jordan' },
  KG: { title: 'State Anthem of the Kyrgyz Republic' },
  KW: { title: 'National Anthem of Kuwait' },
  RU: { title: 'State Anthem of the Russian Federation' },
  ZA: { title: 'National Anthem of South Africa' },
}
