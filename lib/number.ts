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

/** "12.34m people", "61.3 %" — a country stat with its unit, for lessons. */
export const formatAmount = (amount: { amount: number; unit: string }): string => {
  const unit = String(amount.unit ?? '').trim()
  return unit ? `${formatNumber(amount.amount)} ${unit}` : formatNumber(amount.amount)
}
