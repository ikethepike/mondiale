export type Organization =
  | 'bri'
  | 'eu'
  | 'nato'
  | 'un'
  | {
      _type: string
      id: string
      name: string
      regions: string[]
    }
