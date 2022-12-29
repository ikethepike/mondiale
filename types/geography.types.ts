import { ISOCountryCodes } from '~~/data/iso-codes.gen'

export interface Amount<Unit> {
  amount: number
  unit: Unit
  year?: number
}

export interface Country {
  flag: string
  isoCode: string
  url: string
  name: {
    local: string
    english: string
  }
  economics: {
    gdpPerCapita?: Amount<'$'>
    militarySpending?: Amount<'%'>
    populationBelowPovertyLine?: Amount<'%'>
    equality?: Amount<'Gini Coefficient'>
  }
  geography: {
    area: {
      land?: Amount<'km²'>
      water?: Amount<'km²'>
      total?: Amount<'km²'>
      arable?: Amount<'%'>
      forested?: Amount<'%'>
    }
    highestPeak?: Amount<'m'> & {
      name: string
    }
    capital: {
      name: string
    }
  }
  unemployment: {
    youth?: Amount<'%'>
    total?: Amount<'%'>
  }
  infrastructure: {
    roads?: Amount<'km'>
    rail?: Amount<'km'>
    electricityAccess?: Amount<'%'>
    internetAccess?: Amount<'%'>
  }
  gender: {
    womenInParliament?: Amount<'%'>
    motherMeanAgeAtBirth?: Amount<'years'>
  }
  people: {
    obesity?: Amount<'%'>
    population?: Amount<'people'>
    lifeExpectancy?: Amount<'years'>
    medianAge?: Amount<'years'>
    childrenPerWoman?: Amount<'children'>
    populationGrowthRate?: Amount<'%'>
  }
  education: {
    literacy?: Amount<'%'>
    averageYearsOfStudy?: Amount<'years'>
  }
  health: {
    doctors?: Amount<'per 1000 people'>
    hospitalBeds?: Amount<'per 1000 people'>
    accessToContraceptives?: Amount<'%'>
    lifeExpectancy?: Amount<'years'>
    alcoholConsumption?: Amount<'liters of pure alcohol'>
    tobaccoUse?: Amount<'%'>
  }
  religion: {
    atheism?: Amount<'%'>
    believers?: Amount<'%'>
  }
  environment: {
    CO2Emissions?: Amount<'megatons'>
    renewables?: Amount<'%'>
  }
  humanRights: {
    gayMarriageLegalized?: Amount<'year'>
    refugees?: Amount<'people'>
  }
}

// export interface Country {
//   name: string;
//   flag?: string;
//   countryCode?: string;
//   economics: {
//     gdpPerCapita?: RankValue;
//     militarySpending?: {
//       units: string;
//       value: number;
//       rank: number;
//     };
//     populationBelowPovertyLine?: number;
//   };
//   geography: {
//     area: {
//       land?: Value;
//       water?: Value;
//       total?: Value;
//       arable?: Value;
//       forested?: Value;
//     };
//     elevation: {
//       lowest?: ElevationPoint;
//       highest?: ElevationPoint;
//     };
//     capital?: {
//       name: string;
//       population?: number;
//     };
//   };
//   unemployment: {
//     youth?: Value;
//     total?: Value;
//   };
//   infrastructure: {
//     length: {
//       road?: Value;
//       rail?: Value;
//     };
//     electricity: {
//       populationWithoutAccess?: Value;
//     };
//   };
//   religion: {
//     atheismAgnosticism?: Value;
//     believers?: Value;
//   };
//   population: {
//     total: number;
//     vulnerableGroups: {
//       minority?: Number;
//       refugees?: Number;
//     };
//   };
//   environment: {
//     emissions?: {
//       rank?: number;
//       megatons?: number;
//     };
//     crudeOilConsumption?: {
//       rank: number;
//       cubicMeters: number;
//     };
//     energyBreakdownPercent?: {
//       fossilFuels?: number;
//       nuclearFuels?: number;
//       renewableSources?: number;
//     };
//   };
//   education: {
//     literacy: {
//       male?: Value;
//       female?: Value;
//       total?: Value;
//     };
//     averageEducation: {
//       male?: Value;
//       total?: Value;
//       female?: Value;
//     };
//   };
//   health: {
//     obesity?: {
//       rank: number;
//       percentageOfAdults: number;
//     };
//     access: {
//       doctors?: {
//         value: number;
//         units: string;
//       };
//       hospitalBeds?: {
//         value: number;
//         units: string;
//       };
//     };
//     lifeExpectancy?: number;
//     childrenPerWoman?: number;
//     contraceptivePrevalence?: Value;
//     meanAgeOfBirth?: number;
//     ageDistribution?: {
//       "0-14": AgeDistribution;
//       "15-24": AgeDistribution;
//       "25-54": AgeDistribution;
//       "55-64": AgeDistribution;
//       "65-120": AgeDistribution;
//     };
//     // sexRatio?: {
//     //   male: number
//     //   female: number
//     // }
//   };
// }

export const PotentialISOCountryCodes = [
  'AD',
  'AE',
  'AF',
  'AG',
  'AI',
  'AL',
  'AM',
  'AO',
  'AR',
  'AT',
  'AU',
  'AW',
  'AZ',
  'BA',
  'BB',
  'BD',
  'BE',
  'BF',
  'BG',
  'BH',
  'BI',
  'BJ',
  'BM',
  'BN',
  'BO',
  'BR',
  'BS',
  'BT',
  'BW',
  'BY',
  'BZ',
  'CA',
  'CD',
  'CF',
  'CG',
  'CH',
  'CI',
  'CL',
  'CM',
  'CN',
  'CO',
  'CR',
  'CU',
  'CV',
  'CW',
  'CY',
  'CZ',
  'DE',
  'DJ',
  'DK',
  'DM',
  'DO',
  'DZ',
  'EC',
  'EE',
  'EG',
  'EH',
  'ER',
  'ES',
  'ET',
  'FI',
  'FJ',
  'FK',
  'FM',
  'FO',
  'FR',
  'GA',
  'GB',
  'GD',
  'GE',
  'GF',
  'GH',
  'GL',
  'GM',
  'GN',
  'GP',
  'GQ',
  'GR',
  'GT',
  'GW',
  'GY',
  'HK',
  'HN',
  'HR',
  'HT',
  'HU',
  'IC',
  'ID',
  'IE',
  'IL',
  'IN',
  'IQ',
  'IR',
  'IS',
  'IT',
  'JM',
  'JO',
  'JP',
  'KE',
  'KG',
  'KH',
  'KI',
  'KM',
  'KN',
  'KP',
  'KR',
  'KW',
  'KY',
  'KZ',
  'LA',
  'LB',
  'LC',
  'LI',
  'LK',
  'LR',
  'LS',
  'LT',
  'LU',
  'LV',
  'LY',
  'MA',
  'MC',
  'MD',
  'ME',
  'MF',
  'MG',
  'MK',
  'ML',
  'MM',
  'MN',
  'MQ',
  'MR',
  'MS',
  'MT',
  'MU',
  'MV',
  'MW',
  'MX',
  'MY',
  'MZ',
  'NA',
  'NC',
  'NE',
  'NG',
  'NI',
  'NL',
  'NO',
  'NP',
  'NR',
  'NZ',
  'OM',
  'PA',
  'PE',
  'PF',
  'PG',
  'PH',
  'PK',
  'PL',
  'PN',
  'PR',
  'PS',
  'PT',
  'PY',
  'QA',
  'RE',
  'RO',
  'RS',
  'RU',
  'RW',
  'SA',
  'SB',
  'SC',
  'SD',
  'SE',
  'SG',
  'SI',
  'SK',
  'SL',
  'SN',
  'SO',
  'SR',
  'SS',
  'ST',
  'SV',
  'SX',
  'SY',
  'SZ',
  'TC',
  'TD',
  'TG',
  'TH',
  'TJ',
  'TL',
  'TM',
  'TN',
  'TO',
  'TR',
  'TT',
  'TW',
  'TZ',
  'UA',
  'UG',
  'PW',
  'US',
  'UY',
  'UZ',
  'VA',
  'VC',
  'VE',
  'VG',
  'VI',
  'VN',
  'VU',
  'XK',
  'YE',
  'YT',
  'ZA',
  'ZM',
  'ZW',
  'SM',
  'TV',
] as const

export type ISOCountryCode = typeof ISOCountryCodes[number]

export const isValidISOCode = (code: any): code is ISOCountryCode => {
  return code && ISOCountryCodes.includes(code)
}
