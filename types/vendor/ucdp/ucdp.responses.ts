export interface UCDPResponse {
  TotalCount: number
  TotalPages: number
  PreviousPageUrl: string
  NextPageUrl: string
  Result: Result[]
}

export interface Result {
  dyad_id: string
  conflict_id: string
  location: string
  side_a: string
  side_a_id: string
  side_a_2nd: string
  side_b: string
  side_b_id: string
  side_b_2nd: string
  incompatibility: string
  territory_name: string
  year: string
  intensity_level: string
  type_of_conflict: string
  start_date: Date
  start_prec: string
  start_date2: Date
  start_prec2: string
  gwno_a: string
  gwno_a_2nd: string
  gwno_b: string
  gwno_b_2nd: string
  gwno_loc: string
  region: string
  version: string
}
