import { countries, languages } from 'countries-list'
import { readFileSync, writeFileSync } from 'fs'
import { decode } from 'he'
import { conflictMapping } from '~~/data/conflicts.gen'
import { worldBankMapping } from '~~/data/worldbank.gen'
import { owidMapping } from '~~/data/owid.gen'
import { MARRIAGE_RIGHTS } from '~~/data/static/marriage-rights'
import { MEMBERSHIP_CORRECTIONS } from '~~/data/static/membership-corrections'
import { fetchBeltAndRoadIniativeParticipants } from '~~/lib/generators/vendors/wikipedia'
import { simplifiedPalette } from '~~/lib/palette'
import {
  extractNumbers,
  extractParentheticals,
  extractYears,
  getPercentages,
  removeAfterCharacter,
} from '~~/lib/strings'
import {
  type Amount,
  type Region,
  type Country,
  isValidContinent,
  type ISOCountryCode,
} from '~~/types/geography.types'
import {
  isOrganizationKey,
  type Organization,
  organizationRegions,
  OrganizationVector,
} from '~~/types/organization.type'
import {
  type FactbookResponse,
  isYearlyIndex,
  type TextNode,
  type YearlyIndex,
} from '~~/types/response.type'
import type { FactbookRegion } from '~~/types/vendor/factbook/factbook-types.gen'
import { successfulCombinations } from './link-mapping.gen'

const ISO_CODE_FILE = `data/iso-codes.gen.ts`
const COUNTRIES_FILE = `data/countries.gen.ts`
const REGIONS_FILE = `types/vendor/factbook/factbook-types.gen.ts`

/**
 * Factbook text contains HTML entities (e.g. C&ocirc;te d'Ivoire) which break
 * downstream parsing such as truncating on semicolons. Decode every string in
 * the response before any processing.
 */
const decodeHtmlEntitiesDeep = <T>(value: T): T => {
  if (typeof value === 'string') return decode(value) as T
  if (Array.isArray(value)) return value.map(decodeHtmlEntitiesDeep) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, decodeHtmlEntitiesDeep(entry)])
    ) as T
  }
  return value
}

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
      const data: FactbookResponse = decodeHtmlEntitiesDeep(await response.json())
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
    import type { ISOCountryCode, Country } from '~~/types/geography.types'
    
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
    name: names,
    flag: flag.toString(),
    isoCode: isoCode as ISOCountryCode,
    coordinates: data.Geography['Geographic coordinates']?.text || '',
    region: getRegion({ data, isoCode }),
    membership: getMembership({ briMembership, data, names, isoCode }),
    languages: getLanguages({ data, isoCode }),
    currency: getCurrency({ isoCode }),
    identity: (() => {
      const colors = getNationalColors(data, isoCode, flag.toString())
      return { colors, simplifiedColors: simplifiedPalette(colors) }
    })(),
    government: {
      leader: getLeader({ data, isoCode, names }),
      amountOfMilitaryConflicts: (() => {
        const conflicts = conflictMapping[isoCode as unknown as ISOCountryCode]?.conflicts
        return conflicts == null ? undefined : { amount: conflicts, unit: 'conflicts' }
      })(),
      // Governance indices from Our World in Data (V-Dem, Transparency Intl).
      democracyIndex: owidAmount(isoCode, 'democracyIndex', 'index'),
      corruptionIndex: owidAmount(isoCode, 'corruptionIndex', 'score'),
      // Wellbeing/development indices, also from Our World in Data.
      humanDevelopmentIndex: owidAmount(isoCode, 'humanDevelopmentIndex', 'index'),
      happiness: owidAmount(isoCode, 'happiness', 'score'),
    },
    economics: {
      inflation: getYearlyIndex<'%'>(data.Economy['Inflation rate (consumer prices)'], '%'),
      gdpPerCapita: getYearlyIndex<'$'>(data['Economy']['Real GDP per capita'], '$'),
      gdpTotal: getGdpTotal(data),
      gdpGrowth: getYearlyIndex<'%'>(data['Economy']['Real GDP growth rate'], '%'),
      publicDebt: getYearlyIndex<'%'>(data['Economy']['Public debt'], '%'),
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
        // Factbook ships this key with a trailing space ("total "); the clean
        // key no longer exists, so read the drifted one and fall back.
        total: getTextNode<'km²'>(
          data['Geography']['Area']['total '] ?? data['Geography']['Area']['total'],
          'km²'
        ),
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
      // Factbook dropped Roadways entirely; only Railways survives.
      rail: getTextNode<'km'>(data.Transportation.Railways?.total, 'km'),
      internetAccess: getTextNode<'%'>(
        data.Communications?.['Internet users']?.['percent of population'],
        '%'
      ),
      mobileSubscriptions: getTextNode<'per 100 people'>(
        data.Communications?.['Telephones - mobile cellular']?.['subscriptions per 100 inhabitants'],
        'per 100 people'
      ),
      // Factbook flattened Airports to a bare text node; fall back to the old
      // '{ total }' shape for any country still on the previous schema.
      airports: getTextNode<'airports'>(
        data.Transportation.Airports?.total ?? data.Transportation.Airports,
        'airports'
      ),
    },
    energy: {
      electricityAccess: getTextNode<'%'>(
        data.Energy?.['Electricity access']?.['electrification - total population'],
        '%'
      ),
      fossilFuels: getTextNode<'%'>(
        data.Energy?.['Electricity generation sources']?.['fossil fuels'],
        '%'
      ),
    },
    gender: {
      // Factbook dropped its women-in-parliament data; sourced from the World
      // Bank (SG.GEN.PARL.ZS) instead — fresher and broader coverage.
      womenInParliament: worldBankAmount(isoCode, 'womenInParliament', '%'),
      motherMeanAgeAtBirth: getTextNode<'years'>(
        data['People and Society']["Mother's mean age at first birth"],
        'years'
      ),
    },
    people: {
      lifeExpectancy: getTextNode<'years'>(
        data['People and Society']['Life expectancy at birth']?.['total population'],
        'years'
      ),
      medianAge: getTextNode<'years'>(data['People and Society']['Median age']?.total, 'years'),
      childrenPerWoman: getTextNode<'children'>(
        data['People and Society']['Total fertility rate'],
        'children'
      ),
      // Factbook nests the headline figure under Population.total; the bare
      // Population node has no .text of its own (it drifted from a flat node).
      population: getTextNode<'people'>(data['People and Society'].Population?.total, 'people'),
      populationGrowthRate: getTextNode<'%'>(
        data['People and Society']['Population growth rate'],
        '%'
      ),
      netMigration: getTextNode<'per 1000 people'>(
        data['People and Society']['Net migration rate'],
        'per 1000 people'
      ),
      birthRate: getTextNode<'per 1000 people'>(
        data['People and Society']['Birth rate'],
        'per 1000 people'
      ),
      urbanization: getTextNode<'%'>(
        data['People and Society'].Urbanization?.['urban population'],
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
      obesity: getTextNode<'%'>(data['People and Society']['Obesity - adult prevalence rate'], '%'),
      // Factbook renamed 'Physicians density' to 'Physician density'.
      doctors: getTextNode<'per 1000 people'>(
        data['People and Society']['Physician density'] ??
          data['People and Society']['Physicians density'],
        'per 1000 people'
      ),
      hospitalBeds: getTextNode<'per 1000 people'>(
        data['People and Society']['Hospital bed density'],
        'per 1000 people'
      ),
      // Factbook dropped contraceptive prevalence; sourced from the World Bank
      // (SP.DYN.CONU.ZS). Recency varies by country but coverage is broad.
      accessToContraceptives:
        worldBankAmount(isoCode, 'contraceptivePrevalence', '%') ??
        getTextNode<'%'>(data['People and Society']['Contraceptive prevalence rate'], '%'),
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
      // Factbook moved CO2 from 'Air pollutants' to its own section and now
      // reports "<n> billion|million metric tonnes"; normalize to megatons.
      CO2Emissions:
        getCarbonDioxideEmissions(data) ??
        getTextNode<'megatons'>(
          data.Environment['Air pollutants']?.['carbon dioxide emissions'],
          'megatons'
        ),
      methaneEmissions:
        getMethaneEmissions(data) ??
        getTextNode<'megatons'>(
          data.Environment['Air pollutants']?.['methane emissions'],
          'megatons'
        ),
      renewables: getRenewablesProduction(data),
      parisAgreement: isParisAgreementParty(data),
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
    const mostRecentKey = indices.shift() || ''
    year = extractYears(mostRecentKey).shift()
  }

  return {
    unit,
    year,
    amount: numbers[0],
  }
}

const getRefugees = (
  data: FactbookResponse,
  _isoCode: string
):
  | {
      amount: number
      unit: 'people'
    }
  | undefined => {
  // Factbook renamed 'refugees (country of origin)' to 'refugees' AND flipped
  // its meaning to refugees *hosted* (country of asylum): Syria now reads 16k,
  // not its ~6M origin figure. The challenge copy reflects the hosted sense.
  const unparsed =
    data['Transnational Issues']?.['Refugees and internally displaced persons']?.refugees
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
  if (!data || !data.text) return undefined
  const numbers = extractNumbers(data.text.replaceAll(',', '') || '')
  if (!numbers.length) return undefined
  let year: number | undefined = undefined
  const parentheticalValues = extractParentheticals(data.text)
  if (parentheticalValues.length) {
    year = extractYears(parentheticalValues.join()).shift()
  }

  return {
    unit,
    year,
    amount: numbers[0],
  }
}

const getHighestPeak = (data: FactbookResponse): (Amount<'m'> & { name: string }) | undefined => {
  const text = data.Geography.Elevation?.['highest point']?.text
  if (!text) return undefined

  // Factbook highest-point strings are "<name> <elevation> m", where the name
  // can itself contain digits ("K2", "8th tee, golf course, ...") and an
  // explanatory parenthetical may trail the measurement ("... 6,190 m (highest
  // point in North America)"). Parsing the first number as the elevation (and
  // the leading non-digit run as the name) mangled both cases — K2 became "K"
  // at 2 m; the Maldives became "" at 8 m. So strip parentheticals first, then
  // take the *trailing* "<number> m" as the elevation and everything before it
  // as the name.
  const cleaned = removeParentheticals(text)
  const match = cleaned.match(/^(.*?)\s*([\d,.]+)\s*m$/)
  if (!match) return undefined

  const amount = Number(match[2].replaceAll(',', ''))
  if (Number.isNaN(amount)) return undefined

  return {
    unit: 'm',
    amount,
    name: match[1].trim(),
  }
}

/** Pull a World Bank metric for a country and wrap it as an Amount. */
const worldBankAmount = <Unit>(
  isoCode: string,
  metric: 'womenInParliament' | 'contraceptivePrevalence',
  unit: Unit
): Amount<Unit> | undefined => {
  const value = worldBankMapping[isoCode as ISOCountryCode]?.[metric]
  if (!value) return undefined
  return {
    unit,
    year: value.year,
    amount: Math.round(value.amount * 10) / 10,
  }
}

/** Pull a governance index for a country and wrap it as an Amount. */
const owidAmount = <Unit>(
  isoCode: string,
  metric: 'democracyIndex' | 'corruptionIndex' | 'humanDevelopmentIndex' | 'happiness',
  unit: Unit
): Amount<Unit> | undefined => {
  const value = owidMapping[isoCode as ISOCountryCode]?.[metric]
  if (!value) return undefined
  return { unit, year: value.year, amount: value.amount }
}

/** Whether a country is party to the Paris Agreement (Factbook treaty list). */
const isParisAgreementParty = (data: FactbookResponse): boolean => {
  const agreements =
    data.Environment['International environmental agreements']?.['party to']?.text ??
    data.Environment['Environment - international agreements']?.['party to']?.text ??
    ''
  return /Climate Change-Paris Agreement/i.test(agreements)
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

const removeParentheticals = (string: string): string =>
  string
    .replaceAll(/\([^()]*\)/g, '')
    .replace(/\s+([,;])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()

const getCarbonDioxideEmissions = (data: FactbookResponse): Amount<'megatons'> | undefined => {
  const text = data.Environment['Carbon dioxide emissions']?.['total emissions']?.text
  if (!text) return undefined

  const numbers = extractNumbers(text.replaceAll(',', ''))
  if (!numbers.length) return undefined

  // "4.795 billion metric tonnes" -> 4795 Mt; "1.645 million metric tonnes" -> 1.645 Mt
  const scale = /billion/i.test(text) ? 1000 : /million/i.test(text) ? 1 : 1
  const year = extractYears(text).pop()

  return {
    unit: 'megatons',
    year,
    amount: Math.round(numbers[0] * scale * 1000) / 1000,
  }
}

const getGdpTotal = (data: FactbookResponse): Amount<'$'> | undefined => {
  // GDP-PPP is a year-keyed index whose values read "$25.676 trillion (2024
  // est.)". getYearlyIndex would keep the bare 25.676 and drop the magnitude
  // word, storing trillions-as-dollars (inconsistent with gdpPerCapita's raw $).
  // Take the most recent year's text and scale the word to full dollars.
  const node = data['Economy']['Real GDP (purchasing power parity)']
  if (!isYearlyIndex(node)) return undefined

  // Year-keyed entries only ('note' is a bare string, not a TextNode); pick the
  // one whose key carries the newest year.
  let bestText: string | undefined
  let bestYear = -Infinity
  for (const [key, value] of Object.entries(node)) {
    if (!value || typeof value !== 'object' || !('text' in value)) continue
    const year = extractYears(key).pop() ?? extractYears(value.text).pop() ?? -Infinity
    if (year > bestYear) {
      bestYear = year
      bestText = value.text
    }
  }
  if (!bestText) return undefined

  const numbers = extractNumbers(bestText.replaceAll(',', ''))
  if (!numbers.length) return undefined

  const scale = /trillion/i.test(bestText)
    ? 1e12
    : /billion/i.test(bestText)
      ? 1e9
      : /million/i.test(bestText)
        ? 1e6
        : 1
  return {
    unit: '$',
    year: bestYear === -Infinity ? undefined : bestYear,
    amount: Math.round(numbers[0] * scale),
  }
}

const getMethaneEmissions = (data: FactbookResponse): Amount<'megatons'> | undefined => {
  // Factbook moved methane out of 'Air pollutants' into its own section, broken
  // out by source in kilotonnes ("20,500.6 kt") with no single total. Sum the
  // sources and convert kt -> megatons (1 Mt = 1000 kt) to match CO2's unit.
  const sources = data.Environment['Methane emissions']
  if (!sources) return undefined

  let kilotonnes: number | undefined = undefined
  let year: number | undefined = undefined
  for (const key of ['energy', 'agriculture', 'waste', 'other'] as const) {
    const text = sources[key]?.text
    if (!text) continue
    const numbers = extractNumbers(text.replaceAll(',', ''))
    if (!numbers.length) continue
    kilotonnes = (kilotonnes ?? 0) + numbers[0]
    year = year ?? extractYears(text).pop()
  }

  if (kilotonnes === undefined) return undefined

  return {
    unit: 'megatons',
    year,
    amount: Math.round((kilotonnes / 1000) * 1000) / 1000,
  }
}

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
      regions: ['asia', 'europe', 'south-america', 'africa'],
    })
  }

  const participation = data.Government['International organization participation']
  if (participation) {
    for (const organization of participation.text.split(',').map(org => org.toLowerCase().trim())) {
      if (isOrganizationKey(organization)) {
        output.push({
          _type: 'organization',
          id: organization,
          name: OrganizationVector[organization],
          regions: organizationRegions[organization],
        })
      }
    }
  }

  // Apply hand-maintained corrections for stale/loose Factbook memberships.
  const correction = MEMBERSHIP_CORRECTIONS[isoCode]
  if (correction) {
    const removed = new Set(correction.remove ?? [])
    const corrected = output.filter(org => !removed.has(org.id))
    for (const id of correction.add ?? []) {
      if (!corrected.some(org => org.id === id)) {
        corrected.push({
          _type: 'organization',
          id,
          name: OrganizationVector[id],
          regions: organizationRegions[id],
        })
      }
    }
    return corrected
  }

  return output
}

const getRegion = ({ data }: { isoCode: string; data: FactbookResponse }): Region => {
  const continent = data['Geography']['Map references'].text as FactbookRegion

  // France lists every overseas territory; its metropolitan region is Europe.
  // Match on content rather than the exact markup, which changes between releases.
  if (continent.includes('metropolitan France:')) return 'europe'

  switch (continent) {
    case 'AsiaEurope':
      return 'asia'
    case 'Central America and the Caribbean':
      return 'north-america'
    case 'Southeast Asia':
      return 'asia'
    case 'Arctic Region':
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
  names,
}: {
  data: FactbookResponse
  isoCode: string
  names: Country['name']
}): string | undefined => {
  if (!data.Government['Executive branch']) return undefined

  // Keep the source casing (accents, hyphenated surnames) — the matching logic
  // below lowercases as needed, but the returned name is built from these.
  const chiefOfStateRaw =
    removeParentheticals(data.Government['Executive branch']['chief of state']?.text || '')
      .split(';')
      .shift() || ''
  const headOfGovernmentRaw =
    removeParentheticals(data.Government['Executive branch']['head of government']?.text || '')
      .split(';')
      .shift() || ''
  const chiefOfState = chiefOfStateRaw.toLowerCase()
  const headOfGovernment = headOfGovernmentRaw.toLowerCase()

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
    'TO',
    'TT',
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

  // The Factbook string is "<title phrase> <Person Name>". Titles vary far
  // beyond the five words removeTitles() knows (Spain: "President of the
  // Government of Spain ...", Luxembourg: "Grand Duke ...", Oman: "Sultan
  // ..."), and the phrase often embeds the COUNTRY NAME — which would give the
  // answer away in the "Who leads X?" round. Strip any leading run of
  // title/connective words plus the country name, keeping only the person.
  const stripLeadingTitle = (raw: string): string => {
    const countryWords = new Set(
      names.english
        .toLowerCase()
        .split(/[\s-]+/)
        .filter(Boolean)
    )
    const titleWords = new Set([
      'president',
      'premier',
      'vice',
      'prime',
      'minister',
      'chief',
      'chancellor',
      'chair',
      'chairman',
      'chairperson',
      'confederation',
      'king',
      'queen',
      'emperor',
      'emir',
      'sultan',
      'grand',
      'duke',
      'duchess',
      'crown',
      'prince',
      'princess',
      'supreme',
      'leader',
      'head',
      'state',
      'government',
      'council',
      'sovereign',
      'federal',
      'captain',
      'captains',
      'regent',
      'co-prince',
      'commander',
      'commander-in-chief',
      'general',
      'armed',
      'forces',
      'of',
      'the',
      'and',
    ])
    // Also strip the country's demonym adjective ("Sudanese" for Sudan) by
    // matching any word that shares the country name's first four letters, plus
    // a few irregular demonyms that don't share a stem with the country name.
    const IRREGULAR_DEMONYMS = new Set(['swiss'])
    const stem = (names.english.toLowerCase().match(/[a-z]{4,}/) ?? [''])[0]
    const isCountryish = (word: string) => {
      const w = word.toLowerCase()
      if (countryWords.has(w) || IRREGULAR_DEMONYMS.has(w)) return true
      return stem.length >= 4 && w.startsWith(stem)
    }
    const words = raw.split(/\s+/).filter(Boolean)
    let start = 0
    while (
      start < words.length &&
      (titleWords.has(words[start].toLowerCase()) || isCountryish(words[start]))
    ) {
      start++
    }
    // Everything was a title (e.g. Haiti's collective "Transitional Presidential
    // Council") — no nameable person, so signal "no leader" with empty string.
    return start >= words.length ? '' : words.slice(start).join(' ')
  }

  // The Factbook writes surnames in ALL CAPS ("Pedro SÁNCHEZ PÉREZ-CASTEJÓN").
  // Normalize each word to Title Case, but leave already-mixed-case tokens
  // ("J.", "McDonald"), roman numerals ("III"), and short particles alone.
  const ROMAN = /^[IVXLCDM]+\.?$/i
  const titleCaseWord = (word: string): string => {
    if (!word) return word
    if (ROMAN.test(word)) return word.toUpperCase()
    const isUniformCase = word === word.toLowerCase() || word === word.toUpperCase()
    if (!isUniformCase) return word // preserve intentional casing like "J." or "McX"
    // Title-case across hyphens so "pérez-castejón" -> "Pérez-Castejón".
    return word
      .toLowerCase()
      .split('-')
      .map(part => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
      .join('-')
  }

  // Map the (lowercased) selected leader back to its original-case source.
  const original = leader === chiefOfState ? chiefOfStateRaw : headOfGovernmentRaw

  const person = stripLeadingTitle(original)
    .split(' ')
    .map(titleCaseWord)
    .join(' ')
    .trim()

  // No nameable individual (collective leadership) — omit rather than show a
  // bare title, which would make the leader-pick round unanswerable.
  return person || undefined
}

const getLanguages = ({ isoCode }: { data: FactbookResponse; isoCode: string }): string[] => {
  if (Reflect.has(countries, isoCode)) {
    const country = countries[isoCode as keyof typeof countries]

    return country.languages.map(languageCode => {
      return Reflect.get(languages, languageCode).name
    })
  }

  return []
}

const getCurrency = ({ isoCode }: { isoCode: string }): string | undefined => {
  if (!Reflect.has(countries, isoCode)) return undefined

  const country = countries[isoCode as keyof typeof countries]
  if (Array.isArray(country.currency)) return country.currency[0]

  return country.currency
}
