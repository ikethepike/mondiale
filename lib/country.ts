import { COUNTRIES } from '~~/data/countries.gen'
import { ISOCountryCodes } from '~~/data/iso-codes.gen'
import { Country, ISOCountryCode } from '~~/types/geography.types'
import { shuffleArray } from './arrays'

export const getRandomISOCountryCode = (): ISOCountryCode => {
  return ISOCountryCodes[Math.floor(Math.random() * ISOCountryCodes.length)]
}

export const getRandomCountry = (): Country => {
  const isoCode = getRandomISOCountryCode()
  return COUNTRIES[isoCode]
}
