import type { BufferGeometry } from 'three'
import { Vector3 } from 'three'

/** Ink stroke thickness as a fraction of the caller's size unit (board
 *  spacing for markers and the bridge) — one token so every structure wears
 *  the same pen. */
export const OUTLINE_WIDTH_RATIO = 0.016

/** Positions closer than this (local units) weld to one shared normal. */
const WELD_EPSILON = 1e-3

/**
 * Inverted-hull copy of a part: every vertex pushed outward along a welded
 * smooth normal by a constant `width` — the ink outline recipe the board
 * structures (markers, bridge, crowns) share.
 *
 * Displacing along normals rather than scaling about the center is what keeps
 * the hull hugging non-convex parts (a curved tube, a crescent blade, a
 * concave-necked pot detach under a scaled copy), and the constant width is
 * what keeps the stroke uniform across big and small parts. Welding by
 * position first gives faceted, de-indexed geometry one normal per corner, so
 * the hull stays a closed skin instead of cracking open at every hard edge.
 * Index state is preserved: callers merge outlines per bucket, and
 * mergeGeometries refuses mixed indexed/non-indexed input.
 */
export const outlineOf = (geometry: BufferGeometry, width: number): BufferGeometry => {
  const outline = geometry.clone()
  if (!outline.attributes.normal) outline.computeVertexNormals()

  const positions = outline.attributes.position
  const normals = outline.attributes.normal

  const keyFor = (index: number) =>
    `${Math.round(positions.getX(index) / WELD_EPSILON)},${Math.round(
      positions.getY(index) / WELD_EPSILON
    )},${Math.round(positions.getZ(index) / WELD_EPSILON)}`

  const welded = new Map<string, Vector3>()
  for (let index = 0; index < positions.count; index++) {
    const key = keyFor(index)
    const sum = welded.get(key) ?? new Vector3()
    sum.x += normals.getX(index)
    sum.y += normals.getY(index)
    sum.z += normals.getZ(index)
    welded.set(key, sum)
  }
  for (const sum of welded.values()) {
    // Opposed normals can cancel (a zero sum); those vertices fall back to
    // their own normal below rather than collapsing to no offset at all.
    if (sum.lengthSq() > 1e-8) sum.normalize()
  }

  const fallback = new Vector3()
  for (let index = 0; index < positions.count; index++) {
    let direction = welded.get(keyFor(index))!
    if (direction.lengthSq() <= 1e-8) {
      direction = fallback.set(normals.getX(index), normals.getY(index), normals.getZ(index))
    }
    positions.setXYZ(
      index,
      positions.getX(index) + direction.x * width,
      positions.getY(index) + direction.y * width,
      positions.getZ(index) + direction.z * width
    )
  }

  return outline
}
