import type { Amount } from './amounts'

export interface Economics {
  gdpPerCapita?: Amount<'$'>
  inflation?: Amount<'%'>
  militarySpending?: Amount<'%'>
  populationBelowPovertyLine?: Amount<'%'>
  equality?: Amount<'Gini Coefficient'>
}
