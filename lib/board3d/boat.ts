import Alea from 'alea'
import { Vector3 } from 'three'
import type { HeightSampler } from './terrain'
import type { PondSite } from './water'
import type { LakeSite } from './lake'

/**
 * A moored rowboat: one clinker skiff riding a board's still water — the
 * lake when one dealt (the grander mooring), otherwise the pond, offset
 * from the plank bridge. About half the eligible boards. Placement only.
 */
export interface BoatMooring {
  /** Boat position; y is the WATER surface it rides on. */
  position: Vector3
  yaw: number
}

const BOAT_CHANCE = 0.5
/** The keel needs real water under it. */
const MIN_DEPTH = 0.12

export const pickBoatMooring = (
  seed: string,
  pond: PondSite | undefined,
  lake: LakeSite | undefined,
  spacing: number,
  sampler: HeightSampler
): BoatMooring | undefined => {
  if (!pond && !lake) return undefined
  const random = Alea(`${seed}:boat`)
  if (random() >= BOAT_CHANCE) return undefined

  if (lake) {
    // Walk in from a seeded shore sample until the keel clears the bed —
    // moored close to shore, floating on honest depth.
    for (let attempt = 0; attempt < 12; attempt++) {
      const shore = lake.shore[Math.floor(random() * lake.shore.length)]
      const inward = Math.atan2(lake.center.x - shore.x, lake.center.z - shore.z)
      for (let step = 1; step <= 4; step++) {
        const x = shore.x + Math.sin(inward) * step * 0.8
        const z = shore.z + Math.cos(inward) * step * 0.8
        if (lake.waterY - sampler(x, z) >= MIN_DEPTH) {
          return {
            position: new Vector3(x, lake.waterY, z),
            // Lie roughly along the shoreline, with a mooring swing.
            yaw: inward + Math.PI / 2 + (random() - 0.5) * 0.6,
          }
        }
      }
    }
    return undefined
  }

  // Beside the bridge, off its axis, on the seeded side.
  if (pond) {
    const side = random() < 0.5 ? 1 : -1
    const axis = Math.atan2(pond.tangent.x, pond.tangent.z)
    const x = pond.center.x + Math.sin(axis + Math.PI / 2) * side * spacing * 0.55
    const z = pond.center.z + Math.cos(axis + Math.PI / 2) * side * spacing * 0.55
    if (pond.waterY - sampler(x, z) < MIN_DEPTH) return undefined
    return {
      position: new Vector3(x, pond.waterY, z),
      yaw: axis + (random() - 0.5) * 0.6,
    }
  }
  return undefined
}
