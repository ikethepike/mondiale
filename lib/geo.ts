import { COUNTRIES } from '~~/data/countries.gen'
import { clamp } from '~~/lib/number'
import type { ISOCountryCode } from '~~/types/geography.types'

export interface LatLng {
  lat: number
  lng: number
}

/** Parse the factbook coordinate strings, e.g. "62 00 N, 15 00 E". */
const parseCoordinates = (raw: string | undefined): LatLng | undefined => {
  if (!raw) return undefined
  const match = raw.match(/(\d+)\s+(\d+)\s*([NS])\s*,\s*(\d+)\s+(\d+)\s*([EW])/i)
  if (!match) return undefined

  const lat = (Number(match[1]) + Number(match[2]) / 60) * (match[3].toUpperCase() === 'S' ? -1 : 1)
  const lng = (Number(match[4]) + Number(match[5]) / 60) * (match[6].toUpperCase() === 'W' ? -1 : 1)
  return { lat, lng }
}

export const countryLatLng = (isoCode: ISOCountryCode): LatLng | undefined =>
  parseCoordinates(COUNTRIES[isoCode]?.coordinates)

const toRadians = (degrees: number) => (degrees * Math.PI) / 180
const toDegrees = (radians: number) => (radians * 180) / Math.PI

/** ONE sphere for every great-circle formula in this module — offsetKm is
 *  haversineKm's inverse, and two radii would break the round trip. */
const EARTH_RADIUS_KM = 6371

/** Great-circle distance in kilometres. */
export const haversineKm = (a: LatLng, b: LatLng): number => {
  const earthRadiusKm = EARTH_RADIUS_KM
  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** The point `km` from `origin` along `bearingDeg` (clockwise from north) —
 *  haversineKm's inverse, on the same sphere, so a scatter composed here
 *  grades back to (approximately) the distance it was thrown. */
export const offsetKm = (origin: LatLng, km: number, bearingDeg: number): LatLng => {
  const angular = km / EARTH_RADIUS_KM
  const bearing = toRadians(bearingDeg)
  const lat1 = toRadians(origin.lat)
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing)
  )
  const lng2 =
    toRadians(origin.lng) +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2)
    )
  return { lat: toDegrees(lat2), lng: ((toDegrees(lng2) + 540) % 360) - 180 }
}

/** Initial bearing from a to b, degrees clockwise from north. */
export const bearingDegrees = (a: LatLng, b: LatLng): number => {
  const dLng = toRadians(b.lng - a.lng)
  const y = Math.sin(dLng) * Math.cos(toRadians(b.lat))
  const x =
    Math.cos(toRadians(a.lat)) * Math.sin(toRadians(b.lat)) -
    Math.sin(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.cos(dLng)
  return (toDegrees(Math.atan2(y, x)) + 360) % 360
}

const COMPASS_POINTS = [
  'north',
  'north-east',
  'east',
  'south-east',
  'south',
  'south-west',
  'west',
  'north-west',
]

export const compassLabel = (bearing: number): string =>
  COMPASS_POINTS[Math.round(bearing / 45) % 8]

const COMPASS_ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖']

/** "12.5°N, 3.2°E" — the one lat/lng display format (views and harnesses alike). */
export const formatLatLng = ({ lat, lng }: LatLng): string =>
  `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(1)}°${lng >= 0 ? 'E' : 'W'}`

export const compassArrow = (bearing: number): string =>
  COMPASS_ARROWS[Math.round(bearing / 45) % 8]

// --- Projected map-space boxes -------------------------------------------------

/** An axis-aligned box in the map's projected SVG space: [x, y, width, height]. */
export type MapBox = [number, number, number, number]

/** The world map's design frame (the parsed MAP_VIEWBOX from data/map.gen) —
 *  the one place its 2000×1001 dimensions live outside generated data. */
export const WORLD_BOX: { x: number; y: number; width: number; height: number } = {
  x: 0,
  y: 0,
  width: 2000,
  height: 1001,
}

/**
 * A country's map-space bbox must clear this on at least one axis to carry a
 * written name — below it the label outgrows the country it points at. The
 * map's label builder skips the specks; any dealer that writes names onto the
 * map (errata) must draw from the same set, or it deals a question whose
 * subject never renders.
 */
export const LABELABLE_BOX_UNITS = 14

/** Can this map-space box carry a written label? Narrows, so a caller that
 *  clears the gate can read the box without a second existence check. */
export const isLabelableBox = (box: MapBox | undefined): box is MapBox =>
  !!box && (box[2] >= LABELABLE_BOX_UNITS || box[3] >= LABELABLE_BOX_UNITS)

/**
 * A country's mainland box. The whole-country bbox lies for RU/US-class
 * countries — antimeridian fragments stretch it across the map, putting the
 * US centre closer to Russia than to Canada. MAP_REGIONS emits per-ring boxes
 * sorted largest-first, so the mainland is ring 0; `fallback` (usually
 * MAP_BOUNDS) covers countries with no ring data.
 */
export const mainlandBox = <T extends MapBox | undefined>(
  rings: MapBox[] | undefined,
  fallback: T
): MapBox | T => rings?.[0] ?? fallback

/**
 * The box to hang a written name in the middle of — ALWAYS the mainland ring
 * where there is one, which is a stricter rule than framing uses.
 *
 * A camera can afford the whole-country bbox until it world-fits, so
 * `frameBoxFor` only swaps in the mainland past half the map's width. A label
 * cannot: it is a point, not a window, and any outlying territory drags that
 * point off the country. Russia's bbox is world-spanning and puts "Russia" in
 * the Baltic, but Chile's is merely 281 units wide — nowhere near the framing
 * threshold — and Easter Island still drags its anchor into the open Pacific.
 * Ring 0 is the largest landmass, so its centre is on the country itself.
 */
export const labelBoxFor = (
  bounds: MapBox | undefined,
  rings: MapBox[] | undefined
): MapBox | undefined => mainlandBox(rings, bounds)

/** The inscribed radius a logo is sized AGAINST — roughly the median dealable
 *  country (Hungary 6.4, Bulgaria 7.0, Serbia 5.4). A country at this radius
 *  gets exactly `LOGO_BASE_SIDE`. */
const LOGO_REFERENCE_RADIUS = 8
/** The equal-area edge at the reference radius, in map units. */
const LOGO_BASE_SIDE = 22
/**
 * Fractional power on the radius. At 1.0 the country-size term dominates and a
 * lineup's largest member swamps its smallest — Romania read 5.3x North
 * Macedonia BY AREA in one frame, which turns size into a cue pointing at an
 * answer. 0.35 keeps the ordering (a big country still reads bigger) while
 * holding a 3-6 country cluster inside one visual weight class.
 */
const LOGO_RADIUS_EXPONENT = 0.35
/** The band, deliberately narrow: 1.5x linear / 2.25x area end to end. The old
 *  13/40 band was 3.1x linear / 9.5x area, which is what let one member of a
 *  cluster become the salient answer. */
export const LOGO_MIN_SIDE = 18
export const LOGO_MAX_SIDE = 27
/** Ratios outside this are artwork, not information: a 15:1 banner drawn at
 *  equal area is a hairline. p90 of the roster is 3.35, so 4.0 covers all but
 *  the extremes while keeping the widest wordmarks legible. */
export const LOGO_MIN_RATIO = 0.4
export const LOGO_MAX_RATIO = 4.0

/**
 * The box a party logo is drawn into, in map units — the Rulers stage's one
 * sizing rule, kept here (not in the map component) so it can be swept.
 *
 * Two things have to be neutralised, because on the map they COMPOUND:
 *
 *  - the country's size. Sized straight off the inscribed radius, Romania's
 *    mark outweighed North Macedonia's 5.3x by area inside a single frame.
 *  - the artwork's shape. Logos are raster, width-capped but height-free, so
 *    their ratios run 0.44 to 15. Fitted with `meet` into a SQUARE box a wide
 *    wordmark paints under a third of the area a square crest does.
 *
 * So `side` is the edge of the EQUAL-AREA square, and the returned box is that
 * area redistributed along the artwork's own ratio: `width * height === side²`
 * by construction. `side` therefore remains exactly the quantity the caption
 * chip reasons about, at every ratio.
 *
 * The ratio clamp is what the box is BUILT from, and past it the artwork can no
 * longer be fitted with `meet`: a 4:1 box holding 15:1 art letterboxes to a
 * quarter of its own area, silently undoing the equalisation the clamp exists
 * to protect (France's 15:1 banner measured 194 against a 324 floor). Callers
 * must read `clipped` — when it is true the mark is over-shape for any box that
 * holds equal area, and the renderer has to fill instead of fit. See
 * `logoFit`, which is the one place that decision is made.
 */
export const logoBox = (
  radius: number,
  ratio?: number
): { width: number; height: number; side: number; clipped: boolean } => {
  const side = clamp(
    LOGO_BASE_SIDE * (Math.max(0, radius) / LOGO_REFERENCE_RADIUS) ** LOGO_RADIUS_EXPONENT,
    LOGO_MIN_SIDE,
    LOGO_MAX_SIDE
  )
  // A missing or junk ratio falls back to a square — a stale `.gen` degrades to
  // the old geometry rather than painting NaN attributes and blanking the mark.
  const safe = ratio && Number.isFinite(ratio) && ratio > 0 ? ratio : 1
  const held = clamp(safe, LOGO_MIN_RATIO, LOGO_MAX_RATIO)
  const stretch = Math.sqrt(held)
  return { width: side * stretch, height: side / stretch, side, clipped: held !== safe }
}

/**
 * The `preserveAspectRatio` a logo must be drawn with, given its box.
 *
 * `meet` (fit whole, letterbox the slack) is right for everything inside the
 * ratio clamp — the box already carries the artwork's own shape, so there is no
 * slack to letterbox and the mark paints its full equal-area allowance.
 *
 * Past the clamp `meet` is what BREAKS the equalisation, so those marks get
 * `slice`: the box is filled and the overflow is cropped. The trade is
 * deliberate and it is the lesser loss — a 15:1 banner shown whole at equal
 * area is a 2-unit hairline nobody can read, whereas cropping its long tail
 * leaves the head of the wordmark legible at the same weight as its neighbours.
 * Only the ~1% of the roster past the clamp is affected.
 */
export const logoFit = (clipped: boolean): 'xMidYMid meet' | 'xMidYMid slice' =>
  clipped ? 'xMidYMid slice' : 'xMidYMid meet'

/**
 * How a logo actually paints inside its box — the area the PLAYER sees, which
 * is what the equal-area promise is about. Exported for the sweep so it asserts
 * on the painted result rather than on the box the map hands the renderer.
 */
/** How hard a crowded pair is pushed apart per pass, as a share of the overlap.
 *  Under 1 so neighbours settle between competing pushes instead of jittering. */
const LOGO_RELAX_RATE = 0.6
/**
 * Clear air demanded between two marks, as a share of their mean span.
 *
 * Touching is NOT separated. Party logos are transparent wordmarks whose
 * letterforms read as one shape with whatever sits beside them, so boxes
 * relaxed to a 0.1-unit hairline still showed SDS running through Die
 * Volkspartei — mathematically apart, visually a collision. The relaxation
 * therefore treats a pair as crowded until this much air stands between them.
 */
const LOGO_BREATHING_ROOM = 0.16
/** Passes of the relaxation. A 3-6 mark cluster settles well inside this; the
 *  loop also breaks the moment nothing overlaps. */
const LOGO_RELAX_PASSES = 60
/**
 * How far a mark may be pushed off its own anchor, as a share of its own span.
 *
 * The binding constraint, and worth stating: a logo is an ANSWER about the
 * country under it, so drift is what stops a mark sliding onto the neighbour
 * and asking the wrong question. But too TIGHT a cap is its own bug — at 0.45
 * the Alps and the Low Countries could not solve at all and kept ~15% of their
 * pile, which is what put SDS across Die Volkspartei.
 *
 * Kept MODEST on purpose. Drift is the wrong tool for a frame that is simply
 * over-subscribed: pushed far enough to separate the Alps, Czechia's mark left
 * Czechia and slid under the prompt card, which trades a crowding bug for a
 * wrong-country one. Room comes from `fitLogoScale` shrinking the lineup;
 * drift only takes up the slack once the marks already fit.
 */
const LOGO_MAX_DRIFT = 0.35

/**
 * Push a crowded lineup's boxes apart, in map units.
 *
 * The marks are anchored on poles of inaccessibility, which in a tight
 * neighbourhood (the Alps, the Balkans) sit closer together than the artwork is
 * wide — so equalising their sizes leaves them legibly weighted but piled on
 * each other. This is the separation pass, not a sizing one: every box keeps
 * the area `logoBox` gave it and only MOVES.
 *
 * Movement is capped at `LOGO_MAX_DRIFT` of the box's own width, because a mark
 * that slides clear of the pile but onto its neighbour has turned a crowded
 * question into a wrong one.
 *
 * Moving alone is not always enough. Five Alpine anchors sit inside ~30 map
 * units of each other while each equal-area box is ~29 wide: no arrangement of
 * those boxes is overlap-free, so a pure push would shove marks off their
 * countries and STILL leave a pile. A frame that cannot be solved by moving
 * therefore shrinks — every mark by the SAME factor, so the lineup stays
 * equally weighted and only gets smaller together.
 *
 * Deterministic and order-independent: pushes are accumulated per pass and
 * applied together, so the same lineup always settles the same way.
 */
/** A lineup never shrinks past this share of the sizes `logoBox` chose — a
 *  frame of unreadable specks is a worse answer than a slightly tight one. */
const LOGO_MIN_SCALE = 0.5

/**
 * How much a whole lineup must shrink before its marks can sit apart.
 *
 * The Alps are not a tuning problem, they are an over-subscribed frame:
 * Slovenia's equal-area mark is 231% of Slovenia, Czechia's is 80% of Czechia,
 * and the five together want a third of the entire camera. No amount of pushing
 * fixes that — past a point drift only buys separation by shoving marks off
 * their own countries.
 *
 * So the lineup shrinks TOGETHER, by one factor, which is what keeps the
 * equal-area promise intact: the marks stay weighted identically to each other
 * and simply get smaller.
 *
 * The factor is found by SEARCH rather than algebra. Whether a lineup settles
 * depends on the relaxation actually converging under its drift cap, which no
 * closed form over pairs captures — every derivation attempted here was
 * optimistic (it assumed both marks of a pair spend their full drift toward
 * each other, which the other pairs forbid) and left the frame overlapping.
 * Bisection asks the real question instead: run the settle, look at the result.
 */
export const fitLogoScale = (
  placements: { x: number; y: number; width: number; height: number }[]
): number => {
  if (placements.length < 2) return 1
  if (settlesCleanly(placements, 1)) return 1
  // Nothing inside the band works: take the floor rather than the ceiling. The
  // bisection below only ever narrows toward a scale KNOWN to settle, so
  // without this the most crowded frame in the roster — the one that needs the
  // shrink most — would fall through and be drawn at full size.
  if (!settlesCleanly(placements, LOGO_MIN_SCALE)) return LOGO_MIN_SCALE

  // INVARIANT: `fits` always settles, `tooBig` never does. Both are now known
  // (the two guards above proved them), so the midpoint search can only ever
  // return a scale that has been verified to settle.
  let fits = LOGO_MIN_SCALE
  let tooBig = 1
  // ~1% precision is finer than the eye reads at these sizes.
  for (let step = 0; step < 7; step += 1) {
    const middle = (fits + tooBig) / 2
    if (settlesCleanly(placements, middle)) fits = middle
    else tooBig = middle
  }
  return fits
}

/** Run the settle at one scale. The single implementation the bisection probes
 *  and the public pass returns, so the scale chosen is always the scale drawn. */
const settleAt = <T extends { x: number; y: number; width: number; height: number }>(
  placements: T[],
  scale: number
): T[] => {
  const settled = placements.map(placement => ({
    ...placement,
    width: placement.width * scale,
    height: placement.height * scale,
  }))
  const origins = settled.map(({ x, y }) => ({ x, y }))

  for (let pass = 0; pass < LOGO_RELAX_PASSES; pass += 1) {
    const pushes = settled.map(() => ({ x: 0, y: 0 }))
    let crowded = false

    for (let a = 0; a < settled.length; a += 1) {
      for (let b = a + 1; b < settled.length; b += 1) {
        const one = settled[a]!
        const two = settled[b]!
        // The demanded gap rides on the pair's own size, so a big mark keeps
        // proportionally more air than a small one.
        const airX = ((one.width + two.width) / 2) * LOGO_BREATHING_ROOM
        const airY = ((one.height + two.height) / 2) * LOGO_BREATHING_ROOM
        const overlapX = (one.width + two.width) / 2 + airX - Math.abs(one.x - two.x)
        const overlapY = (one.height + two.height) / 2 + airY - Math.abs(one.y - two.y)
        if (overlapX <= 0 || overlapY <= 0) continue
        crowded = true

        // Separate along the SHALLOWER axis — the shortest way out of the
        // overlap, which keeps a mark closest to the country it belongs to.
        if (overlapX < overlapY) {
          // Co-incident anchors have no direction to escape along; break the
          // tie by index so the result stays deterministic.
          const away = one.x === two.x ? (a < b ? -1 : 1) : Math.sign(one.x - two.x)
          const shift = (overlapX / 2) * LOGO_RELAX_RATE * away
          pushes[a]!.x += shift
          pushes[b]!.x -= shift
        } else {
          const away = one.y === two.y ? (a < b ? -1 : 1) : Math.sign(one.y - two.y)
          const shift = (overlapY / 2) * LOGO_RELAX_RATE * away
          pushes[a]!.y += shift
          pushes[b]!.y -= shift
        }
      }
    }
    if (!crowded) break

    for (let index = 0; index < settled.length; index += 1) {
      const placement = settled[index]!
      const origin = origins[index]!
      // Per-axis: a wide wordmark may travel further sideways than it may
      // vertically, because that is the direction its own box already spans.
      const limitX = placement.width * LOGO_MAX_DRIFT
      const limitY = placement.height * LOGO_MAX_DRIFT
      placement.x = clamp(placement.x + pushes[index]!.x, origin.x - limitX, origin.x + limitX)
      placement.y = clamp(placement.y + pushes[index]!.y, origin.y - limitY, origin.y + limitY)
    }
  }
  return settled
}

/** Did this scale leave every pair with its breathing room? */
const settlesCleanly = (
  placements: { x: number; y: number; width: number; height: number }[],
  scale: number
): boolean => {
  const settled = settleAt(placements, scale)
  for (let a = 0; a < settled.length; a += 1) {
    for (let b = a + 1; b < settled.length; b += 1) {
      const one = settled[a]!
      const two = settled[b]!
      const spanX = (one.width + two.width) / 2
      const spanY = (one.height + two.height) / 2
      const gapX = Math.abs(one.x - two.x) - spanX
      const gapY = Math.abs(one.y - two.y) - spanY
      // Clearing EITHER axis separates the pair; the air is measured against
      // the smaller span so a wide mark cannot claim room it does not have.
      const air = Math.min(spanX, spanY) * LOGO_BREATHING_ROOM
      if (Math.max(gapX, gapY) < air) return false
    }
  }
  return true
}

/**
 * Size and place a lineup's marks so none of them collides.
 *
 * Shrink first, then push: pushing a lineup that cannot fit only moves the
 * problem onto the neighbours' countries.
 */
export const relaxLogoPlacements = <
  T extends { x: number; y: number; width: number; height: number },
>(
  placements: T[]
): T[] => settleAt(placements, fitLogoScale(placements))

export const logoPaintedArea = (radius: number, ratio?: number): number => {
  const { width, height, clipped } = logoBox(radius, ratio)
  // `slice` fills the box; `meet` fits inside it. Inside the clamp the box IS
  // the artwork's shape, so the two agree — the branch only parts at the tail.
  if (clipped) return width * height
  const safe = ratio && Number.isFinite(ratio) && ratio > 0 ? ratio : 1
  const drawnHeight = Math.min(width / safe, height)
  return drawnHeight * drawnHeight * safe
}

/** The opening crop as a fraction of the country's own end frame. */
const TIGHT_FRACTION = 0.13
/** Absolute deep-zoom ceiling. A fixed fraction of the frame alone breaks for
 *  huge countries — 13% of Russia's frame is still half the planet — so every
 *  country gets a comparably tight sliver regardless of its size. */
const TIGHT_MAX_SPAN = WORLD_BOX.width / 18
/** Geometry-legibility floor: below this the crop outruns the map's detail. */
const TIGHT_MIN_SPAN = WORLD_BOX.width / 200
/** At least one axis must show less than this much of the country. */
const COUNTRY_MAX_VISIBLE = 0.6
/** How far past the inscribed circle the crop must reach to catch an edge. */
const COASTLINE_REACH = 1.15

/**
 * The zoom-out gate's opening crop: a tight box on the country's own land.
 *
 * Anchored on the caller's `anchor` — NOT on the end frame's centre. That frame
 * is BERTHED (deliberately off-centre so the subject clears the typing console),
 * and inheriting its offset opened the gate on the neighbour: Estonia's crop
 * landed wholly inside Latvia, and with the software keyboard up EVERY country
 * opened on a frame holding none of itself.
 *
 * `anchor` is the pole of inaccessibility — a point guaranteed to be on the
 * country, with the inscribed circle's radius — so the crop always contains
 * target land while still cropping the shape hard enough to keep the question.
 *
 * Sized against the frame's LARGER dimension: on a portrait screen the frame is
 * tall, and a width-based crop would span enough latitude to show the whole
 * country plus its neighbours.
 */
export const zoomOutStartView = (
  mainland: MapBox,
  anchor: { point: readonly [number, number]; radius: number },
  endSpan: number,
  viewAspect: number
): { x: number; y: number; width: number; height: number } => {
  let startSpan = Math.min(endSpan * TIGHT_FRACTION, TIGHT_MAX_SPAN)

  // Small countries (The Gambia) are dwarfed by the frame's minimum padding, so
  // a fraction of THAT frame still contains them whole and the shape gives the
  // answer away at the first frame. Shrink until one axis crops the country —
  // one is enough: a crop across the narrow axis hides the outline just as well.
  const [, , mainlandWidth, mainlandHeight] = mainland
  const shrink = Math.max(
    (mainlandWidth * COUNTRY_MAX_VISIBLE) / (startSpan * Math.min(1, viewAspect)),
    (mainlandHeight * COUNTRY_MAX_VISIBLE) / (startSpan * Math.min(1, 1 / viewAspect))
  )
  startSpan = Math.max(startSpan * Math.min(1, shrink), TIGHT_MIN_SPAN)

  let width = startSpan * Math.min(1, viewAspect)
  let height = width / viewAspect

  // Reach past the inscribed circle, or a wide interior (the US, Australia,
  // Sudan) opens on uniform fill with no coastline or border anywhere in it —
  // nothing to read and nothing to guess. The pole is BY DEFINITION the point
  // furthest from any edge, so the crop has to out-reach its own circle.
  //
  // This deliberately outranks the deep-zoom ceiling: a frame that shows a
  // border is what makes the round playable, and a slightly wider crop on the
  // handful of countries with a vast interior beats a blank one.
  // Measured on the SHORTER half-axis, not the diagonal: a box whose corners
  // just clear the circle still has all four of its sides inside it, and the
  // frame stays solid fill.
  const grow = (anchor.radius * COASTLINE_REACH) / Math.min(width / 2, height / 2)
  if (grow > 1) {
    width *= grow
    height *= grow
  }
  return {
    x: anchor.point[0] - width / 2,
    y: anchor.point[1] - height / 2,
    width,
    height,
  }
}

// --- Robinson projection ------------------------------------------------------
//
// data/map.gen.ts stores SVG paths already projected through d3's geoRobinson
// at MAP_PROJECTION's scale/translate. Turning a click on that map back into a
// lat/lng needs the inverse. Ported from d3-geo-projection's robinsonRaw so the
// ~1MB projection library stays a build-time devDependency and never reaches
// the client bundle. Verified against d3 to ~1e-13 degrees.

/** d3's Robinson coefficients: [x-scale, y-scale] at 5° steps from -5° to 90°. */
const ROBINSON_K: [number, number][] = [
  [0.9986, -0.062],
  [1.0, 0.0],
  [0.9986, 0.062],
  [0.9954, 0.124],
  [0.99, 0.186],
  [0.9822, 0.248],
  [0.973, 0.31],
  [0.96, 0.372],
  [0.9427, 0.434],
  [0.9216, 0.4958],
  [0.8962, 0.5571],
  [0.8679, 0.6176],
  [0.835, 0.6769],
  [0.7986, 0.7346],
  [0.7597, 0.7903],
  [0.7186, 0.8435],
  [0.6732, 0.8936],
  [0.6213, 0.9394],
  [0.5722, 0.9761],
  [0.5322, 1.0],
].map(([x, y]) => [x, y * 1.593415793900743]) as [number, number][]

/**
 * Robinson forward, in d3's unprojected unit space (`geoRobinson().scale(1)`
 * before its own radians conversion). `lambda`/`phi` are radians.
 */
const robinsonRaw = (lambda: number, phi: number): [number, number] => {
  const i = Math.min(18, (Math.abs(phi) * 36) / Math.PI)
  const i0 = Math.floor(i)
  const di = i - i0

  const [ax, ay] = ROBINSON_K[i0]
  const [bx, by] = ROBINSON_K[i0 + 1]
  const [cx, cy] = ROBINSON_K[Math.min(19, i0 + 2)]

  return [
    lambda * (bx + (di * (cx - ax)) / 2 + ((di * di) / 2) * (cx - 2 * bx + ax)),
    Math.sign(phi) * (by + (di * (cy - ay)) / 2 + ((di * di) / 2) * (cy - 2 * by + ay)),
  ]
}

export interface MapProjection {
  scale: number
  translate: [number, number]
}

/** Project lat/lng into the map's SVG viewBox coordinates. */
export const projectRobinson = (
  { lat, lng }: LatLng,
  projection: MapProjection
): { x: number; y: number } => {
  const [unitX, unitY] = robinsonRaw((lng * Math.PI) / 180, (lat * Math.PI) / 180)
  const [translateX, translateY] = projection.translate
  return {
    x: translateX + unitX * projection.scale,
    y: translateY - unitY * projection.scale,
  }
}

/**
 * Invert a point in the map's SVG viewBox coordinates back to lat/lng.
 *
 * Robinson has no closed form, so latitude is bisected against the forward
 * function (y depends on latitude alone); longitude then falls out directly,
 * since x is linear in it once the latitude's x-coefficient is known.
 *
 * Returns undefined for points outside the projection's silhouette — the
 * corners of the viewBox are not on the globe.
 */
export const invertRobinson = (
  x: number,
  y: number,
  projection: MapProjection
): LatLng | undefined => {
  const [translateX, translateY] = projection.translate
  const unitX = (x - translateX) / projection.scale
  // SVG y grows downward; the projection's does not.
  const unitY = (translateY - y) / projection.scale

  let low = -Math.PI / 2
  let high = Math.PI / 2
  for (let iteration = 0; iteration < 64; iteration++) {
    const mid = (low + high) / 2
    if (robinsonRaw(0, mid)[1] < unitY) low = mid
    else high = mid
  }
  const phi = (low + high) / 2

  // Recover the x-coefficient at this latitude, then divide out.
  const unitAtOneRadian = robinsonRaw(1, phi)[0]
  if (!unitAtOneRadian) return undefined
  const lambda = unitX / unitAtOneRadian

  const lat = (phi * 180) / Math.PI
  const lng = (lambda * 180) / Math.PI
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return undefined
  return { lat, lng }
}
