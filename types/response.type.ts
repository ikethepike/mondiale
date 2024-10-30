export interface TextNode {
  text: string
  total?: string
}

export type TextNodeRecord = Record<string, TextNode | undefined>

export interface YearlyIndex {
  [year: string]: TextNode
}

export interface DemographicStats {
  total?: TextNode
  male?: TextNode
  female?: TextNode
  'total population'?: TextNode
}

export interface UrbanRuralStats {
  urban?: TextNode
  rural?: TextNode
  total?: TextNode
}

export interface RefugeeStats {
  text: string
  'refugees (country of origin)'?: TextNode
}

export interface InternetStats {
  text: string
  'percent of population'?: TextNode
}

export interface ElectionStats {
  text: string
  'election results'?: TextNode
}

export interface FactbookResponse {
  url?: string
  Government: {
    'Country name': {
      'conventional short form': TextNode
      'conventional long form': TextNode
      'local short form'?: TextNode
      'local long form'?: TextNode
    }
    Capital: {
      name: TextNode
      'geographic coordinates'?: TextNode
    }
    'Executive branch': {
      'chief of state': TextNode & ElectionStats
      'head of government'?: TextNode
      cabinet?: TextNode
      'election results'?: TextNode
    }
    'Legislative branch'?: TextNode
    'Political parties and leaders'?: TextNode
    'International organization participation'?: TextNode
  }
  Geography: {
    'Map references': TextNode
    'Geographic coordinates'?: TextNode
    Area: {
      total: TextNode
      land: TextNode
      water: TextNode
    }
    'Land use'?: {
      'agricultural land'?: TextNode
      'arable land'?: TextNode
      'permanent crops'?: TextNode
      'permanent pasture'?: TextNode
      'agricultural land: arable land'?: TextNode
      forest?: TextNode
      other?: TextNode
    }
    Elevation?: {
      'highest point'?: TextNode
      'lowest point'?: TextNode
      'mean elevation'?: TextNode
    }
  }
  Economy: {
    'Real GDP per capita'?: YearlyIndex
    'Inflation rate (consumer prices)'?: YearlyIndex
    'Population below poverty line'?: TextNode
    'Youth unemployment rate (ages 15-24)'?: YearlyIndex
    'Unemployment rate'?: YearlyIndex
    'Gini Index coefficient - distribution of family income'?: YearlyIndex
  }
  Transportation: {
    Roadways?: {
      total: TextNode
    }
    Railways?: {
      total: TextNode
    }
  }
  'People and Society': {
    Population: TextNode
    'Population growth rate'?: TextNode
    'Life expectancy at birth'?: DemographicStats
    'Total fertility rate'?: TextNode
    'Contraceptive prevalence rate'?: TextNode
    'Drinking water source'?: {
      improved?: UrbanRuralStats
      unimproved?: UrbanRuralStats
    }
    'Sanitation facility access'?: {
      improved?: UrbanRuralStats
      unimproved?: UrbanRuralStats
    }
    'HIV/AIDS - adult prevalence rate'?: TextNode
    'School life expectancy (primary to tertiary education)'?: DemographicStats
    'Obesity - adult prevalence rate'?: TextNode
    'Physicians density'?: TextNode
    'Hospital bed density'?: TextNode
    'Alcohol consumption per capita'?: TextNode
    'Tobacco use'?: TextNode
    "Mother's mean age at first birth"?: TextNode
    'Median age'?: TextNode
    Literacy?: DemographicStats
    Religions?: TextNode
  }
  Environment: {
    'Air pollutants'?: {
      'carbon dioxide emissions'?: TextNode
    }
    Energy?: {
      'electricity access'?: UrbanRuralStats
      'installed generating capacity'?: TextNode
      'electricity production'?: TextNode
      'electricity consumption'?: TextNode
    }
  }
  Communications?: {
    Internet?: {
      users?: TextNode & InternetStats
      'percent of population'?: TextNode
    }
    'Internet users'?: TextNode & InternetStats
    'Telephones - mobile cellular'?: TextNode
    'Telephones - fixed lines'?: TextNode
  }
  'Military and Security'?: {
    'Military expenditures'?: YearlyIndex
    'Military and security forces'?: TextNode
  }
  'Transnational Issues'?: {
    'Refugees and internally displaced persons'?: TextNode & RefugeeStats
    Refugees?: TextNode & RefugeeStats
    'Trafficking in persons'?: TextNode
    'Illicit drugs'?: TextNode
  }
}

export function isYearlyIndex(value: unknown): value is YearlyIndex {
  if (!value || typeof value !== 'object') return false
  return Object.keys(value).every(
    key => !isNaN(Number(key)) && typeof (value as any)[key]?.text === 'string'
  )
}

export function createTextNode(text: string): TextNode {
  return { text }
}

export function extractText(node: TextNode | string | undefined): string | undefined {
  if (!node) return undefined
  if (typeof node === 'string') return node
  return node.text
}

export function extractTotal(node: TextNode | string | undefined): string | undefined {
  if (!node) return undefined
  if (typeof node === 'string') return node
  return node.total || node.text
}

export function extractNestedText(obj: any, path: string[]): string | undefined {
  let current = obj
  for (const key of path) {
    if (!current?.[key]) return undefined
    current = current[key]
  }
  return extractText(current)
}
