import type { ISOCountryCode } from '../../../types/geography.types'

export interface ISOFipsMapping {
  isoCode: ISOCountryCode
  fipsCode: string
}

export interface LinkMapping extends ISOFipsMapping {
  url: string
  folder: string
}

export interface MappingResult {
  success: boolean
  mappings: LinkMapping[]
  errors: Error[]
}
