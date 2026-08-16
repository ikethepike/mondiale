import { Mesh, MeshBasicMaterial, SphereGeometry, Vector3 } from 'three'

/** Every smoker on the board burns the same neutral gray — it must read
 *  against every biome's page tint. */
export const SMOKE_GRAY = '#9aa4ae'

export interface SmokePuffs {
  puffs: Mesh[]
  /** Cycle the puffs; `fade` thins the whole plume (the traverse train's
   *  sheet-edge exit). Callers gate reduced motion themselves — a parked
   *  plume is a prop, exactly like the vehicles under it. */
  animate: (time: number, fade?: number) => void
}

/**
 * The one puff idiom — spheres cycling up out of a stack, swelling and
 * thinning, trailing off as the source moves on — shared by the loco's
 * funnel and the hamlet's chimney so a smoke retune reaches every hearth.
 * `origin` is in the parent's local space; `drift` is where a cycle ends
 * relative to it.
 */
export const makeSmokePuffs = (
  count: number,
  origin: Vector3,
  drift: Vector3,
  options: { rate: number; radius: number; baseOpacity: number }
): SmokePuffs => {
  const { rate, radius, baseOpacity } = options
  const puffs: Mesh[] = []
  for (let index = 0; index < count; index++) {
    const puff = new Mesh(
      new SphereGeometry(radius, 8, 6),
      new MeshBasicMaterial({ color: SMOKE_GRAY, transparent: true, opacity: baseOpacity })
    )
    puff.position.copy(origin)
    puffs.push(puff)
  }
  const animate = (time: number, fade = 1) => {
    puffs.forEach((puff, index) => {
      const cycle = (time * rate + index / puffs.length) % 1
      puff.position.set(
        origin.x + drift.x * cycle,
        origin.y + drift.y * cycle,
        origin.z + drift.z * cycle
      )
      const swell = 0.6 + cycle * 1.6
      puff.scale.set(swell, swell, swell)
      ;(puff.material as MeshBasicMaterial).opacity = baseOpacity * (1 - cycle * cycle) * fade
    })
  }
  return { puffs, animate }
}
