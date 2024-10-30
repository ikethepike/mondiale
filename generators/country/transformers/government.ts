import type { FactbookResponse } from '../../../types/response.type'
import type { Organization } from '../../../types/organization.type'
import {
  OrganizationVector,
  organizationRegions,
  isOrganizationKey,
} from '../../../types/organization.type'
import { BaseTransformer } from './base'

export class GovernmentTransformer extends BaseTransformer {
  constructor() {
    super('GovernmentTransformer')
  }

  extract(
    data: FactbookResponse,
    isoCode: string,
    briMembers: string[],
    conflicts: Record<string, { conflicts: number }>
  ) {
    return {
      leader: this.extractLeader(data, isoCode),
      amountOfMilitaryConflicts: conflicts[isoCode]?.conflicts,
    }
  }

  extractMembership(
    data: FactbookResponse,
    isoCode: string,
    englishName: string,
    briMembers: string[]
  ): Organization[] {
    const output: Organization[] = []

    // BRI membership
    if (briMembers.includes(englishName.toLowerCase()) || ['CN'].includes(isoCode)) {
      output.push({
        _type: 'organization',
        id: 'bri',
        name: OrganizationVector['bri'],
        regions: ['asia', 'europe', 'south-america', 'africa'],
      })
    }

    // Other organizations
    const participation = data.Government['International organization participation']
    if (!participation) return output

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

    return output
  }

  private extractLeader(data: FactbookResponse, isoCode: string): string | undefined {
    if (!data.Government['Executive branch']) return undefined

    const chiefOfState =
      (data.Government['Executive branch']['chief of state']?.text || '')
        .replace(/\([^)]*\)/g, '')
        .toLowerCase()
        .split(';')
        .shift() || ''

    const headOfGovernment =
      (data.Government['Executive branch']['head of government']?.text || '')
        .replace(/\([^)]*\)/g, '')
        .toLowerCase()
        .split(';')
        .shift() || ''

    if (!chiefOfState && !headOfGovernment) return undefined

    let leader = this.determineLeader(chiefOfState, headOfGovernment, isoCode, data)

    return leader
      .split(' ')
      .map(name => name.charAt(0).toUpperCase() + name.slice(1))
      .join(' ')
      .trim()
  }

  private determineLeader(
    chiefOfState: string,
    headOfGovernment: string,
    isoCode: string,
    data: FactbookResponse
  ): string {
    const headOfGovernmentLed = [
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

    const parties = data.Government['Political parties and leaders']?.text || ''
    const election = data.Government['Executive branch']['election results']?.text || ''
    const cabinet = data.Government['Executive branch']['cabinet']?.text || ''

    switch (true) {
      case headOfGovernmentLed.includes(isoCode):
      case chiefOfState.includes('king'):
      case chiefOfState.includes('queen'):
      case headOfGovernment.includes('chancellor'):
        return headOfGovernment
      case parties.toLowerCase().includes(this.removeTitles(chiefOfState)):
      case election.toLowerCase().includes(this.removeTitles(chiefOfState)):
        return chiefOfState
      case parties.toLowerCase().includes(this.removeTitles(headOfGovernment)):
      case election.toLowerCase().includes(this.removeTitles(headOfGovernment)):
        return headOfGovernment
      case (cabinet.toLowerCase().split(',').shift() || '').includes('prime minister'):
        return headOfGovernment
      case (cabinet.toLowerCase().split(',').shift() || '').includes('president'):
        return chiefOfState
      default:
        return chiefOfState || headOfGovernment
    }
  }
}
