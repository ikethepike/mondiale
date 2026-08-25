/**
 * Turn one Overpass response into a city-plan tile: project into the frame,
 * simplify, sort every way into its layer class, and decide which bridges the
 * round withholds.
 *
 * The pure geometry lives in generators/lib/city-plan-geometry (where the test
 * runner reaches it); this module is the OSM tag knowledge.
 */
import {
  ARTERIAL_HIGHWAYS,
  FABRIC_HIGHWAYS,
  RAILWAYS,
  type OverpassElement,
  type OverpassResponse,
} from './overpass'
import {
  countCrossings,
  countVertices,
  crossesWater,
  emitPath,
  haversineKm,
  isRing,
  lineLength,
  simplifyLine,
  streetDensity,
  tileProjection,
  waterSpan,
  BRIDGE_OVERHANG,
  MINIMUM_FABRIC_LENGTH,
  SIMPLIFY_TOLERANCE,
  type BoundingBox,
  type GeoPoint,
  type TilePoint,
} from '../../lib/city-plan-geometry'
import { CITY_TILE_SPAN } from '../../../lib/ground-plan'

const FABRIC = new Set<string>(FABRIC_HIGHWAYS)
const ARTERIAL = new Set<string>(ARTERIAL_HIGHWAYS)
const RAIL = new Set<string>(RAILWAYS)

/** The emitted tile: one path per layer, plus what the reveal states. */
export interface CityPlanTile {
  /** Filled water bodies — rivers with real banks, lakes, docks. */
  waterFill: string
  /** Water too narrow to have banks: canals, minor rivers. */
  waterLine: string
  /** The land side of a coastline, closed against the frame. */
  shore: string
  fabric: string
  arterials: string
  rail: string
  bridges: string
  green: string
  /** Distinct water crossings — the reveal's bridge count. */
  crossings: number
  /** Street km per km², the coverage floor's score. */
  density: number
  vertices: number
}

const sameNode = (a: GeoPoint, b: GeoPoint): boolean =>
  Math.abs(a.lat - b.lat) < 1e-9 && Math.abs(a.lon - b.lon) < 1e-9

/**
 * Stitch a multipolygon's member ways into closed rings.
 *
 * Overpass `out geom` does NOT assemble relations: the Thames arrives as one
 * relation whose outer boundary is 31 separate ways, in no particular order
 * and in either direction. Treating each member as its own ring renders a
 * river as a bundle of loose strokes rather than a channel, so the members
 * have to be walked end-to-end and reversed where they run backwards.
 */
const assembleRings = (members: GeoPoint[][]): GeoPoint[][] => {
  const pending = members.filter(member => member.length > 1)
  const rings: GeoPoint[][] = []

  while (pending.length) {
    const ring = pending.shift()!
    let joined = true
    while (joined && !sameNode(ring[0], ring.at(-1)!)) {
      joined = false
      for (let i = 0; i < pending.length; i++) {
        const candidate = pending[i]
        const tail = ring.at(-1)!
        if (sameNode(tail, candidate[0])) ring.push(...candidate.slice(1))
        else if (sameNode(tail, candidate.at(-1)!)) ring.push(...candidate.slice(0, -1).reverse())
        else if (sameNode(ring[0], candidate.at(-1)!)) ring.unshift(...candidate.slice(0, -1))
        else if (sameNode(ring[0], candidate[0])) ring.unshift(...candidate.slice(1).reverse())
        else continue
        pending.splice(i, 1)
        joined = true
        break
      }
    }
    rings.push(ring)
  }

  return rings
}

/**
 * A relation's outer rings, assembled. Inner rings are dropped rather than
 * subtracted: they are handled by the even-odd fill on the emitted path, and
 * an unclosed inner would fill a river island solid.
 */
const geometriesOf = (element: OverpassElement): GeoPoint[][] => {
  if (element.type === 'way' && element.geometry) return [element.geometry]
  if (element.type !== 'relation' || !element.members) return []
  return assembleRings(
    element.members
      .filter(member => member.geometry && member.role !== 'inner')
      .map(member => member.geometry!)
  )
}

/**
 * Whether a coastline ring encloses land or sea.
 *
 * `natural=coastline` ways are directional with land on the LEFT, and they do
 * not close — you close them against the frame yourself. Get the winding
 * backwards and the whole tile floods: every frame renders as open sea, which
 * is the classic failure of every OSM renderer and worth asserting on.
 */
const windsLandInward = (ring: readonly TilePoint[]): boolean => {
  let area = 0
  for (let i = 1; i < ring.length; i++) {
    area += ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1]
  }
  return area > 0
}

const closeAgainstFrame = (line: TilePoint[]): TilePoint[] => {
  const start = line[0]
  const end = line.at(-1)!
  if (Math.hypot(start[0] - end[0], start[1] - end[1]) < 1) return line

  // Walk the frame corners between the two ends so the ring closes outside the
  // visible area rather than cutting a chord across the water.
  const corners: TilePoint[] = [
    [0, 0],
    [CITY_TILE_SPAN, 0],
    [CITY_TILE_SPAN, CITY_TILE_SPAN],
    [0, CITY_TILE_SPAN],
  ]
  const nearest = (point: TilePoint) =>
    corners.reduce((best, corner) =>
      Math.hypot(corner[0] - point[0], corner[1] - point[1]) <
      Math.hypot(best[0] - point[0], best[1] - point[1])
        ? corner
        : best
    )
  return [...line, nearest(end), nearest(start), start]
}

export const buildTile = (
  response: OverpassResponse,
  box: BoundingBox,
  { tolerance = SIMPLIFY_TOLERANCE }: { tolerance?: number } = {}
): CityPlanTile => {
  const project = tileProjection(box)

  const waterFill: TilePoint[][] = []
  const waterLine: TilePoint[][] = []
  const coastline: TilePoint[][] = []
  const green: TilePoint[][] = []
  const layers: Record<'fabric' | 'arterials' | 'rail', TilePoint[][]> = {
    fabric: [],
    arterials: [],
    rail: [],
  }
  const bridgeCandidates: { line: TilePoint[]; layer: 'fabric' | 'arterials' | 'rail' }[] = []
  let streetKm = 0

  for (const element of response.elements) {
    const tags = element.tags ?? {}
    for (const geometry of geometriesOf(element)) {
      const line = simplifyLine(geometry.map(project), tolerance)
      if (line.length < 2) continue

      if (tags.natural === 'coastline') {
        coastline.push(line)
        continue
      }
      if (tags.natural === 'water') {
        ;(isRing(line) ? waterFill : waterLine).push(line)
        continue
      }
      if (tags.waterway) {
        waterLine.push(line)
        continue
      }
      if (tags.leisure === 'park' || tags.landuse) {
        if (isRing(line)) green.push(line)
        continue
      }

      const layer = tags.highway
        ? FABRIC.has(tags.highway)
          ? 'fabric'
          : ARTERIAL.has(tags.highway)
            ? 'arterials'
            : undefined
        : tags.railway && RAIL.has(tags.railway)
          ? 'rail'
          : undefined
      if (!layer) continue

      if (layer !== 'rail') {
        for (let i = 1; i < geometry.length; i++) {
          streetKm += haversineKm(geometry[i - 1], geometry[i])
        }
      }

      if (layer === 'fabric' && lineLength(line) < MINIMUM_FABRIC_LENGTH) continue

      if (tags.bridge && tags.bridge !== 'no') {
        bridgeCandidates.push({ line, layer })
        continue
      }
      layers[layer].push(line)
    }
  }

  const water = [...waterFill, ...waterLine, ...coastline]

  // The bridge layer withholds ONLY water crossings. A 2km cut of central
  // London carries 171 bridge-tagged ways and 16 real crossings — withholding
  // the other 155 ordinary overpasses would punch the road network full of
  // holes miles from the river, and the frame would just look broken.
  const bridges: TilePoint[][] = []
  const spans: TilePoint[][] = []
  for (const { line, layer } of bridgeCandidates) {
    if (!crossesWater(line, water)) {
      layers[layer].push(line)
      continue
    }
    // Counted from the bare span and drawn from the padded one: padding two
    // neighbouring bridges until their decks touch would merge them into a
    // single crossing and understate the city.
    spans.push(waterSpan(line, water))
    bridges.push(waterSpan(line, water, BRIDGE_OVERHANG))
  }

  // A centreline drawn over a river that already has banks renders the Thames
  // as two shores plus a stripe down the middle.
  const uncoveredWaterLine = waterLine.filter(line => !crossesWater(line, waterFill))

  const shore = coastline.map(line => {
    const closed = closeAgainstFrame(line)
    return windsLandInward(closed) ? closed : [...closed].reverse()
  })

  const all = [
    ...waterFill,
    ...uncoveredWaterLine,
    ...shore,
    ...green,
    ...layers.fabric,
    ...layers.arterials,
    ...layers.rail,
    ...bridges,
  ]

  return {
    waterFill: emitPath(waterFill, true),
    waterLine: emitPath(uncoveredWaterLine),
    shore: emitPath(shore, true),
    fabric: emitPath(layers.fabric),
    arterials: emitPath(layers.arterials),
    rail: emitPath(layers.rail),
    bridges: emitPath(bridges),
    green: emitPath(green, true),
    crossings: countCrossings(spans),
    density: streetDensity(streetKm, box),
    vertices: countVertices(all),
  }
}
