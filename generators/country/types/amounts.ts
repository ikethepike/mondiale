export type Unit =
  | '%'
  | '$'
  | '€'
  | 'year'
  | 'people'
  | 'km²'
  | 'm'
  | 'per 100'
  | 'km'
  | 'per 1000'
  | 'liters per year'
  | 'Mt'
  | 'Gini Coefficient'

export interface Amount<T extends Unit = Unit> {
  amount: number
  unit: T
  year?: number
}
