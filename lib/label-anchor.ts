import { MAP_BOUNDS, MAP_PATHS, MAP_REGIONS, type MapCode } from '~~/data/map.gen'
import { labelBoxFor } from '~~/lib/geo'
import { largestRing, poleOfInaccessibility, type OutlinePoint } from '~~/lib/outline'

export interface LabelAnchor {
  point: OutlinePoint
  radius: number
}

/**
 * Where a country's name hangs, and how much room it has there. The pole of
 * inaccessibility, not the box centre: a box centre lands on the NEIGHBOUR for
 * any country that curves around another (Norway, Sweden, Chile, Croatia,
 * Vietnam), and errata's stage IS the labels.
 *
 * Memoized because the acronym register asks for ~150 of them in one go, and
 * the search is the expensive part of this whole feature: ~180ms desktop for
 * the full sweep, against ~10ms for a settle's overlap solve and 2.8ms for its
 * layout. The cache is module-level, so that sweep is once per SESSION and only in easy mode — accepted rather than
 * engineered away, because the alternative is handing the acronyms back their
 * box centres and Norway's "NO" back to Sweden.
 *
 * Rings are resampled to 128 points before the search (see ANCHOR_RING_POINTS).
 * Coarser budgets were measured: 96 and below still land inside every country,
 * but move some anchors ~48 units, where 128 reproduces the full-resolution
 * answer exactly. Not a trade worth the milliseconds.
 */
const anchorCache = new Map<string, LabelAnchor | undefined>()
export const labelAnchorFor = (code: MapCode): LabelAnchor | undefined => {
  if (anchorCache.has(code)) return anchorCache.get(code)

  const path = MAP_PATHS[code]
  const ring = path ? largestRing(path) : undefined
  const anchor = ring ? poleOfInaccessibility(ring) : undefined
  const box = labelBoxFor(MAP_BOUNDS[code], MAP_REGIONS[code])
  // No ring data (a code drawn from EXTRA_MAP_CODES): the box centre is all
  // there is, and its inscribed radius is unknown — call it half the shorter
  // side, which is what a rectangle would hold.
  const resolved =
    anchor ??
    (box
      ? {
          point: [box[0] + box[2] / 2, box[1] + box[3] / 2] as OutlinePoint,
          radius: Math.min(box[2], box[3]) / 2,
        }
      : undefined)
  anchorCache.set(code, resolved)
  return resolved
}
