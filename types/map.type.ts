import type { ISOCountryCode } from './geography.types'

export interface CountryColorGrouping {
  color: string
  countries: Array<ISOCountryCode | string>
}
