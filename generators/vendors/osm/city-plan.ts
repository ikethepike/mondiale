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
  clipChainToFrame,
  clipRingToFrame,
  closeSea,
  dropEnclosedBodies,
  countCrossings,
  countVertices,
  crossesWater,
  emitPath,
  haversineKm,
  isRing,
  lineLength,
  pointInRings,
  signedArea,
  simplifyLine,
  stitchChains,
  stitchDirected,
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
import { CITY_TILE_HEIGHT, CITY_TILE_SPAN } from '../../../lib/ground-plan'

/** A lone canal still has to be visible; a dense grid of them must not merge. */
const MINIMUM_WATER_LINE_WIDTH = 2
const MAXIMUM_WATER_LINE_WIDTH = 8

const FABRIC = new Set<string>(FABRIC_HIGHWAYS)
const ARTERIAL = new Set<string>(ARTERIAL_HIGHWAYS)
const RAIL = new Set<string>(RAILWAYS)

/** The emitted tile: one path per layer, plus what the reveal states. */
export interface CityPlanTile {
  /** Filled water bodies — rivers with real banks, lakes, docks. */
  waterFill: string
  /** Water too narrow to have banks: canals, minor rivers. */
  waterLine: string
  /** The sea: coastline chains closed along the frame, islands knocked out. */
  sea: string
  fabric: string
  arterials: string
  rail: string
  bridges: string
  green: string
  /** How wide a bank-less waterway draws, in tile units.
   *
   * Not a constant: a lone canal wants a stroke you can see, but Amsterdam's
   * run twenty metres apart and a fixed width painted the streets between them
   * as water. Sized from the tile's own spacing. */
  waterLineWidth: number
  /** Distinct water crossings — the reveal's bridge count. */
  crossings: number
  /** Street km per km², the coverage floor's score. */
  density: number
  vertices: number
  /** Share of the frame that is water — a sanity number for the report. */
  wet: number
  /** Share of street vertices that land in water. Bridges aside this should be
   *  ~zero; a real value here means the water geometry is wrong. */
  strandedStreets: number
}

const sameNode = (a: GeoPoint, b: GeoPoint): boolean =>
  Math.abs(a.lat - b.lat) < 1e-9 && Math.abs(a.lon - b.lon) < 1e-9

const closedGeo = (line: readonly GeoPoint[]): boolean =>
  line.length > 3 && sameNode(line[0], line.at(-1)!)

/**
 * A relation's rings for one role, stitched in GEO space by exact node
 * identity — before projection, before simplification, before anything.
 * Assembling in tile space invited two bugs at once: simplification moved the
 * joints, and Mälaren-sized rings were then clamped into garbage. An outer
 * that still fails to close is seamed shut with a straight edge — data-honest,
 * and far better than losing the waterbody whole.
 */
const relationRings = (element: OverpassElement, role: 'outer' | 'inner'): GeoPoint[][] => {
  const fragments = (element.members ?? [])
    .filter(
      member =>
        member.geometry && (role === 'inner' ? member.role === 'inner' : member.role !== 'inner')
    )
    .map(member => member.geometry!)
  const rings = stitchChains(fragments, sameNode)
  for (const ring of rings) {
    if (!closedGeo(ring) && ring.length > 3) ring.push(ring[0])
  }
  return rings.filter(closedGeo)
}

export const buildTile = (
  response: OverpassResponse,
  box: BoundingBox,
  { tolerance = SIMPLIFY_TOLERANCE }: { tolerance?: number } = {}
): CityPlanTile => {
  const project = tileProjection(box)
  const width = CITY_TILE_SPAN
  const height = CITY_TILE_HEIGHT

  const geoBodies: { outers: GeoPoint[][]; inners: GeoPoint[][] }[] = []
  const coastFragments: GeoPoint[][] = []
  const waterLineGeo: GeoPoint[][] = []
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

    if (tags.natural === 'coastline' && element.type === 'way' && element.geometry) {
      coastFragments.push(element.geometry)
      continue
    }
    if (tags.natural === 'water') {
      // Kept as one BODY per element, not pooled: overlap policy needs to know
      // which rings travel together (see dropEnclosedBodies).
      if (element.type === 'way' && element.geometry) {
        if (closedGeo(element.geometry)) geoBodies.push({ outers: [element.geometry], inners: [] })
        continue
      }
      if (element.type === 'relation') {
        geoBodies.push({
          outers: relationRings(element, 'outer'),
          inners: relationRings(element, 'inner'),
        })
        continue
      }
      continue
    }
    if (tags.waterway && element.type === 'way' && element.geometry) {
      waterLineGeo.push(element.geometry)
      continue
    }

    if (element.type !== 'way' || !element.geometry) continue
    const geometry = element.geometry
    const line = simplifyLine(geometry.map(project), tolerance)
    if (line.length < 2) continue

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

  // Project at full resolution, CLIP to the frame, and only then simplify.
  const toRing = (geo: readonly GeoPoint[]): TilePoint[] => {
    const clipped = clipRingToFrame(geo.map(project), width, height)
    return clipped.length ? simplifyLine(clipped, tolerance) : []
  }
  const bodies = dropEnclosedBodies(
    geoBodies
      .map(body => ({
        outers: body.outers.map(toRing).filter(ring => ring.length > 3),
        inners: body.inners.map(toRing).filter(ring => ring.length > 3),
      }))
      .filter(body => body.outers.length > 0)
  )
  const outerRings = bodies.flatMap(body => body.outers)
  const innerRings = bodies.flatMap(body => body.inners)

  // The coast: closed chains are islands or lagoons — their winding says which
  // — and open chains close along the frame into sea rings.
  const seaRings: TilePoint[][] = []
  const islandRings: TilePoint[][] = []
  const openPieces: TilePoint[][] = []
  for (const chain of stitchDirected(coastFragments, sameNode)) {
    if (closedGeo(chain)) {
      const ring = toRing(chain)
      if (ring.length > 3) (signedArea(ring) > 0 ? islandRings : seaRings).push(ring)
      continue
    }
    for (const piece of clipChainToFrame(chain.map(project), width, height)) {
      const slim = simplifyLine(piece, tolerance)
      if (slim.length > 1) openPieces.push(slim)
    }
  }
  seaRings.push(...closeSea(openPieces, width, height))
  // Islands with no open coast in frame sit in open sea, not on cream.
  if (islandRings.length && !seaRings.length) {
    seaRings.push([
      [0, 0],
      [width, 0],
      [width, height],
      [0, height],
      [0, 0],
    ])
  }

  const waterLine = waterLineGeo
    .flatMap(geo => clipChainToFrame(geo.map(project), width, height))
    .map(piece => simplifyLine(piece, tolerance))
    .filter(piece => piece.length > 1)

  const waterEdges = [...seaRings, ...islandRings, ...outerRings, ...innerRings, ...waterLine]

  // The bridge layer withholds ONLY water crossings. A 2km cut of central
  // London carries 171 bridge-tagged ways and 16 real crossings — withholding
  // the other 155 ordinary overpasses would punch the road network full of
  // holes miles from the river, and the frame would just look broken.
  const bridges: TilePoint[][] = []
  const spans: TilePoint[][] = []
  for (const { line, layer } of bridgeCandidates) {
    if (!crossesWater(line, waterEdges)) {
      layers[layer].push(line)
      continue
    }
    // Counted from the bare span and drawn from the padded one: padding two
    // neighbouring bridges until their decks touch would merge them into a
    // single crossing and understate the city.
    spans.push(waterSpan(line, waterEdges))
    bridges.push(waterSpan(line, waterEdges, BRIDGE_OVERHANG))
  }

  // A centreline drawn over a river that already has banks renders the Thames
  // as two shores plus a stripe down the middle, so a covered one is dropped.
  //
  // "Covered" has to mean MOSTLY INSIDE a water polygon, not merely touching
  // one: an Amsterdam canal meets the harbour at its mouth, and testing for
  // intersection threw the whole canal away for touching water at one end.
  // Herengracht, the Amstel and the Fontanka all vanished that way.
  const painted = [...outerRings, ...seaRings]
  const uncoveredWaterLine = waterLine.filter(line => {
    let inside = 0
    for (const point of line) if (pointInRings(painted, point)) inside++
    return inside <= line.length * 0.6
  })

  // How close the drawn waterways run to each other decides how wide they may
  // be drawn: half the nearest-neighbour spacing, so two parallel canals never
  // merge into one band of water with the street between them inside it.
  const waterLineWidth = (() => {
    const samples: TilePoint[] = []
    for (const line of uncoveredWaterLine) {
      for (let i = 0; i < line.length; i += 3) samples.push(line[i])
    }
    if (samples.length < 2) return MAXIMUM_WATER_LINE_WIDTH
    let closest = Infinity
    for (let i = 0; i < samples.length; i += 7) {
      for (let j = 0; j < samples.length; j += 7) {
        if (i === j) continue
        const gap = Math.hypot(samples[i][0] - samples[j][0], samples[i][1] - samples[j][1])
        if (gap > 1 && gap < closest) closest = gap
      }
    }
    if (!Number.isFinite(closest)) return MAXIMUM_WATER_LINE_WIDTH
    return Math.max(MINIMUM_WATER_LINE_WIDTH, Math.min(MAXIMUM_WATER_LINE_WIDTH, closest * 0.5))
  })()

  // Validation, not mechanism: the same even-odd parity the SVG fill uses,
  // probed against the frame (wet share) and against every street vertex —
  // streets in water means the water is wrong, and the report says so.
  const seaGroup = [...seaRings, ...islandRings]
  const fillGroup = [...outerRings, ...innerRings]
  const isWet = (point: TilePoint) =>
    pointInRings(seaGroup, point) || pointInRings(fillGroup, point)

  let wetSamples = 0
  let totalSamples = 0
  for (let y = 8; y < height; y += 16) {
    for (let x = 8; x < width; x += 16) {
      totalSamples++
      if (isWet([x, y])) wetSamples++
    }
  }

  let streetSamples = 0
  let strandedSamples = 0
  for (const line of [...layers.fabric, ...layers.arterials]) {
    for (let i = 0; i < line.length; i += 4) {
      const [x, y] = line[i]
      if (x < 0 || y < 0 || x > width || y > height) continue
      streetSamples++
      if (isWet(line[i])) strandedSamples++
    }
  }

  const all = [
    ...fillGroup,
    ...uncoveredWaterLine,
    ...seaGroup,
    ...green,
    ...layers.fabric,
    ...layers.arterials,
    ...layers.rail,
    ...bridges,
  ]

  return {
    waterFill: emitPath(fillGroup, true),
    waterLine: emitPath(uncoveredWaterLine),
    sea: emitPath(seaGroup, true),
    fabric: emitPath(layers.fabric),
    arterials: emitPath(layers.arterials),
    rail: emitPath(layers.rail),
    bridges: emitPath(bridges),
    green: emitPath(green, true),
    waterLineWidth: Number(waterLineWidth.toFixed(1)),
    crossings: countCrossings(spans),
    density: streetDensity(streetKm, box),
    vertices: countVertices(all),
    wet: totalSamples ? wetSamples / totalSamples : 0,
    strandedStreets: streetSamples ? strandedSamples / streetSamples : 0,
  }
}
