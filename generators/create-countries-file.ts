import { readFileSync, writeFileSync } from 'fs'
import { getEnabledCategories } from 'trace_events'
import { MARRIAGE_RIGHTS } from '~~/data/static/marriage-rights'
import { fetchBeltAndRoadIniativeParticipants } from '~~/lib/generators/vendors/wikipedia'
import { extractNumbers, extractYears, getPercentages, removeAfterCharacter } from '~~/lib/strings'
import { Amount, Region, Country, isValidContinent, ISOCountryCode } from '~~/types/geography.types'
import { isOrganizationKey, Organization, OrganizationVector } from '~~/types/organization.type'
import { FactbookResponse, isYearlyIndex, TextNode, YearlyIndex } from '~~/types/response.type'
import { FactbookRegion } from '~~/types/vendor/factbook/factbook-types.gen'
import { successfulCombinations } from './link-mapping.gen'

const ISO_CODE_FILE = `data/iso-codes.gen.ts`
const COUNTRIES_FILE = `data/countries.gen.ts`
const REGIONS_FILE = `types/vendor/factbook/factbook-types.gen.ts`

export const createCountriesFile = async (): Promise<{
  [isoCode: string]: Country
}> => {
  // Fetch additional information
  let briMembership: string[] = []
  try {
    briMembership = await fetchBeltAndRoadIniativeParticipants()
  } catch (e) {
    console.warn(`Failed to fetch BRI membership`, e)
  }

  const countryVector: { [isoCode: string]: Country } = {}
  const factbookContinents = new Set<string>([])
  for (const { url, isoCode } of successfulCombinations) {
    try {
      const response = await fetch(url)
      const data: FactbookResponse = await response.json()
      countryVector[isoCode] = normalizeCountry({ data, isoCode, url, briMembership })
      factbookContinents.add(data.Geography['Map references']?.text)
    } catch (e) {
      console.warn(`Failed to fetch: ${isoCode} - ${url}`, e)
    }
  }

  writeFileSync(
    ISO_CODE_FILE,
    `
    export const ISOCountryCodes = ${JSON.stringify(Object.keys(countryVector))} as const 
    `
  )

  console.log(`Finished creating file: ${ISO_CODE_FILE}`)

  writeFileSync(
    COUNTRIES_FILE,
    `
    import { ISOCountryCode, Country } from '~~/types/geography.types'
    
    export const COUNTRIES: { [key in ISOCountryCode]: Country } = ${JSON.stringify(countryVector)}
  `
  )
  console.log(`Finished creating file: ${COUNTRIES_FILE}`)

  writeFileSync(
    REGIONS_FILE,
    `

  export const factbookRegions = ${JSON.stringify([...factbookContinents])} as const 
  export type FactbookRegion = typeof factbookRegions[number]
  `
  )
  console.log(`Finished creating file: ${REGIONS_FILE}`)

  return Promise.resolve({})
}

const normalizeCountry = ({
  data,
  isoCode,
  url,
  briMembership,
}: {
  data: FactbookResponse
  isoCode: string
  url: string
  briMembership: string[]
}): Country => {
  if (!data) {
    throw new ReferenceError('Undefined data passed')
  }

  const names = getNames({ data, isoCode })
  console.log(`Processing: ${names.english}`)

  const flag = readFileSync(`data/static/flags/${isoCode.toLowerCase()}.svg`)

  return {
    url,
    isoCode,
    name: names,
    flag: flag.toString(),
    coordinates: data.Geography['Geographic coordinates']?.text || '',
    region: getRegion({ data, isoCode }),
    membership: getMembership({ briMembership, data, names, isoCode }),
    identity: {
      colors: getNationalColors(data, isoCode, flag.toString()),
    },
    government: {
      leader: getLeader({ data, isoCode }),
    },
    economics: {
      gdpPerCapita: getYearlyIndex<'$'>(data['Economy']['Real GDP per capita'], '$'),
      populationBelowPovertyLine: getTextNode<'%'>(
        data['Economy']['Population below poverty line'],
        '%'
      ),
      militarySpending: getYearlyIndex<'%'>(
        data['Military and Security']?.['Military expenditures'],
        '%'
      ),
      equality: getYearlyIndex<'Gini Coefficient'>(
        data['Economy']['Gini Index coefficient - distribution of family income'],
        'Gini Coefficient'
      ),
    },
    geography: {
      area: {
        land: getTextNode<'km²'>(data['Geography']['Area']['land'], 'km²'),
        water: getTextNode<'km²'>(data['Geography']['Area']['water'], 'km²'),
        total: getTextNode<'km²'>(data['Geography']['Area']['total'], 'km²'),
        forested: getTextNode<'%'>(data['Geography']['Land use']?.forest, '%'),
        arable: getTextNode<'%'>(
          data['Geography']['Land use']?.['agricultural land: arable land'],
          '%'
        ),
      },
      highestPeak: getHighestPeak(data),
      capital: {
        name: getCapital(data, isoCode),
      },
    },
    unemployment: {
      youth: getYearlyIndex<'%'>(data.Economy['Youth unemployment rate (ages 15-24)'], '%'),
      total: getYearlyIndex<'%'>(data.Economy['Unemployment rate'], '%'),
    },
    infrastructure: {
      roads: getTextNode<'km'>(data.Transportation.Roadways?.total, 'km'), // could be interesting to swap to paved?
      rail: getTextNode<'km'>(data.Transportation.Railways?.total, 'km'), // could be interesting to swap to paved?
      electricityAccess: getTextNode<'%'>(
        data.Energy?.['Electricity access']?.['electrification - total population'],
        '%'
      ),
      internetAccess: getTextNode<'%'>(
        data.Communications?.['Internet users']?.['percent of population'],
        '%'
      ),
    },
    gender: {
      womenInParliament: getFemaleParliamentarians(data),
      motherMeanAgeAtBirth: getTextNode<'years'>(
        data['People and Society']["Mother's mean age at first birth"],
        'years'
      ),
    },
    people: {
      obesity: getTextNode<'%'>(data['People and Society']['Obesity - adult prevalence rate'], '%'),
      lifeExpectancy: getTextNode<'years'>(
        data['People and Society']['Life expectancy at birth']?.['total population'],
        'years'
      ),
      medianAge: getTextNode<'years'>(data['People and Society']['Median age']?.total, 'years'),
      childrenPerWoman: getTextNode<'children'>(
        data['People and Society']['Total fertility rate'],
        'children'
      ),
      population: getTextNode<'people'>(data['People and Society'].Population, 'people'),
      populationGrowthRate: getTextNode<'%'>(
        data['People and Society']['Population growth rate'],
        '%'
      ),
    },
    education: {
      literacy: getTextNode(data['People and Society'].Literacy?.['total population'], '%'),
      averageYearsOfStudy: getTextNode<'years'>(
        data['People and Society']['School life expectancy (primary to tertiary education)']?.total,
        'years'
      ),
    },
    health: {
      doctors: getTextNode<'per 1000 people'>(
        data['People and Society']['Physicians density'],
        'per 1000 people'
      ),
      hospitalBeds: getTextNode<'per 1000 people'>(
        data['People and Society']['Hospital bed density'],
        'per 1000 people'
      ),
      accessToContraceptives: getTextNode<'%'>(
        data['People and Society']['Contraceptive prevalence rate'],
        '%'
      ),
      lifeExpectancy: getTextNode<'years'>(
        data['People and Society']['Life expectancy at birth']?.['total population'],
        'years'
      ),
      alcoholConsumption: getTextNode<'liters of pure alcohol'>(
        data['People and Society']['Alcohol consumption per capita']?.total,
        'liters of pure alcohol'
      ),
      tobaccoUse: getTextNode<'%'>(data['People and Society']['Tobacco use']?.total, '%'),
    },
    religion: {
      atheism: getReligion(data).atheism,
      believers: getReligion(data).believers,
    },
    environment: {
      CO2Emissions: getTextNode<'megatons'>(
        data.Environment['Air pollutants']?.['carbon dioxide emissions'],
        'megatons'
      ),
      renewables: getRenewablesProduction(data),
    },
    humanRights: {
      refugees: getRefugees(data, isoCode),
      gayMarriageLegalized: MARRIAGE_RIGHTS[isoCode]
        ? {
            amount: MARRIAGE_RIGHTS[isoCode].yearAllowed,
            unit: 'year',
          }
        : undefined,
    },
  }
}

const getYearlyIndex = <Unit>(
  data: YearlyIndex | undefined,
  unit: Unit
): Amount<Unit> | undefined => {
  if (!isYearlyIndex(data)) return undefined

  const values = Object.values(data)
  if (!values.length) return undefined
  const mostRecent = values.shift()
  if (!mostRecent) return undefined
  const numbers = extractNumbers(mostRecent?.text.replaceAll(',', '') || '')
  if (!numbers.length) return undefined
  const indices = Object.keys(data)
  let year: number | undefined
  if (indices && indices.length) {
    year = extractYears(indices.shift() || '').shift()
  }

  return {
    unit,
    year,
    amount: numbers[0],
  }
}

const getRefugees = (
  data: FactbookResponse,
  isoCode: string
):
  | {
      amount: number
      unit: 'people'
    }
  | undefined => {
  const unparsed =
    data['Transnational Issues']?.['Refugees and internally displaced persons']?.[
      'refugees (country of origin)'
    ]
  if (!unparsed) return undefined

  const withoutDate = removeParentheticals(removeAfterCharacter(unparsed.text, '(as of'))
  const years = extractYears(withoutDate)
  let withoutYears = withoutDate.replaceAll(',', '')
  for (const year of years) {
    withoutYears = withoutYears.replace(year.toString(), '')
  }

  const numbers = extractNumbers(withoutYears)
  if (!numbers.length) return undefined

  return {
    unit: 'people',
    amount: numbers.reduce((a, b) => a + b),
  }
}

const getTextNode = <Unit>(data: TextNode | undefined, unit: Unit): Amount<Unit> | undefined => {
  if (!data) return undefined
  const numbers = extractNumbers(data.text?.replaceAll(',', '') || '')
  if (!numbers.length) return undefined

  return {
    unit,
    amount: numbers[0],
  }
}

const getHighestPeak = (data: FactbookResponse): (Amount<'m'> & { name: string }) | undefined => {
  const highestPeak = getTextNode<'m'>(data['Geography'].Elevation?.['highest point'], 'm')
  if (!highestPeak) return undefined
  const name = (data.Geography.Elevation?.['highest point']?.text || '')
    .match(/^(\D*)/g)
    ?.filter(Boolean)
    ?.shift()

  return {
    ...highestPeak,
    name: name ? removeParentheticals(name).trim() : '',
  }
}

const getFemaleParliamentarians = (data: FactbookResponse): Amount<'%'> | undefined => {
  const results = data.Government['Legislative branch']?.['election results']
  if (!results) return undefined

  let relevantSubstring = ''
  if (results.text.includes('percent of women')) {
    relevantSubstring = results.text.split('percent of women').pop() || ''
  }

  if (results.text.includes('Parliament percent of women')) {
    relevantSubstring = results.text.split('Parliament percent of women').pop() || ''
  }

  const percentages = getPercentages(relevantSubstring)
  if (!percentages.length) return undefined

  const amount = percentages.shift()
  if (!amount) return undefined

  return {
    amount,
    unit: '%',
  }
}

const getCapital = (data: FactbookResponse, isoCode: string) => {
  if (isoCode === 'PS') return 'Jerusalem'
  if (isoCode === 'HK') return 'Hong Kong'
  if (isoCode === 'NR') return 'Yaren' // Technically Nauru has no official capital city, but Yaren is the defacto capital

  // Steps to normalize name
  const baseName = removeParentheticals(data.Government.Capital.name.text)
  const stripSemicolons = removeAfterCharacter(baseName, ';')
  const stripLocalizedTranslations = removeAfterCharacter(stripSemicolons, ' in ')

  return stripLocalizedTranslations
}

const getReligion = (
  data: FactbookResponse
): { atheism?: Amount<'%'>; believers?: Amount<'%'> } => {
  const output: ReturnType<typeof getReligion> = {}
  const { Religions: religions } = data['People and Society']
  if (!religions || !religions.text) return output

  if (!religions.text.includes('none')) {
    return output
  }

  const split = religions.text.split('none').pop()
  if (!split) return output

  const atheists = getPercentages(split).shift()
  if (!atheists) return output

  return {
    atheism: {
      amount: atheists,
      unit: '%',
    },
    believers: {
      amount: 100 - atheists,
      unit: '%',
    },
  }
}

createCountriesFile()

const removeParentheticals = (string: string): string => string.replaceAll(/\([^()]*\)/g, '')

const getRenewablesProduction = (data: FactbookResponse): Amount<'%'> | undefined => {
  const sources = data['Energy']?.['Electricity generation sources']
  if (!sources) return undefined

  const renewableSources = [
    'solar',
    'wind',
    'hydroelectricity',
    'tide and wave',
    'geothermal',
    'biomass and waste',
  ] as const

  let renewablePercentage: number | undefined = undefined
  for (const source of renewableSources) {
    if (!Reflect.has(sources, source)) continue
    if (renewablePercentage === undefined) {
      renewablePercentage = 0
    }

    const parsed = getTextNode<'%'>(sources[source], '%')
    if (!parsed) continue

    renewablePercentage += parsed.amount
  }

  if (renewablePercentage === undefined) {
    return undefined
  }

  return {
    unit: '%',
    amount: Math.round(renewablePercentage),
  }
}

export const getNames = ({
  data,
  isoCode,
}: {
  data: FactbookResponse
  isoCode: string
}): Country['name'] => {
  const output = { local: '', english: '' }
  if (!Reflect.has(data, 'Government')) return output
  const unparsedNames = data.Government['Country name']

  output.english = unparsedNames['conventional short form'].text
  if (!output.english || output.english === 'none') {
    output.english =
      unparsedNames['conventional long form'].text ||
      unparsedNames['local short form']?.text ||
      unparsedNames['local long form']?.text ||
      ''
  }

  output.local = unparsedNames['local short form']?.text || ''
  if (!output.local || output.local === 'none') {
    output.local =
      unparsedNames['local long form']?.text ||
      unparsedNames['conventional short form']?.text ||
      unparsedNames['conventional long form'].text ||
      ''
  }

  switch (isoCode) {
    case 'PS':
      output.english = 'Palestine'
      output.local = 'فلسطين'
      break
    case 'DO':
      output.english = 'The Dominican Republic'
      break
    case 'CD':
      output.english = 'Democratic Republic of the Congo'
      break
  }

  return {
    local: removeAfterCharacter(removeParentheticals(output.local), ';'),
    english: removeAfterCharacter(removeParentheticals(output.english), ';'),
  }
}

const getNationalColors = (data: FactbookResponse, isoCode: string, flag: string): string[] => {
  const colors: Set<string> = new Set([])
  if (!flag.includes('fill')) {
    return []
  }

  const matches = new Set(flag.match(/#(?:[0-9a-fA-F]{3}){1,2}/g))

  return [...matches]
}

const getMembership = ({
  names,
  data,
  isoCode,
  briMembership,
}: {
  isoCode: string
  briMembership: string[]
  data: FactbookResponse
  names: Country['name']
}): Organization[] => {
  const output: Organization[] = []
  if (briMembership.includes(names.english.toLowerCase()) || ['CN'].includes(isoCode)) {
    output.push({
      _type: 'organization',
      id: 'bri',
      name: OrganizationVector['bri'],
      continent: ['asia', 'europe', 'south-america', 'africa'],
    })
  }

  const participation = data.Government['International organization participation']
  if (!participation) return output

  for (const organization of participation.text.split(',').map(org => org.toLowerCase().trim())) {
    if (isOrganizationKey(organization)) {
      output.push({
        continent: [],
        _type: 'organization',
        id: organization,
        name: OrganizationVector[organization],
      })
    }
  }

  return output
}

const getRegion = ({ data }: { isoCode: string; data: FactbookResponse }): Region => {
  let continent = data['Geography']['Map references'].text as FactbookRegion

  switch (continent) {
    case 'AsiaEurope':
      return 'asia'
    case 'Central America and the Caribbean':
      return 'north-america'
    case 'Southeast Asia':
      return 'asia'
    case 'Arctic Region':
      return 'europe'
    case '<p><strong>metropolitan France:</strong> Europe; </p><p><strong>French Guiana:</strong> South America; </p><p><strong>Guadeloupe:</strong> Central America and the Caribbean; </p><p><strong>Martinique:</strong> Central America and the Caribbean; </p><p><strong>Mayotte:</strong> Africa; </p><p><strong>Reunion:</strong> World</p>':
      return 'europe'
    default: {
      const parsed = continent.toLowerCase().replaceAll(' ', '-')
      if (isValidContinent(parsed)) {
        return parsed
      } else {
        console.error(`Invalid continent found: ${parsed}`)
      }
    }
  }

  return continent as Region
}

const getLeader = ({
  data,
  isoCode,
}: {
  data: FactbookResponse
  isoCode: string
}): string | undefined => {
  if (!data.Government['Executive branch']) return undefined

  const chiefOfState =
    removeParentheticals(data.Government['Executive branch']['chief of state']?.text || '')
      .toLowerCase()
      .split(';')
      .shift() || ''

  const headOfGovernment =
    removeParentheticals(data.Government['Executive branch']['head of government']?.text || '')
      .toLowerCase()
      .split(';')
      .shift() || ''

  const parties = data.Government['Political parties and leaders']?.text || ''
  const election = data.Government['Executive branch']['election results']?.text || ''
  const cabinet = data.Government['Executive branch']['cabinet']?.text || ''

  if (!chiefOfState && !headOfGovernment) return undefined

  let leader = chiefOfState || headOfGovernment

  const removeTitles = (name: string) => {
    const titles = ['president', 'chancellor', 'king', 'queen', 'prime minister']
    for (const title of titles) {
      name = name.toLowerCase().replace(title, '')
    }

    return name.trim()
  }

  const headOfGovernmentLed: Array<ISOCountryCode | string> = [
    'AL',
    'AD',
    'AG',
    'AM',
    'AU',
    'AT',
    'BS',
    'BD',
    'BB',
    'BE',
    'BZ',
    'BT',
    'BG',
    'KH',
    'CA',
    'HR',
    'CZ',
    'DK',
    'DM',
    'TL',
    'EE',
    'ET',
    'FJ',
    'FI',
    'GE',
    'DE',
    'GR',
    'GD',
    'HU',
    'IS',
    'IN',
    'IQ',
    'IE',
    'IL',
    'IT',
    'JM',
    'JP',
    'LV',
    'LB',
    'LS',
    'LY',
    'LU',
    'LI',
    'MY',
    'MT',
    'MU',
    'MD',
    'MN',
    'ME',
    'NP',
    'NL',
    'NZ',
    'MK',
    'NO',
    'PK',
    'PG',
    'PL',
    'RO',
    'KN',
    'LC',
    'RS',
    'SG',
    'SI',
    'SL',
    'SB',
    'ES',
    'SE',
    'TH',
    'TV',
    'GB',
    'VU',
  ]

  switch (true) {
    case headOfGovernmentLed.includes(isoCode):
      leader = headOfGovernment
      break
    case chiefOfState.includes('king'):
    case chiefOfState.includes('queen'):
      leader = headOfGovernment
      break
    case headOfGovernment.includes('chancellor'):
      leader = headOfGovernment
      break
    case parties.toLowerCase().includes(removeTitles(chiefOfState)):
      leader = chiefOfState
      break
    case parties.toLowerCase().includes(removeTitles(headOfGovernment)):
      leader = headOfGovernment
      break
    case election.toLowerCase().includes(removeTitles(chiefOfState)):
      leader = chiefOfState
      break
    case election.toLowerCase().includes(removeTitles(headOfGovernment)):
      leader = headOfGovernment
      break
    case (cabinet.toLowerCase().split(',').shift() || '').includes('prime minister'):
      leader = headOfGovernment
      break
    case (cabinet.toLowerCase().split(',').shift() || '').includes('president'):
      leader = chiefOfState
      break
  }

  return leader.trim()
}
