import type { BufferGeometry } from 'three'

export interface MarkerPart {
  geometry: BufferGeometry
  color: string
  /** Opt out of the ink hull. For parts meeting another surface at a grazing
   *  angle, the inflated shell surfaces through the neighbour as black
   *  gashes — flush hardware (the lectern's mic mount) skips it. */
  outline?: boolean
  /** Stop the ink hull at the part's underside — for parts standing on
   *  another surface, where the hull below would poke out as teeth. */
  flatBase?: boolean
}

/**
 * Flat-shade a geometry by giving every face its own normals.
 *
 * three.js interpolates normals across a cone's sides, which is right for a
 * many-segment cone and wrong for a four-segment one: the toon ramp smears a
 * gradient over each triangle instead of lighting it as a facet, and the shape
 * reads as a soft blob. Markers share one material per colour (they are merged
 * into a handful of draw calls), so `flatShading` on the material is not
 * available — the fix has to live in the geometry.
 */
export const faceted = (geometry: BufferGeometry): BufferGeometry => {
  const flat = geometry.toNonIndexed()
  flat.computeVertexNormals()
  geometry.dispose()
  return flat
}
