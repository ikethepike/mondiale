import { COUNTRIES } from '~~/data/countries.gen'
import { GroupChallengeAccessorId } from '~~/types/challenges/group-challenge.type'
import { Amount, ISOCountryCode, isValidISOCode } from '~~/types/geography.types'

export const getValueByAccessorID = (
  isoCode: ISOCountryCode | string,
  accessorId: GroupChallengeAccessorId
): Amount<any> | undefined => {
  if (!isValidISOCode(isoCode)) throw new EvalError(`Invalid ISO code: ${isoCode}`)

  const split = accessorId.split('.')
  let value: any = COUNTRIES[isoCode]
  for (const key of split) {
    if (!value || !value[key]) {
      return undefined
    }

    value = value[key]
  }

  return value
}

export const processReplacements = (text: string, isoCode: ISOCountryCode) => {
  const replacements = ['{countryName}', '{capital}'] as const

  const replacementsPresent = replacements.filter(replacement => text.includes(replacement))
  if (!replacementsPresent.length) return text

  const country = COUNTRIES[isoCode]
  for (const replacement of replacementsPresent) {
    switch (replacement) {
      case '{capital}':
        text = text.replaceAll(replacement, country.geography.capital.name)
        break
      case '{countryName}':
        text = text.replaceAll(replacement, country.name.english)
        break
    }
  }

  return text
}
