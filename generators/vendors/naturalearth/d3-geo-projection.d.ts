// @types/d3-geo-projection is no longer published; declare the one export we use.
declare module 'd3-geo-projection' {
  import type { GeoProjection } from 'd3-geo'
  export function geoRobinson(): GeoProjection
}
