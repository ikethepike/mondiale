export const extractNumbers = (string: string): number[] => {
  const NUMERIC_REGEXP = /[-]{0,1}[\d]*[.]{0,1}[\d]+/g
  const matches = string.match(NUMERIC_REGEXP)
  if (!matches) return []

  return matches.map(match => Number(match))
}

export const extractYears = (string: string): number[] => {
  const YEARS_REGEXP = /(?:(?:18|19|20|21)[0-9]{2})/g
  const matches = string.match(YEARS_REGEXP)
  if (!matches) return []

  return matches.map(match => Number(match))
}

export const removeAfterCharacter = (string: string, character: string) => {
  return string.split(character).shift() || ''
}

export const extractParentheticals = (string: string): string[] => {
  const matches = string.match(/\(([^\)]+)\)/g)
  if (!matches) return []

  return matches.map(match => match)
}

export const getPercentages = (string: string): number[] => {
  const matches = string.match(/\b(?<!\.)(?!0+(?:\.0+)?%)(?:\d|[1-9]\d|100)(?:(?<!100)\.\d+)?%/g)
  if (!matches) return []

  return matches.map(match => Number(match.replace('%', '')))
}

export const baseEncode = (data: string) => {
  try {
    return btoa(data)
  } catch (err) {
    return Buffer.from(data).toString('base64')
  }
}

export const removeAllNumbers = (string: string): string => {
  return string.replaceAll(/[+-]?\d+(\.\d+)?/g, '')
}

export const removeAllPercentages = (string: string): string => {
  return removeAllNumbers(string).replaceAll('%', '')
}

export const getAllCapitalizedWords = (string: string): string[] => {
  return string.match(/([A-Z][^\s]*)/g) || []
}
