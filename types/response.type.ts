export type TextNode = {
  text: string
}
export type YearlyIndex = { [annualKey: string]: TextNode } // Tricky
export type FactbookResponse = {
  Introduction?: {
    Background?: TextNode
  }
  Geography: {
    Location: TextNode
    'Geographic coordinates': TextNode
    'Map references': TextNode
    Area: {
      total: TextNode
      land: TextNode
      water: TextNode
    }
    'Area - comparative'?: TextNode
    'Land boundaries'?: {
      total?: TextNode
      'border countries': TextNode
    }
    Coastline?: TextNode
    'Maritime claims'?: {
      'territorial sea'?: TextNode
      'exclusive economic zone'?: TextNode
      'continental shelf'?: TextNode
    }
    Climate?: TextNode
    Terrain?: TextNode
    Elevation?: {
      'highest point'?: TextNode
      'lowest point'?: TextNode
      'mean elevation'?: TextNode
    }
    'Natural resources'?: TextNode
    'Land use'?: {
      'agricultural land'?: TextNode
      'agricultural land: arable land'?: TextNode
      'agricultural land: permanent crops'?: TextNode
      'agricultural land: permanent pasture'?: TextNode
      forest?: TextNode
      other?: TextNode
    }
    'Irrigated land'?: TextNode
    'Major lakes (area sq km)'?: {
      'salt water lake(s)'?: TextNode
      'fresh water lake(s)'?: TextNode
    }
    'Major rivers (by length in km)'?: TextNode
    'Major watersheds (area sq km)'?: TextNode
    'Population distribution'?: TextNode
    'Natural hazards'?: TextNode
    'Geography - note'?: TextNode
  }
  'People and Society': {
    Population?: TextNode
    Nationality?: {
      noun: TextNode
      adjective: TextNode
    }
    'Ethnic groups'?: TextNode & {
      note?: string
    }
    Languages?: {
      Languages?: TextNode
      'major-language sample(s)'?: TextNode
    }
    Religions?: TextNode // interesting
    'Age structure'?: {
      '0-14 years': TextNode
      '15-24 years': TextNode
      '25-54 years': TextNode
      '55-64 years': TextNode
      '65 years and over': TextNode
    }
    'Dependency ratios'?: {
      'total dependency ratio'?: TextNode
      'youth dependency ratio'?: TextNode
      'potential support ratio'?: TextNode
      'elderly dependency ratio'?: TextNode
    }
    'Median age'?: {
      total: TextNode
      male?: TextNode
      female?: TextNode
    }
    'Population growth rate'?: TextNode
    'Birth rate'?: TextNode
    'Death rate'?: TextNode
    'Net migration rate'?: TextNode
    'Population distribution'?: TextNode
    Urbanization?: {
      'urban population'?: TextNode
      'rate of urbanization'?: TextNode
    }
    'Major urban areas - population'?: TextNode
    'Sex ratio'?: {
      'at birth'?: TextNode
      '0-14 years'?: TextNode
      '15-24 years'?: TextNode
      '25-54 years'?: TextNode
      '55-64 years'?: TextNode
      '65 years and over'?: TextNode
      'total population'?: TextNode
    }
    "Mother's mean age at first birth"?: TextNode
    'Maternal mortality ratio'?: TextNode
    'Infant mortality rate'?: {
      male?: TextNode
      female?: TextNode
    }
    'Life expectancy at birth'?: {
      'total population'?: TextNode
      male?: TextNode
      female?: TextNode
    }
    'Total fertility rate'?: TextNode
    'Contraceptive prevalence rate'?: TextNode
    'Drinking water source'?: {
      'improved: urban'?: TextNode
      'improved: rural'?: TextNode
      'improved: total'?: TextNode
      'unimproved: urban'?: TextNode
      'unimproved: rural'?: TextNode
      'unimproved: total'?: TextNode
    }
    'Current health expenditure'?: TextNode
    'Physicians density'?: TextNode
    'Hospital bed density'?: TextNode
    'Sanitation facility access'?: {
      'improved: urban'?: TextNode
      'improved: rural'?: TextNode
      'improved: total'?: TextNode
      'unimproved: urban'?: TextNode
      'unimproved: rural'?: TextNode
      'unimproved: total'?: TextNode
    }
    'Obesity - adult prevalence rate'?: TextNode
    'HIV/AIDS - adult prevalence rate'?: TextNode
    'Alcohol consumption per capita'?: {
      total?: TextNode
      beer?: TextNode
      wine?: TextNode
      spirits?: TextNode
      'other alcohols'?: TextNode
    }
    'Tobacco use'?: {
      total?: TextNode
      male?: TextNode
      female?: TextNode
    }
    'Children under the age of 5 years underweight'?: TextNode
    'Education expenditures': TextNode
    Literacy?: {
      'total population'?: TextNode
      male?: TextNode
      female?: TextNode
    }
    'School life expectancy (primary to tertiary education)'?: {
      total: TextNode
      male: TextNode
      female: TextNode
    }
    'Youth unemployment rate (ages 15-24)'?: {
      total: TextNode
      male: TextNode
      female: TextNode
    }
  }
  Environment: {
    'Environment - current issues'?: TextNode
    'Environment - international agreements'?: {
      'party to'?: TextNode
      'signed, but not ratified'?: TextNode
    }
    'Air pollutants'?: {
      'particulate matter emissions'?: TextNode
      'carbon dioxide emissions'?: TextNode
      'methane emissions'?: TextNode
    }
    Climate?: TextNode
    'Land use'?: {
      'agricultural land'?: TextNode
      'agricultural land: arable land'?: TextNode
      'agricultural land: permanent crops'?: TextNode
      'agricultural land: permanent pasture'?: TextNode
      forest?: TextNode
      other?: TextNode
    }
    Urbanization?: {
      'urban population'?: TextNode
      'rate of urbanization'?: TextNode
    }
    'Revenue from forest resources'?: {
      'forest revenues'?: TextNode
    }
    'Revenue from coal'?: {
      'coal revenues': TextNode
    }
    'Waste and recycling'?: {
      'municipal solid waste generated annually'?: TextNode
      'municipal solid waste recycled annually'?: TextNode
      'percent of municipal solid waste recycled'?: TextNode
    }
    'Major lakes (area sq km)'?: {
      'fresh water lake(s)'?: TextNode
      'salt water lake(s)'?: TextNode
    }
    'Major rivers (by length in km)'?: TextNode
    'Major watersheds (area sq km)'?: TextNode
    'Total water withdrawal'?: {
      municipal?: TextNode
      industrial?: TextNode
      agricultural?: TextNode
    }
    'Total renewable water resources'?: TextNode
  }
  Government: {
    'Country name': {
      'conventional long form': TextNode
      'conventional short form': TextNode
      'local long form'?: TextNode
      'local short form'?: TextNode
      former?: TextNode
      etymology?: TextNode
    }
    'Dependency status'?: TextNode
    'Government type'?: TextNode
    Capital: {
      name: TextNode
      'geographic coordinates': TextNode
      'time difference': TextNode
      'daylight saving time'?: TextNode
      etymology?: TextNode
    }
    'Administrative divisions'?: TextNode
    Independence?: TextNode
    'National holiday'?: TextNode
    Constitution?: {
      history: TextNode
      amendments?: TextNode
    }
    'Legal system'?: TextNode
    'International law organization participation'?: TextNode
    Citizenship?: {
      'citizenship by birth': TextNode
      'citizenship by descent only'?: TextNode
      'dual citizenship recognized'?: TextNode
      'residency requirement for naturalization'?: TextNode
    }
    Suffrage?: TextNode
    'Executive branch'?: {
      'chief of state'?: TextNode
      'head of government'?: TextNode
      cabinet?: TextNode
      'elections/appointments'?: TextNode
      'election results'?: TextNode
    }
    'Legislative branch'?: {
      description: TextNode
      elections: TextNode
      'election results': TextNode
    }
    'Judicial branch'?: {
      'highest court(s)'?: TextNode
      'judge selection and term of office'?: TextNode
      'subordinate courts'?: TextNode
    }
    'Political parties and leaders'?: TextNode
    'International organization participation'?: TextNode
    'Flag description'?: TextNode
    'National symbol(s)'?: TextNode
    'National anthem'?: {
      name?: TextNode
      'lyrics/music'?: TextNode
    }
    'National heritage'?: {
      'total World Heritage Sites'?: TextNode
      'selected World Heritage Site locales'?: TextNode
    }
  }
  Economy: {
    'Economic overview'?: TextNode
    'Real GDP (purchasing power parity)'?: YearlyIndex
    'Real GDP growth rate'?: YearlyIndex
    'Real GDP per capita'?: YearlyIndex
    'GDP (official exchange rate)'?: TextNode
    'Inflation rate (consumer prices)': YearlyIndex
    'Credit ratings'?: {
      [company in 'Fitch rating' | "Moody's rating" | 'Standard & Poors rating']: TextNode
    }
    'GDP - composition, by sector of origin'?: {
      agriculture?: TextNode
      industry?: TextNode
      services?: TextNode
    }
    'GDP - composition, by end use'?: {
      'household consumption'?: TextNode
      'government consumption'?: TextNode
      'investment in fixed capital'?: TextNode
      'investment in inventories'?: TextNode
      'exports of goods and services'?: TextNode
      'imports of goods and services'?: TextNode
    }
    'Agricultural products'?: TextNode
    Industries?: TextNode
    'Industrial production growth rate'?: TextNode
    'Labor force'?: TextNode
    'Labor force - by occupation?': {
      agriculture?: TextNode
      industry?: TextNode
      services?: TextNode
    }
    'Unemployment rate'?: YearlyIndex

    'Youth unemployment rate (ages 15-24)'?: {
      total?: TextNode
      male?: TextNode
      female?: TextNode
    }
    'Population below poverty line'?: TextNode
    'Gini Index coefficient - distribution of family income'?: YearlyIndex
    'Household income or consumption by percentage share'?: {
      'lowest 10%'?: TextNode
      'highest 10%'?: TextNode
    }
    Budget?: {
      revenues: TextNode
      expenditures: TextNode
    }
    'Budget surplus (+) or deficit (-)'?: TextNode
    'Public debt'?: YearlyIndex
    'Taxes and other revenues'?: TextNode
    'Fiscal year'?: TextNode
    'Current account balance'?: YearlyIndex

    Exports?: YearlyIndex
    'Exports - partners'?: TextNode
    'Exports - commodities'?: TextNode
    Imports?: YearlyIndex
    'Imports - partners'?: TextNode
    'Imports - commodities'?: TextNode
    'Reserves of foreign exchange and gold'?: YearlyIndex
    'Debt - external'?: YearlyIndex
    'Exchange rates'?: YearlyIndex
  }
  Energy?: {
    'Electricity access'?: {
      'electrification - total population'?: TextNode
    }
    Electricity?: {
      'installed generating capacity'?: TextNode
      consumption?: TextNode
      exports?: TextNode
      imports?: TextNode
      'transmission/distribution losses'?: TextNode
    }
    'Electricity generation sources'?: {
      'fossil fuels'?: TextNode
      nuclear?: TextNode
      solar?: TextNode
      wind?: TextNode
      hydroelectricity?: TextNode
      'tide and wave'?: TextNode
      geothermal?: TextNode
      'biomass and waste'?: TextNode
    }
    Coal?: {
      production?: TextNode
      consumption?: TextNode
      exports?: TextNode
      imports?: TextNode
      'proven reserves'?: TextNode
    }
    Petroleum?: {
      'total petroleum production'?: TextNode
      'refined petroleum consumption'?: TextNode
      'crude oil and lease condensate exports'?: TextNode
      'crude oil and lease condensate imports'?: TextNode
      'crude oil estimated reserves'?: TextNode
    }
    'Refined petroleum products - production'?: TextNode
    'Refined petroleum products - exports'?: TextNode
    'Refined petroleum products - imports'?: TextNode
    'Natural gas'?: {
      production?: TextNode
      consumption?: TextNode
      exports?: TextNode
      imports?: TextNode
      'proven reserves'?: TextNode
    }
    'Carbon dioxide emissions': {
      'total emissions'?: TextNode
      'from coal and metallurgical coke'?: TextNode
      'from petroleum and other liquids'?: TextNode
      'from consumed natural gas'?: TextNode
    }
    'Energy consumption per capita'?: YearlyIndex
  }
  Communications: {
    'Telephones - fixed lines'?: {
      'total subscriptions'?: TextNode
      'subscriptions per 100 inhabitants'?: TextNode
    }
    'Telephones - mobile cellular'?: {
      'total subscriptions'?: TextNode
      'subscriptions per 100 inhabitants'?: TextNode
    }
    'Telecommunication systems'?: {
      'general assessment'?: TextNode
      domestic?: TextNode
      international?: TextNode
    }
    'Broadcast media'?: TextNode
    'Internet country code': TextNode
    'Internet users'?: {
      total?: TextNode
      'percent of population'?: TextNode
    }
    'Broadband - fixed subscriptions': {
      total?: TextNode
      'subscriptions per 100 inhabitants'?: TextNode
    }
  }
  Transportation: {
    'National air transport system'?: {
      'number of registered air carriers'?: TextNode
      'inventory of registered aircraft operated by air carriers'?: TextNode
      'annual passenger traffic on registered air carriers'?: TextNode
      'annual freight traffic on registered air carriers'?: TextNode
    }
    'Civil aircraft registration country code prefix'?: TextNode
    Airports?: {
      total: TextNode
    }
    'Airports - with paved runways'?: {
      total?: TextNode
      'over 3,047 m'?: TextNode
      '2,438 to 3,047 m'?: TextNode
      '1,524 to 2,437 m'?: TextNode
      '914 to 1,523 m'?: TextNode
      'under 914 m'?: TextNode
    }
    'Airports - with unpaved runways': {
      total?: TextNode
      '1,524 to 2,437 m'?: TextNode
      '914 to 1,523 m'?: TextNode
      'under 914 m'?: TextNode
    }
    Heliports?: TextNode
    Pipelines?: TextNode
    Railways?: {
      total?: TextNode
      'standard gauge'?: TextNode
      'narrow gauge'?: TextNode
    }
    Roadways?: {
      total: TextNode
      paved: TextNode
    }
    Waterways?: TextNode
    'Merchant marine'?: {
      total?: TextNode
      'by type'?: TextNode
    }
    'Ports and terminals?': {
      'major seaport(s)'?: TextNode
      'oil terminal(s)'?: TextNode
      'container port(s) (TEUs)'?: TextNode
      'LNG terminal(s) (import)'?: TextNode
      'river port(s)'?: TextNode
    }
  }
  'Military and Security'?: {
    'Military and security forces'?: TextNode
    'Military expenditures'?: YearlyIndex
    'Military and security service personnel strengths'?: TextNode
    'Military equipment inventories and acquisitions'?: TextNode
    'Military service age and obligation'?: TextNode
    'Military deployments'?: TextNode
    'Military - note'?: TextNode
  }
  Terrorism?: {
    'Terrorist group(s)'?: TextNode
  }
  'Transnational Issues'?: {
    'Disputes - international'?: TextNode
    'Refugees and internally displaced persons'?: {
      'refugees (country of origin)'?: TextNode
      'stateless persons'?: TextNode
    }
    'Illicit drugs'?: TextNode
  }
}

export const isYearlyIndex = (data: any): data is YearlyIndex => {
  if (!data) return false
  if (typeof data !== 'object') return false
  if (Reflect.has(data, 'text')) return false

  return true
}
