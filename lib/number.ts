/** The one two-sided clamp — call sites must not hand-roll Math.min/Math.max chains. */
export const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value))

/** Clamp to the unit interval — fractions of a clock, a track, a pot. */
export const clamp01 = (value: number): number => clamp(value, 0, 1)

const NUMBER_BREAKPOINTS = {
  MILLION: 1000000,
  BILLION: 1000000000,
  TRILLION: 1000000000000,
} as const

export const formatNumber = (number: number): string => {
  const formatter = new Intl.NumberFormat()

  // Largest magnitude first — the reverse order made every big number "m"
  switch (true) {
    case number > NUMBER_BREAKPOINTS.TRILLION:
      return (number / NUMBER_BREAKPOINTS.TRILLION).toFixed(2) + 't'
    case number > NUMBER_BREAKPOINTS.BILLION:
      return (number / NUMBER_BREAKPOINTS.BILLION).toFixed(2) + 'b'
    case number > NUMBER_BREAKPOINTS.MILLION:
      return (number / NUMBER_BREAKPOINTS.MILLION).toFixed(2) + 'm'
    default:
      return formatter.format(number)
  }
}

const ORDINAL_SUFFIXES: Partial<Record<Intl.LDMLPluralRule, string>> = {
  one: 'st',
  two: 'nd',
  few: 'rd',
}

/** 1 → "1st", 2 → "2nd" — placement copy on scorecards. */
export const formatOrdinal = (position: number): string => {
  const rule = new Intl.PluralRules('en', { type: 'ordinal' }).select(position)
  return `${position}${ORDINAL_SUFFIXES[rule] ?? 'th'}`
}

/** "12.34m people", "61.3 %" — a country stat with its unit, for lessons. */
export const formatAmount = (amount: { amount: number; unit: string }): string => {
  const unit = String(amount.unit ?? '').trim()
  return unit ? `${formatNumber(amount.amount)} ${unit}` : formatNumber(amount.amount)
}

/** "1,234 km" — the one distance formatter for pin drops, probes and standings. */
export const formatKm = (distanceKm: number): string =>
  `${Math.round(distanceKm).toLocaleString()} km`
