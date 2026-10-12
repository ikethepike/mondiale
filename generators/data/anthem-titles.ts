import type { AnthemEntry } from '../create-anthems-file'
import type { ISOCountryCode } from '../../types/geography.types'

export type AnthemOverride = Pick<AnthemEntry, 'title'> &
  Partial<Pick<AnthemEntry, 'composer' | 'adoptedYear'>>

/**
 * Curated facts that win over Wikidata's, applied by `curateAnthem` to every
 * shipped entry.
 *
 * Wikidata's English label is often a description rather than a name
 * ("National anthem of Mauritania", "national anthem of Mzansi"), and the
 * generator reports any such label that has no row here. A title that still
 * reads like a description below is the anthem's actual name — South Africa's
 * has no other.
 */
export const ANTHEM_OVERRIDES: { [isoCode in ISOCountryCode]?: AnthemOverride } = {
  NZ: { title: 'God Defend New Zealand', composer: 'John Joseph Woods', adoptedYear: 1977 },
  AG: { title: 'Fair Antigua, We Salute Thee', composer: 'Walter Garnet Picart Chambers' },
  BZ: { title: 'Land of the Free', composer: 'Selwyn Walford Young', adoptedYear: 1981 },
  GD: { title: 'Hail Grenada', composer: 'Louis Arnold Masanto', adoptedYear: 1974 },
  PS: { title: "Fida'i" },

  AR: { title: 'Himno Nacional Argentino' },
  BB: { title: 'In Plenty and In Time of Need' },
  BO: { title: 'Himno Nacional de Bolivia' },
  BR: { title: 'Hino Nacional Brasileiro' },
  CL: { title: 'Himno Nacional de Chile' },
  CO: { title: 'Himno Nacional de la República de Colombia' },
  DE: { title: 'Deutschlandlied' },
  DO: { title: 'Quisqueyanos valientes' },
  GT: { title: 'Himno Nacional de Guatemala' },
  GY: { title: 'Dear Land of Guyana, of Rivers and Plains' },
  HN: { title: 'Himno Nacional de Honduras' },
  LB: { title: 'Kulluna lil-watan' },
  MR: { title: 'Bilāda l-ʾubāti l-hudāti l-kirām' },
  MV: { title: 'Gaumee Salaam' },
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
  YE: { title: 'United Republic' },
  ZW: { title: 'Simudzai Mureza wedu WeZimbabwe' },

  IR: { title: 'National Anthem of the Islamic Republic of Iran' },
  JO: { title: 'The Royal Anthem of Jordan' },
  KG: { title: 'State Anthem of the Kyrgyz Republic' },
  KW: { title: 'National Anthem of Kuwait' },
  RU: { title: 'State Anthem of the Russian Federation' },
  ZA: { title: 'National anthem of South Africa' },
}
