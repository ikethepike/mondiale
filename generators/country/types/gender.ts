import type { Amount } from './amounts'

export interface Gender {
  motherMeanAgeAtFirstBirth?: Amount<'year'>
  femaleParliamentRepresentation?: Amount<'%'>
}
