import { COUNTRIES } from '~~/data/countries.gen'
import type { GroupChallengeAccessorId } from '~~/types/challenges/group-challenge.type'
import { type Amount, type ISOCountryCode, isValidISOCode } from '~~/types/geography.types'

export const getValueByAccessorID = (
  isoCode: ISOCountryCode | string,
  accessorId: GroupChallengeAccessorId
): Amount<string> | undefined => {
  if (!isValidISOCode(isoCode)) throw new EvalError(`Invalid ISO code: ${isoCode}`)

  const split = accessorId.split('.')
  let value: unknown = COUNTRIES[isoCode]
  for (const key of split) {
    if (!value || typeof value !== 'object' || !(value as Record<string, unknown>)[key]) {
      return undefined
    }

    value = (value as Record<string, unknown>)[key]
  }

  return value as Amount<string>
}

/** Walk a dotted accessor pattern (e.g. 'players.abc.name') through an object. */
export const resolveAccessorPath = (
  target: object,
  accessorPattern: string
): { found: boolean; value?: unknown } => {
  let value: unknown = target
  for (const accessor of accessorPattern.split('.')) {
    if (!value || typeof value !== 'object' || !Reflect.has(value, accessor)) {
      return { found: false }
    }

    value = (value as Record<string, unknown>)[accessor]
  }

  return { found: true, value }
}

/** Set a value at a dotted accessor pattern. Returns false if the path does not exist. */
export const setByAccessorPath = (
  target: object,
  accessorPattern: string,
  newValue: unknown
): boolean => {
  const split = accessorPattern.split('.')
  let value: unknown = target
  for (const [index, accessor] of split.entries()) {
    if (!value || typeof value !== 'object' || !Reflect.has(value, accessor)) {
      return false
    }

    if (index === split.length - 1) {
      ;(value as Record<string, unknown>)[accessor] = newValue
    } else {
      value = (value as Record<string, unknown>)[accessor]
    }
  }

  return true
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
