import { AgeDistribution, RankValue, Value } from './../george/george'
export type CountryCode =
  | 'AF'
  | 'AO'
  | 'AL'
  | 'AE'
  | 'AR'
  | 'AM'
  | 'AU'
  | 'AT'
  | 'AZ'
  | 'BI'
  | 'BE'
  | 'BJ'
  | 'BF'
  | 'BD'
  | 'BG'
  | 'BA'
  | 'BY'
  | 'BZ'
  | 'BO'
  | 'BR'
  | 'BN'
  | 'BT'
  | 'BW'
  | 'CF'
  | 'CA'
  | 'CH'
  | 'CL'
  | 'CN'
  | 'CI'
  | 'CM'
  | 'CD'
  | 'CG'
  | 'CO'
  | 'CR'
  | 'CU'
  | 'CZ'
  | 'DE'
  | 'DJ'
  | 'DK'
  | 'DO'
  | 'DZ'
  | 'EC'
  | 'EG'
  | 'ER'
  | 'EE'
  | 'ET'
  | 'FI'
  | 'FJ'
  | 'GA'
  | 'GB'
  | 'GE'
  | 'GH'
  | 'GN'
  | 'GM'
  | 'GW'
  | 'GQ'
  | 'GR'
  | 'GL'
  | 'GT'
  | 'GY'
  | 'HN'
  | 'HR'
  | 'HT'
  | 'HU'
  | 'ID'
  | 'IN'
  | 'IE'
  | 'IR'
  | 'IQ'
  | 'IS'
  | 'IL'
  | 'IT'
  | 'JM'
  | 'JO'
  | 'JP'
  | 'KZ'
  | 'KE'
  | 'KG'
  | 'KH'
  | 'KR'
  | 'XK'
  | 'KW'
  | 'LA'
  | 'LB'
  | 'LR'
  | 'LY'
  | 'LK'
  | 'LS'
  | 'LT'
  | 'LU'
  | 'LV'
  | 'MA'
  | 'MD'
  | 'MG'
  | 'MX'
  | 'MK'
  | 'ML'
  | 'MM'
  | 'ME'
  | 'MN'
  | 'MZ'
  | 'MR'
  | 'MW'
  | 'MY'
  | 'NA'
  | 'NE'
  | 'NG'
  | 'NI'
  | 'NL'
  | 'NO'
  | 'NP'
  | 'NZ'
  | 'OM'
  | 'PK'
  | 'PA'
  | 'PE'
  | 'PH'
  | 'PG'
  | 'PL'
  | 'KP'
  | 'PT'
  | 'PY'
  | 'PS'
  | 'QA'
  | 'RO'
  | 'RU'
  | 'RW'
  | 'EH'
  | 'SA'
  | 'SD'
  | 'SS'
  | 'SN'
  | 'SL'
  | 'SV'
  | 'RS'
  | 'SR'
  | 'SK'
  | 'SI'
  | 'SE'
  | 'SZ'
  | 'SY'
  | 'TD'
  | 'TG'
  | 'TH'
  | 'TJ'
  | 'TM'
  | 'TL'
  | 'TN'
  | 'TR'
  | 'TW'
  | 'TZ'
  | 'UG'
  | 'UA'
  | 'UY'
  | 'US'
  | 'UZ'
  | 'VE'
  | 'VN'
  | 'VU'
  | 'YE'
  | 'ZA'
  | 'ZM'
  | 'ZW'
  | 'SO'
  | 'FR'
  | 'ES'
  | 'AW'
  | 'AI'
  | 'AD'
  | 'AG'
  | 'BS'
  | 'BM'
  | 'BB'
  | 'KM'
  | 'CV'
  | 'KY'
  | 'DM'
  | 'FK'
  | 'FO'
  | 'GD'
  | 'HK'
  | 'KN'
  | 'LC'
  | 'LI'
  | 'MF'
  | 'MV'
  | 'MT'
  | 'MS'
  | 'MU'
  | 'NC'
  | 'NR'
  | 'PN'
  | 'PR'
  | 'PF'
  | 'SG'
  | 'SB'
  | 'ST'
  | 'SX'
  | 'SC'
  | 'TC'
  | 'TO'
  | 'TT'
  | 'VC'
  | 'VG'
  | 'VI'
  | 'CY'
  | 'RE'
  | 'YT'
  | 'MQ'
  | 'GP'
  | 'CW'
  | 'IC'

type Countries = {
  [key in CountryCode]: {
    name: string
  }
}

export const countries: Countries = {
  AF: {
    name: 'Afghanistan',
  },
  AO: {
    name: 'Angola',
  },
  AL: {
    name: 'Albania',
  },
  AE: {
    name: 'United Arab Emirates',
  },
  AR: {
    name: 'Argentina',
  },
  AM: {
    name: 'Armenia',
  },
  AU: {
    name: 'Australia',
  },
  AT: {
    name: 'Austria',
  },
  AZ: {
    name: 'Azerbaijan',
  },
  BI: {
    name: 'Burundi',
  },
  BE: {
    name: 'Belgium',
  },
  BJ: {
    name: 'Benin',
  },
  BF: {
    name: 'Burkina Faso',
  },
  BD: {
    name: 'Bangladesh',
  },
  BG: {
    name: 'Bulgaria',
  },
  BA: {
    name: 'Bosnia and Herzegovina',
  },
  BY: {
    name: 'Belarus',
  },
  BZ: {
    name: 'Belize',
  },
  BO: {
    name: 'Bolivia',
  },
  BR: {
    name: 'Brazil',
  },
  BN: {
    name: 'Brunei Darussalam',
  },
  BT: {
    name: 'Bhutan',
  },
  BW: {
    name: 'Botswana',
  },
  CF: {
    name: 'Central African Republic',
  },
  CA: {
    name: 'Canada',
  },
  CH: {
    name: 'Switzerland',
  },
  CL: {
    name: 'Chile',
  },
  CN: {
    name: 'China',
  },
  CI: {
    name: "Côte d'Ivoire",
  },
  CM: {
    name: 'Cameroon',
  },
  CD: {
    name: 'Democratic Republic of the Congo',
  },
  CG: {
    name: 'Republic of Congo',
  },
  CO: {
    name: 'Colombia',
  },
  CR: {
    name: 'Costa Rica',
  },
  CU: {
    name: 'Cuba',
  },
  CZ: {
    name: 'Czech Republic',
  },
  DE: {
    name: 'Germany',
  },
  DJ: {
    name: 'Djibouti',
  },
  DK: {
    name: 'Denmark',
  },
  DO: {
    name: 'Dominican Republic',
  },
  DZ: {
    name: 'Algeria',
  },
  EC: {
    name: 'Ecuador',
  },
  EG: {
    name: 'Egypt',
  },
  ER: {
    name: 'Eritrea',
  },
  EE: {
    name: 'Estonia',
  },
  ET: {
    name: 'Ethiopia',
  },
  FI: {
    name: 'Finland',
  },
  FJ: {
    name: 'Fiji',
  },
  GA: {
    name: 'Gabon',
  },
  GB: {
    name: 'United Kingdom',
  },
  GE: {
    name: 'Georgia',
  },
  GH: {
    name: 'Ghana',
  },
  GN: {
    name: 'Guinea',
  },
  GM: {
    name: 'The Gambia',
  },
  GW: {
    name: 'Guinea-Bissau',
  },
  GQ: {
    name: 'Equatorial Guinea',
  },
  GR: {
    name: 'Greece',
  },
  GL: {
    name: 'Greenland',
  },
  GT: {
    name: 'Guatemala',
  },
  GY: {
    name: 'Guyana',
  },
  HN: {
    name: 'Honduras',
  },
  HR: {
    name: 'Croatia',
  },
  HT: {
    name: 'Haiti',
  },
  HU: {
    name: 'Hungary',
  },
  ID: {
    name: 'Indonesia',
  },
  IN: {
    name: 'India',
  },
  IE: {
    name: 'Ireland',
  },
  IR: {
    name: 'Iran',
  },
  IQ: {
    name: 'Iraq',
  },
  IS: {
    name: 'Iceland',
  },
  IL: {
    name: 'Israel',
  },
  IT: {
    name: 'Italy',
  },
  JM: {
    name: 'Jamaica',
  },
  JO: {
    name: 'Jordan',
  },
  JP: {
    name: 'Japan',
  },
  KZ: {
    name: 'Kazakhstan',
  },
  KE: {
    name: 'Kenya',
  },
  KG: {
    name: 'Kyrgyzstan',
  },
  KH: {
    name: 'Cambodia',
  },
  KR: {
    name: 'Republic of Korea',
  },
  XK: {
    name: 'Kosovo',
  },
  KW: {
    name: 'Kuwait',
  },
  LA: {
    name: 'Lao PDR',
  },
  LB: {
    name: 'Lebanon',
  },
  LR: {
    name: 'Liberia',
  },
  LY: {
    name: 'Libya',
  },
  LK: {
    name: 'Sri Lanka',
  },
  LS: {
    name: 'Lesotho',
  },
  LT: {
    name: 'Lithuania',
  },
  LU: {
    name: 'Luxembourg',
  },
  LV: {
    name: 'Latvia',
  },
  MA: {
    name: 'Morocco',
  },
  MD: {
    name: 'Moldova',
  },
  MG: {
    name: 'Madagascar',
  },
  MX: {
    name: 'Mexico',
  },
  MK: {
    name: 'Macedonia',
  },
  ML: {
    name: 'Mali',
  },
  MM: {
    name: 'Myanmar',
  },
  ME: {
    name: 'Montenegro',
  },
  MN: {
    name: 'Mongolia',
  },
  MZ: {
    name: 'Mozambique',
  },
  MR: {
    name: 'Mauritania',
  },
  MW: {
    name: 'Malawi',
  },
  MY: {
    name: 'Malaysia',
  },
  NA: {
    name: 'Namibia',
  },
  NE: {
    name: 'Niger',
  },
  NG: {
    name: 'Nigeria',
  },
  NI: {
    name: 'Nicaragua',
  },
  NL: {
    name: 'Netherlands',
  },
  NO: {
    name: 'Norway',
  },
  NP: {
    name: 'Nepal',
  },
  NZ: {
    name: 'New Zealand',
  },
  OM: {
    name: 'Oman',
  },
  PK: {
    name: 'Pakistan',
  },
  PA: {
    name: 'Panama',
  },
  PE: {
    name: 'Peru',
  },
  PH: {
    name: 'Philippines',
  },
  PG: {
    name: 'Papua New Guinea',
  },
  PL: {
    name: 'Poland',
  },
  KP: {
    name: 'Dem. Rep. Korea',
  },
  PT: {
    name: 'Portugal',
  },
  PY: {
    name: 'Paraguay',
  },
  PS: {
    name: 'Palestine',
  },
  QA: {
    name: 'Qatar',
  },
  RO: {
    name: 'Romania',
  },
  RU: {
    name: 'Unnamed',
  },
  RW: {
    name: 'Rwanda',
  },
  EH: {
    name: 'Western Sahara',
  },
  SA: {
    name: 'Saudi Arabia',
  },
  SD: {
    name: 'Sudan',
  },
  SS: {
    name: 'South Sudan',
  },
  SN: {
    name: 'Senegal',
  },
  SL: {
    name: 'Sierra Leone',
  },
  SV: {
    name: 'El Salvador',
  },
  RS: {
    name: 'Serbia',
  },
  SR: {
    name: 'Suriname',
  },
  SK: {
    name: 'Slovakia',
  },
  SI: {
    name: 'Slovenia',
  },
  SE: {
    name: 'Sweden',
  },
  SZ: {
    name: 'Swaziland',
  },
  SY: {
    name: 'Syria',
  },
  TD: {
    name: 'Chad',
  },
  TG: {
    name: 'Togo',
  },
  TH: {
    name: 'Thailand',
  },
  TJ: {
    name: 'Tajikistan',
  },
  TM: {
    name: 'Turkmenistan',
  },
  TL: {
    name: 'Timor-Leste',
  },
  TN: {
    name: 'Tunisia',
  },
  TR: {
    name: 'Turkey',
  },
  TW: {
    name: 'Taiwan',
  },
  TZ: {
    name: 'Tanzania',
  },
  UG: {
    name: 'Uganda',
  },
  UA: {
    name: 'Ukraine',
  },
  UY: {
    name: 'Uruguay',
  },
  US: {
    name: 'United States',
  },
  UZ: {
    name: 'Uzbekistan',
  },
  VE: {
    name: 'Venezuela',
  },
  VN: {
    name: 'Vietnam',
  },
  VU: {
    name: 'Vanuatu',
  },
  YE: {
    name: 'Yemen',
  },
  ZA: {
    name: 'South Africa',
  },
  ZM: {
    name: 'Zambia',
  },
  ZW: {
    name: 'Zimbabwe',
  },
  SO: {
    name: 'Somalia',
  },
  FR: {
    name: 'France',
  },
  ES: {
    name: 'Spain',
  },
  AW: {
    name: 'Aruba',
  },
  AI: {
    name: 'Anguilla',
  },
  AD: {
    name: 'Andorra',
  },
  AG: {
    name: 'Antigua and Barbuda',
  },
  BS: {
    name: 'Bahamas',
  },
  BM: {
    name: 'Bermuda',
  },
  BB: {
    name: 'Barbados',
  },
  KM: {
    name: 'Comoros',
  },
  CV: {
    name: 'Cape Verde',
  },
  KY: {
    name: 'Cayman Islands',
  },
  DM: {
    name: 'Dominica',
  },
  FK: {
    name: 'Falkland Islands',
  },
  FO: {
    name: 'Faeroe Islands',
  },
  GD: {
    name: 'Grenada',
  },
  HK: {
    name: 'Hong Kong',
  },
  KN: {
    name: 'Saint Kitts and Nevis',
  },
  LC: {
    name: 'Saint Lucia',
  },
  LI: {
    name: 'Liechtenstein',
  },
  MF: {
    name: 'Saint Martin (French)',
  },
  MV: {
    name: 'Maldives',
  },
  MT: {
    name: 'Malta',
  },
  MS: {
    name: 'Montserrat',
  },
  MU: {
    name: 'Mauritius',
  },
  NC: {
    name: 'New Caledonia',
  },
  NR: {
    name: 'Nauru',
  },
  PN: {
    name: 'Pitcairn Islands',
  },
  PR: {
    name: 'Puerto Rico',
  },
  PF: {
    name: 'French Polynesia',
  },
  SG: {
    name: 'Singapore',
  },
  SB: {
    name: 'Solomon Islands',
  },
  ST: {
    name: 'São Tomé and Principe',
  },
  SX: {
    name: 'Saint Martin (Dutch)',
  },
  SC: {
    name: 'Seychelles',
  },
  TC: {
    name: 'Turks and Caicos Islands',
  },
  TO: {
    name: 'Tonga',
  },
  TT: {
    name: 'Trinidad and Tobago',
  },
  VC: {
    name: 'Saint Vincent and the Grenadines',
  },
  VG: {
    name: 'British Virgin Islands',
  },
  VI: {
    name: 'United States Virgin Islands',
  },
  CY: {
    name: 'Cyprus',
  },
  RE: {
    name: 'Reunion (France)',
  },
  YT: {
    name: 'Mayotte (France)',
  },
  MQ: {
    name: 'Martinique (France)',
  },
  GP: {
    name: 'Guadeloupe (France)',
  },
  CW: {
    name: 'Curaco (Netherlands)',
  },
  IC: {
    name: 'Canary Islands (Spain)',
  },
}

export interface Country {
  name: string
  countryCode: string
  statistics: {
    economics: {
      gdp?: number
      gdpPerCapita?: number
      militarySpending: RankValue
      populationBelowPovertyLine: number
    }
    geography: {
      landArea: Value
      waterArea: Value
      totalArea: Value
      lowestPoint: Value
      highestPoint: Value
      forestedLand: Value
      arableLand: Value
    }
    unemployment: {
      youthPercentage: number
      totalPercentage: number
    }
    infrastructure: {
      roadLength: Value
      railLength: Value
      electricity: {
        populationWithoutAccess: number
      }
    }
    religion: {
      atheism: number
      believers: number
      agnosticism: number
    }
    population: {
      total: number
      minorityPercentage: number
      refugeesAndStatelessPercentage: number
    }
    environment: {
      emissions: {
        rank: number
        megatons: number
      }
      crudeOilConsumption: {
        rank: number
        barrelsPerDay: number
      }
      energySources: {
        fossilFuels: number
        nuclearFuels: number
        renewableSources: number
      }
    }
    education: {
      literacy: {
        male: number
        female: number
        average: number
      }
    }
    health: {
      obesity: number
      medicalAccess: {
        doctorsPer1000: number
        hospitalBedsPer1000: number
      }
      lifeExpectancy: number
      childrenPerWoman: number
      underweightChildren: number
      contraceptivePrevalence: number
      meanAgeOfBirth: number
      ageDistribution: {
        '0-14': AgeDistribution
        '15-24': AgeDistribution
        '25-54': AgeDistribution
        '55-64': AgeDistribution
        '65-120': AgeDistribution
      }
      sexRatio: {
        male: number
        female: number
      }
    }
  }
}
