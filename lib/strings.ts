/**
 * The one free-typed-answer normalizer: case, diacritics ("Côte d'Ivoire" →
 * "cote divoire"), apostrophes, punctuation collapsed to single spaces, and a
 * leading article dropped. Every typed-guess match (countries, empires, water
 * features, leaders) MUST route through this — normalizing both sides with
 * the same function is what makes the match hold.
 */
export const normalizeAnswer = (
  value: string,
  options: { articles?: readonly string[]; suffixes?: readonly string[]; digits?: boolean } = {}
): string => {
  const articles = options.articles ?? ['the']
  // Generic trailing words a guesser appends ("Yellow River") — stripped once,
  // never from a bare one-word answer (the regex needs a preceding space)
  const suffixes = options.suffixes ?? []
  const keep = options.digits === false ? /[^a-z]+/g : /[^a-z0-9]+/g
  const flattened = value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(keep, ' ')
    .trim()
  const led = articles.length
    ? flattened.replace(new RegExp(`^(?:${articles.join('|')}) `), '')
    : flattened
  return suffixes.length ? led.replace(new RegExp(` (?:${suffixes.join('|')})$`), '') : led
}

/**
 * The one edit distance: Damerau–Levenshtein (adjacent transpositions count
 * as one edit — the typo fast typists actually make), optionally capped at
 * `budget`: anything beyond returns `budget + 1`.
 */
export const editDistance = (a: string, b: string, budget = Number.POSITIVE_INFINITY): number => {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > budget) return budget + 1

  let twoAgo: number[] = []
  let oneAgo = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    let rowMinimum = i
    for (let j = 1; j <= b.length; j++) {
      let cost = Math.min(
        oneAgo[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
        oneAgo[j] + 1,
        row[j - 1] + 1
      )
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        cost = Math.min(cost, twoAgo[j - 2] + 1)
      }
      row.push(cost)
      if (cost < rowMinimum) rowMinimum = cost
    }
    if (rowMinimum > budget) return budget + 1
    twoAgo = oneAgo
    oneAgo = row
  }

  return oneAgo[b.length]
}

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
  const matches = string.match(/\(([^)]+)\)/g)
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
  } catch {
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

/** First letter up, rest untouched — prose starts ("the Ottoman Empire" → "The Ottoman Empire"). */
export const sentenceCase = (value: string): string =>
  value ? `${value[0].toUpperCase()}${value.slice(1)}` : value

/** "north-america" → "North America" — the one kebab/slug humanizer. */
export const titleCase = (value: string): string =>
  value.replace(/-/g, ' ').replace(/\b\w/g, character => character.toUpperCase())
