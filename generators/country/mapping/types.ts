import { FOLDERS } from './constants'
import type { ISOCountryCode } from '../../../types/geography.types'

export interface LinkMapping {
  isoCode: ISOCountryCode
  fipsCode: string
  url: string
  folder: string
}

export interface MappingResult {
  success: boolean
  mappings: LinkMapping[]
  errors: Error[]
}

export type Folder = (typeof FOLDERS)[number]

export interface NonSovereignMapping {
  isoCode: ISOCountryCode
  fipsCode: string
  url: string
}
