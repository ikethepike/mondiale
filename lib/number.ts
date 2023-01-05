const NUMBER_BREAKPOINTS = {
  MILLION: 1000000,
  BILLION: 1000000000,
  TRILLION: 1000000000000,
} as const

export const formatNumber = (number: number): string => {
  const formatter = new Intl.NumberFormat()

  switch (true) {
    case number > NUMBER_BREAKPOINTS.MILLION:
      return (number / NUMBER_BREAKPOINTS.MILLION).toFixed(2) + 'm'
    case number > NUMBER_BREAKPOINTS.BILLION:
      return (number / NUMBER_BREAKPOINTS.BILLION).toFixed(2) + 'b'
    case number > NUMBER_BREAKPOINTS.TRILLION:
      return (number / NUMBER_BREAKPOINTS.TRILLION).toFixed(2) + 't'
    default:
      return formatter.format(number)
  }
}
