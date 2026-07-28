import type { BufferGeometry } from 'three'
import { Vector3 } from 'three'

/** Inverted-hull copy of a part, inflated about its own local center — the
 *  ink outline recipe every board structure (markers, bridge, crowns) shares. */
export const outlineOf = (geometry: BufferGeometry): BufferGeometry => {
  const outline = geometry.clone()
  outline.computeBoundingBox()
  const center = new Vector3()
  outline.boundingBox?.getCenter(center)
  outline.translate(-center.x, -center.y, -center.z)
  outline.scale(1.07, 1.07, 1.07)
  outline.translate(center.x, center.y, center.z)
  return outline
}
