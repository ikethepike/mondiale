import type { Region } from './geography.types'

export enum OrganizationVector {
  eu = 'European Union',
  au = 'African Union',
  bri = 'Belt and Road Initiative',
  nato = 'North Atlantic Treaty Organization',
  csto = 'Collective Security Treaty Organization',
  opec = 'Organization of the Petroleum Exporting Countries',
  oecd = 'Organisation for Economic Co-operation and Development',
}

export const isOrganizationKey = (
  organization: unknown
): organization is keyof typeof OrganizationVector => {
  return typeof organization === 'string' && Object.keys(OrganizationVector).includes(organization)
}

export type Organization = {
  _type: 'organization'
  id: keyof typeof OrganizationVector
  name: string
  regions: Region[]
}

export interface OrganizationMembership {
  organization: Organization
}

/**
 * What each club actually is — the fact a membership question is really
 * teaching, and the one "X is the odd one out" never says. Editorial, like
 * the border stories: membership itself is generated, this is the caption
 * around it. Shorthand names read better in a chip than the enum's formal
 * ones ("NATO", not "North Atlantic Treaty Organization").
 */
export interface OrganizationFacts {
  /** The year the body itself was founded, not its predecessor's. */
  founded: number
  /** How it's usually named in a sentence. */
  shortName: string
  /** One line on what belonging to it means. */
  purpose: string
}

export const ORGANIZATION_FACTS: {
  [organization in keyof typeof OrganizationVector]: OrganizationFacts
} = {
  eu: {
    founded: 1993,
    shortName: 'the EU',
    purpose:
      'A single market with free movement of people, goods and money, and a body of law its members share.',
  },
  au: {
    founded: 2002,
    shortName: 'the African Union',
    purpose:
      'The continental union of Africa’s states, successor to the 1963 Organisation of African Unity.',
  },
  bri: {
    founded: 2013,
    shortName: 'the Belt and Road Initiative',
    purpose:
      'China’s infrastructure and lending programme — countries join by signing a memorandum, not a treaty.',
  },
  nato: {
    founded: 1949,
    shortName: 'NATO',
    purpose: 'A mutual-defence alliance: an attack on one member is treated as an attack on all.',
  },
  csto: {
    founded: 2002,
    shortName: 'the CSTO',
    purpose:
      'A Russia-led mutual-defence pact of post-Soviet states, built on the 1992 Collective Security Treaty.',
  },
  opec: {
    founded: 1960,
    shortName: 'OPEC',
    purpose: 'Oil-exporting states that coordinate production to steady the price of crude.',
  },
  oecd: {
    founded: 1961,
    shortName: 'the OECD',
    purpose:
      'A club of mostly high-income democracies that sets economic standards and publishes the statistics states are compared by.',
  },
}

export const organizationRegions: { [organization in keyof typeof OrganizationVector]: Region[] } =
  {
    au: ['africa'],
    eu: ['europe'],
    bri: ['europe', 'asia', 'middle-east', 'south-america', 'africa'],
    nato: ['europe', 'oceania', 'north-america'],
    csto: ['asia', 'europe'],
    opec: ['middle-east', 'south-america', 'africa'],
    oecd: ['europe', 'north-america', 'south-america', 'asia'],
  }
