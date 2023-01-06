import { COUNTRIES } from '~~/data/countries.gen'
import { ISOCountryCodes } from '~~/data/iso-codes.gen'
import { Country, ISOCountryCode } from '~~/types/geography.types'
import { shuffleArray } from './arrays'

export const getRandomISOCountryCode = (modifier?: 'large' | 'small'): ISOCountryCode => {
  switch (modifier) {
    // Find larger countries to avoid users having to find tiny island nations
    case 'large': {
      const shuffledISOCodes = shuffleArray([...ISOCountryCodes])
      return (
        shuffledISOCodes.find(isoCode => {
          const country = COUNTRIES[isoCode]
          if (!country.geography.area.total) return false
          return country.geography.area.total.amount > 400
        }) || shuffledISOCodes[0]
      )
    }
    case 'small': {
      const shuffledISOCodes = shuffleArray([...ISOCountryCodes])
      return (
        shuffledISOCodes.find(isoCode => {
          const country = COUNTRIES[isoCode]
          if (!country.geography.area.total) return false
          return country.geography.area.total.amount < 400
        }) || shuffledISOCodes[0]
      )
    }
    default:
      return ISOCountryCodes[Math.floor(Math.random() * ISOCountryCodes.length)]
  }
}

export const getRandomCountry = (): Country => {
  const isoCode = getRandomISOCountryCode()
  return COUNTRIES[isoCode]
}
