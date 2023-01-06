import { Region } from './geography.types'

export enum OrganizationVector {
  eu = 'European Union',
  au = 'African Union',
  bri = 'Belt and Road Initiative',
  nato = 'North American Trade Organization',
  csto = ' Collective Security Treaty Organization',
  opec = 'Organization of the Petroleum Exporting Countries',
  oecd = 'Organisation for Economic Co-operation and Development',
}

export const isOrganizationKey = (
  organization: any
): organization is keyof typeof OrganizationVector => {
  return organization && Object.keys(OrganizationVector).includes(organization)
}

export type Organization = {
  _type: 'organization'
  id: keyof typeof OrganizationVector
  name: string
  continent: Region[]
}

export interface OrganizationMembership {
  organization: Organization
}
