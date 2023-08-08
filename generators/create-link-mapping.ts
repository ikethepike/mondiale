import fs from 'fs'
import { FactbookResponse } from '~~/types/response.type'

const LINK_MAPPING_FILE = `./generators/link-mapping.gen.ts`

enum FactbookBindings {
  AF = 'AF',
  // AX = "AX",
  AL = 'AL',
  // AS = 'AQ', // american samoa
  AD = 'AN',
  AO = 'AO',
  // AI = 'AV', // Anguila
  AG = 'AC',
  AR = 'AR',
  AM = 'AM',
  // AW = 'AA', // dutch
  AU = 'AS',
  AT = 'AU',
  AZ = 'AJ',
  BS = 'BF',
  BH = 'BA',
  BD = 'BG',
  BB = 'BB',
  BY = 'BO',
  BE = 'BE',
  BZ = 'BH',
  BJ = 'BN',
  // BM = 'BD', // uk overseas
  BT = 'BT',
  BO = 'BL',
  BA = 'BK',
  BW = 'BC',
  // BV = "BV", // Dubious
  BR = 'BR',
  BN = 'BX',
  BG = 'BU',
  BF = 'UV',
  BI = 'BY',
  KH = 'CB',
  CM = 'CM',
  CA = 'CA',
  CV = 'CV', // dubious
  // KY = 'CJ',
  CF = 'CT',
  TD = 'CD',
  CL = 'CI',
  CN = 'CH',
  // CX = 'KT',
  // CC = 'CK',
  CO = 'CO',
  KM = 'CN',
  CG = 'CF',
  CD = 'CG',
  // CK = 'Cook Islands',
  CR = 'CS',
  CI = 'IV',
  HR = 'HR',
  CU = 'CU',
  // CW = 'Curaçao',
  CY = 'CY',
  CZ = 'EZ',
  DK = 'DA',
  DJ = 'DJ',
  DM = 'DO',
  DO = 'DR',
  DZ = 'AG',
  EC = 'EC',
  EG = 'EG',
  SV = 'ES',
  GQ = 'EK',
  ER = 'ER',
  EE = 'EN',
  ET = 'ET',
  // FK = 'Falkland Islands',
  // FO = 'Faroe Islands',
  FJ = 'FJ',
  FI = 'FI',
  FR = 'FR',
  // GF = 'French Guiana',
  // PF = 'French Polynesia',
  // TF = 'French Southern Territories',
  GA = 'GB',
  GM = 'GA',
  GE = 'GG',
  DE = 'GM',
  GH = 'GH',
  // GI = 'GI',
  GR = 'GR',
  // GL = 'GL', // Greenland is part of denmark
  GD = 'GJ',
  // GP = 'GP',
  // GU = 'GQ',
  GT = 'GT',
  // GG = 'Guernsey',
  GN = 'GV',
  GW = 'PU', // Pea
  GY = 'GY',
  HT = 'HA',
  // HM = 'Heard Island Mcdonald Islands',
  VA = 'VT',
  HN = 'HO',
  HK = 'HK',
  HU = 'HU',
  IS = 'IC',
  IN = 'IN',
  ID = 'ID',
  IR = 'IR',
  IQ = 'IZ',
  IE = 'EI',
  // IM = 'Isle Of Man',
  IL = 'IS',
  IT = 'IT',
  JM = 'JM',
  JP = 'JA',
  // JE = 'JE',
  JO = 'JO',
  KZ = 'KZ',
  KE = 'KE',
  KI = 'KR',
  KR = 'KS',
  KP = 'KN',
  KW = 'KU',
  KG = 'KG',
  LA = 'LA',
  LV = 'LG',
  LB = 'LE',
  LS = 'LT',
  LR = 'LI',
  LY = 'LY',
  LI = 'LS',
  LT = 'LH',
  LU = 'LU',
  // MO = 'MC', // Macau
  MG = 'MA',
  MW = 'MI',
  MY = 'MY',
  MV = 'MV',
  ML = 'ML',
  MT = 'MT',
  // MH = 'Marshall Islands',
  // MQ = 'Martinique',
  MR = 'MR',
  MU = 'MP',
  // YT = 'Mayotte',
  MX = 'MX',
  FM = 'FM',
  MD = 'MD',
  MC = 'MN',
  MN = 'MG',
  ME = 'MJ',
  // MS = 'Montserrat',
  MA = 'MO',
  MZ = 'MZ',
  MM = 'BM',
  NA = 'WA',
  NR = 'NR',
  NP = 'NP',
  NL = 'NL',
  // NC = 'New Caledonia',
  NZ = 'NZ',
  NI = 'NU',
  NE = 'NG',
  NG = 'NI',
  // NU = 'Niue' ,
  // NF = 'Norfolk Island',
  // MP = 'Northern Mariana Islands',
  NO = 'NO',
  OM = 'MU',
  PK = 'PK',
  PW = 'PS',
  PS = 'WE',
  PA = 'PM',
  PG = 'PP',
  PY = 'PA',
  PE = 'PE',
  PH = 'RP',
  // PN = 'Pitcairn',
  PL = 'PL',
  PT = 'PO',
  // PR = 'RQ',
  QA = 'QA',
  // RE = 'Reunion',
  MK = 'MK',
  RO = 'RO',
  RU = 'RS',
  RW = 'RW',
  // BL = 'Saint Barthelemy',
  // SH = 'Saint Helena',
  KN = 'SC',
  LC = 'ST',
  // MF = 'Saint Martin',
  // PM = 'Saint Pierre And Miquelon',
  // VC = 'Saint Vincent And Grenadines',
  // WS = 'WS',
  SM = 'SM',
  ST = 'TP',
  SA = 'SA',
  SN = 'SG',
  RS = 'RI',
  SC = 'SE',
  SL = 'SL',
  SG = 'SN',
  SK = 'LO',
  SI = 'SI',
  SB = 'BP',
  SO = 'SO',
  ZA = 'SF',
  // GS = 'South Georgia And Sandwich Island',
  ES = 'SP',
  LK = 'CE',
  SD = 'SU',
  SS = 'OD',
  SR = 'NS',
  // SJ = 'Svalbard And Jan Mayen',
  SZ = 'WZ',
  SE = 'SW',
  CH = 'SZ',
  // SX = 'Sint Maarten (Dutch part)',
  SY = 'SY',
  TW = 'TW',
  TJ = 'TI',
  TZ = 'TZ',
  TH = 'TH',
  TL = 'TT',
  TG = 'TO',
  // TK = 'Tokelau',
  TO = 'TN',
  TT = 'TD',
  TN = 'TS',
  TR = 'TU',
  TM = 'TX',
  // TC = 'Turks And Caicos Islands',
  TV = 'TV',
  UG = 'UG',
  UA = 'UP',
  AE = 'AE',
  GB = 'UK',
  US = 'US',
  // UM = 'United States Outlying Islands',
  UY = 'UY',
  UZ = 'UZ',
  VU = 'NH',
  VE = 'VE',
  VN = 'VM',
  // VG = 'Virgin Islands British',
  // VI = 'Virgin Islands US',
  // WF = 'Wallis And Futuna',
  // EH = 'Western Sahara',
  YE = 'YM',
  ZM = 'ZA',
  ZW = 'ZI',
  // XK = 'KV',
}

const folders = [
  'africa',
  'central-asia',
  'east-n-southeast-asia',
  'europe',
  'middle-east',
  'south-america',
  'central-america-n-caribbean',
  'south-asia',
  'north-america',
  'australia-oceania',
]

export interface ISOFipsMapping {
  isoCode: string
  fipsCode: string
}

export interface LinkMapping extends ISOFipsMapping {
  url: string
  folder: string
}

const possibleNonSovereigns: { isoCode: string; fipsCode: string; url: string }[] = []

export const createLinkMapping = async () => {
  const countryCodeBinding = Object.entries(FactbookBindings)
  const successfulCombinations: LinkMapping[] = []
  const failedCombinations: ISOFipsMapping[] = []

  let amount = 1
  for (const [isoCode, fipsCode] of countryCodeBinding) {
    let found = false
    console.info(`Processing country: ${isoCode} - ${amount++} of ${countryCodeBinding.length}`)
    for (const folder of folders) {
      if (found) continue

      console.log(`> Trying folder: ${folder}`)
      try {
        const url = `https://github.com/factbook/factbook.json/raw/master/${folder}/${fipsCode.toLowerCase()}.json`
        const response = await fetch(url)
        const parsed: FactbookResponse = await response.json()
        if (Reflect.has(parsed.Government, 'Dependency status')) {
          console.log(`👁️ Potential non-sovereign found: ${isoCode} - ${url}`)
          possibleNonSovereigns.push({ isoCode, fipsCode, url })
        }
        found = true
        successfulCombinations.push({ fipsCode, folder, isoCode, url })
        console.log(`☀️ Found successful combination for: ${isoCode}`)
      } catch (e) {}
    }

    if (!found) {
      console.warn(`⚠️ Failed to find: ${fipsCode}`)
      failedCombinations.push({ fipsCode, isoCode })
    }
  }

  console.log(`Found: ${successfulCombinations.length}`)
  console.log(`Failed: ${failedCombinations.length}`)

  const date = new Date()
  fs.writeFileSync(
    LINK_MAPPING_FILE,
    `
      // This is a generated file, don't touch it. 
      // Generated at: ${date.toISOString()}
      import { ISOFipsMapping, LinkMapping } from './create-link-mapping'

      export const successfulCombinations: LinkMapping[] = ${JSON.stringify(successfulCombinations)}
      export const failedCombinations: ISOFipsMapping[] = ${JSON.stringify(failedCombinations)}
      export const possibleNonSovereigns: {isoCode: string, fipsCode: string, url: string }[] = ${JSON.stringify(
        possibleNonSovereigns
      )}
    `
  )

  console.log(`Written to file: ${LINK_MAPPING_FILE}`)
}

createLinkMapping()
