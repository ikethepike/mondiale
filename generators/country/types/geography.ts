import type { Amount } from './amounts'

export interface Geography {
  area: {
    total?: Amount<'km²'>
    land?: Amount<'km²'>
    water?: Amount<'km²'>
  }
  coordinates?: string
  capital?: {
    name: string
    coordinates?: string
  }
}
