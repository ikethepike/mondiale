import type { Country, ISOCountryCode, Organization } from '../../types/geography.types'
import type { FactbookResponse } from '../../types/response.type'
import { EconomicsTransformer } from './transformers/economics'
import { GeographyTransformer } from './transformers/geography'
import { GenderTransformer } from './transformers/gender'
import { HealthTransformer } from './transformers/health'
import { EducationTransformer } from './transformers/education'
import { EnvironmentTransformer } from './transformers/environment'
import { GovernmentTransformer } from './transformers/government'
import { HumanRightsTransformer } from './transformers/human-rights'
import { IdentityTransformer } from './transformers/identity'
import { InfrastructureTransformer } from './transformers/infrastructure'
import { PeopleTransformer } from './transformers/people'
import { ReligionTransformer } from './transformers/religion'

interface TransformerConfig {
  briMembers: string[]
  conflicts: Record<string, { conflicts: number }>
  flags: Record<string, string>
  marriageRights: Record<string, { yearAllowed: number }>
}

export class CountryDataTransformer {
  private readonly economicsTransformer: EconomicsTransformer
  private readonly geographyTransformer: GeographyTransformer
  private readonly genderTransformer: GenderTransformer
  private readonly healthTransformer: HealthTransformer
  private readonly educationTransformer: EducationTransformer
  private readonly environmentTransformer: EnvironmentTransformer
  private readonly governmentTransformer: GovernmentTransformer
  private readonly humanRightsTransformer: HumanRightsTransformer
  private readonly identityTransformer: IdentityTransformer
  private readonly infrastructureTransformer: InfrastructureTransformer
  private readonly peopleTransformer: PeopleTransformer
  private readonly religionTransformer: ReligionTransformer

  constructor(private readonly config: TransformerConfig) {
    this.economicsTransformer = new EconomicsTransformer()
    this.geographyTransformer = new GeographyTransformer()
    this.genderTransformer = new GenderTransformer()
    this.healthTransformer = new HealthTransformer()
    this.educationTransformer = new EducationTransformer()
    this.environmentTransformer = new EnvironmentTransformer()
    this.governmentTransformer = new GovernmentTransformer()
    this.humanRightsTransformer = new HumanRightsTransformer()
    this.identityTransformer = new IdentityTransformer()
    this.infrastructureTransformer = new InfrastructureTransformer()
    this.peopleTransformer = new PeopleTransformer()
    this.religionTransformer = new ReligionTransformer()
  }

  transform(response: FactbookResponse, isoCode: ISOCountryCode): Country {
    const membership: Organization[] = []
    if (this.config.briMembers.includes(isoCode)) {
      membership.push('bri')
    }

    const geography = this.geographyTransformer.transform(response)
    if (!geography.capital) {
      geography.capital = { name: '' }
    }

    return {
      url: response.url || '',
      name: {
        english: response.Government['Country name']['conventional short form'].text,
        local: response.Government['Country name']['local short form']?.text || '',
      },
      isoCode,
      flag: this.config.flags[isoCode] || '',
      coordinates: response.Geography['Geographic coordinates']?.text || '',
      region: response.Geography['Map references'].text.toLowerCase().replace(/\s+/g, '-') as any,
      membership,
      languages: [],
      currency: '',
      identity: this.identityTransformer.transform(response),
      government: this.governmentTransformer.transform(response),
      economics: this.economicsTransformer.transform(response),
      geography,
      unemployment: {},
      infrastructure: this.infrastructureTransformer.transform(response),
      gender: this.genderTransformer.transform(response),
      people: this.peopleTransformer.transform(response),
      education: this.educationTransformer.transform(response),
      health: this.healthTransformer.transform(response),
      religion: this.religionTransformer.transform(response),
      environment: this.environmentTransformer.transform(response),
      humanRights: this.humanRightsTransformer.transform(response),
    }
  }
}
