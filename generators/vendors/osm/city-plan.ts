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
  signedArea,
  stitchChains,
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

const samePoint = (a: TilePoint, b: TilePoint): boolean => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1

/**
 * A relation's rings, assembled — outers AND inners.
 *
 * The inners are what carve river islands out of the water. Dropping them and
 * leaning on the even-odd fill does not work, because with no inner ring in the
 * path there is nothing for the rule to subtract: the Île de la Cité floods and
 * Paris sits half under the Seine.
 *
 * Both roles are stitched in one pass and the even-odd fill on the emitted path
 * does the rest — an inner ring nested inside an outer is a hole by definition.
 */
const geometriesOf = (element: OverpassElement): GeoPoint[][] => {
  if (element.type === 'way' && element.geometry) return [element.geometry]
  if (element.type !== 'relation' || !element.members) return []
  const rings = (role: 'outer' | 'inner') =>
    stitchChains(
      element
        .members!.filter(
          member =>
            member.geometry &&
            (role === 'inner' ? member.role === 'inner' : member.role !== 'inner')
        )
        .map(member => member.geometry!),
      sameNode
    )
  return [...rings('outer'), ...rings('inner')]
}

/**
 * Close coastline chains into land rings, walking the frame between the ends.
 *
 * `natural=coastline` is the fiddliest layer in the pull and the New York case
 * depends on it: the Hudson and East River are tidal, so Manhattan's edge is
 * not a water polygon at all. The ways arrive as fragments (16 of them for
 * Lower Manhattan), chain end to end, and do not close — the frame edge closes
 * them.
 *
 * OSM's rule is that LAND lies to the left of the way direction. That is what
 * decides which side to fill; deriving it from the finished ring's area instead
 * gets it backwards on a chain that exits the way it entered, and a backwards
 * coastline floods the entire tile as open sea. It is the classic renderer bug
 * and it is worth being explicit about.
 */
const CORNERS: TilePoint[] = [
  [0, 0],
  [CITY_TILE_SPAN, 0],
  [CITY_TILE_SPAN, CITY_TILE_SPAN],
  [0, CITY_TILE_SPAN],
]

/** Distance clockwise around the frame from the top-left corner. */
const perimeterAt = ([x, y]: TilePoint): number => {
  const top = Math.abs(y)
  const right = Math.abs(x - CITY_TILE_SPAN)
  const bottom = Math.abs(y - CITY_TILE_SPAN)
  const left = Math.abs(x)
  const nearest = Math.min(top, right, bottom, left)
  if (nearest === top) return x
  if (nearest === right) return CITY_TILE_SPAN + y
  if (nearest === bottom) return 3 * CITY_TILE_SPAN - x
  return 4 * CITY_TILE_SPAN - y
}

/**
 * Push a chain's ends out to the frame edge along their own heading.
 *
 * Overpass clips ways at the bbox, so a coastline chain routinely BEGINS in
 * open space partway across the tile. Closing such a chain along the perimeter
 * cuts a wedge straight through the middle of the frame — the flood, in its
 * most obvious form. Extending first means the ends really are on the boundary
 * before any perimeter walk happens.
 */
const reachFrame = (chain: TilePoint[]): TilePoint[] => {
  const extend = (from: TilePoint, towards: TilePoint): TilePoint => {
    const dx = from[0] - towards[0]
    const dy = from[1] - towards[1]
    const reach = Math.hypot(dx, dy)
    if (!reach) return from
    // How far along the heading each frame edge lies; take the nearest ahead.
    const steps = [
      dx > 0 ? (CITY_TILE_SPAN - from[0]) / dx : dx < 0 ? -from[0] / dx : Infinity,
      dy > 0 ? (CITY_TILE_SPAN - from[1]) / dy : dy < 0 ? -from[1] / dy : Infinity,
    ].filter(step => step > 0)
    const step = Math.min(...steps)
    if (!Number.isFinite(step)) return from
    return [from[0] + dx * step, from[1] + dy * step]
  }

  const head = chain[0]
  const tail = chain.at(-1)!
  const onEdge = ([x, y]: TilePoint) =>
    x <= 1 || y <= 1 || x >= CITY_TILE_SPAN - 1 || y >= CITY_TILE_SPAN - 1
  return [
    ...(onEdge(head) ? [] : [extend(head, chain[1])]),
    ...chain,
    ...(onEdge(tail) ? [] : [extend(tail, chain.at(-2)!)]),
  ]
}

/** Frame corners passed walking clockwise from one edge point to another. */
const cornersBetween = (from: TilePoint, to: TilePoint): TilePoint[] => {
  const start = perimeterAt(from)
  const span = (perimeterAt(to) - start + 4 * CITY_TILE_SPAN) % (4 * CITY_TILE_SPAN)
  const walk: TilePoint[] = []
  for (let step = 0; step < 4; step++) {
    const corner = (step + 1) * CITY_TILE_SPAN
    const distance = (corner - start + 4 * CITY_TILE_SPAN) % (4 * CITY_TILE_SPAN)
    if (distance <= span) walk.push([CORNERS[(step + 1) % 4], distance] as never)
  }
  return (walk as unknown as [TilePoint, number][])
    .sort((a, b) => a[1] - b[1])
    .map(([corner]) => corner)
}

/**
 * The land side of every coastline chain in the tile, as closed rings.
 *
 * A chain that both begins and ends inside the frame is an island and closes on
 * itself. One that leaves the frame is closed along the boundary, in the
 * direction that keeps land on the left.
 */
const landRings = (chains: TilePoint[][]): TilePoint[][] => {
  const rings: TilePoint[][] = []

  for (const chain of chains) {
    if (Math.hypot(chain[0][0] - chain.at(-1)![0], chain[0][1] - chain.at(-1)![1]) < 1) {
      // An island: already closed. Land inside means a positive ring.
      rings.push(signedArea(chain) > 0 ? chain : [...chain].reverse())
      continue
    }

    const reached = reachFrame(chain)
    const from = reached.at(-1)!
    const to = reached[0]
    const closed = [...reached, ...cornersBetween(from, to), to]
    // Land on the left of the way means the closed ring runs clockwise in tile
    // space, where y grows downward — a negative shoelace area.
    rings.push(signedArea(closed) < 0 ? closed : [...closed].reverse())
  }

  return rings
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

  const shore = landRings(stitchChains(coastline, samePoint))

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
