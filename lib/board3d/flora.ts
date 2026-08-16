import Alea from 'alea'
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from 'three'
import { prefersReducedMotion } from '~~/lib/motion'
import type { BoardBiome } from './biomes'
import type { HeightSampler } from './terrain'
import type { TilePathResult } from './path'
import type { PondSite } from './water'
import type { SummitSite } from './summit'
import type { RiverPath } from './river'
import type { LakeSite } from './lake'
import type { TownSite } from './town'

/**
 * The board's living layer, proven in /test-terrain: blade grass grown as a
 * moisture-thickened carpet, biome props (trees / desert spires / ice
 * shards) swaying in a wind whose phase travels through the field, and gull
 * flocks orbiting overhead — every animation pure vertex-shader steering.
 * Everything keeps clear of the track, and reduced motion stills the wind
 * and grounds the birds at build time.
 */

/** Wind-swayed flat-color material shared by props and their trunks (and
 *  the basecamp's pennant — anything on the wind clock). Instancing-only:
 *  the shader reads instanceMatrix, so even a single flag rides an
 *  InstancedMesh of count 1. */
export const windMaterial = (
  color: string,
  sway: number,
  timeUniforms: { value: number }[]
) => {
  const material = new ShaderMaterial({
    side: DoubleSide,
    uniforms: { uColor: { value: new Color(color) }, uTime: { value: 0 }, uSway: { value: sway } },
    vertexShader: /* glsl */ `
      attribute float aPhase;
      uniform float uTime; uniform float uSway;
      varying float vShade;
      void main() {
        vec3 p = position;
        float reach = pow(max(p.y, 0.0), 1.3);
        vec3 origin = vec3(instanceMatrix[3]);
        float gust =
          sin(uTime * 1.3 + origin.x * 0.11 + origin.z * 0.07) +
          0.5 * sin(uTime * 2.1 + origin.x * 0.23 + aPhase) +
          0.25 * sin(uTime * 3.4 + aPhase * 2.0);
        p.x += gust * reach * uSway;
        p.z += gust * reach * uSway * 0.35;
        vShade = 0.88 + 0.12 * sin(aPhase * 3.7);
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vShade;
      void main() {
        gl_FragColor = vec4(uColor * vShade, 1.0);
        #include <colorspace_fragment>
      }
    `,
  })
  timeUniforms.push(material.uniforms.uTime as { value: number })
  return material
}

/** One tapered blade, bowed in the shader — never crossed quads. */
const bladeMaterial = (
  root: Color,
  tip: Color,
  sway: number,
  timeUniforms: { value: number }[]
) => {
  const material = new ShaderMaterial({
    side: DoubleSide,
    uniforms: {
      uRoot: { value: root },
      uTip: { value: tip },
      uTime: { value: 0 },
      uSway: { value: sway },
    },
    vertexShader: /* glsl */ `
      attribute float aPhase;
      uniform float uTime; uniform float uSway;
      varying float vT; varying float vShade;
      void main() {
        vec3 p = position;
        float t = p.y;
        vec3 origin = vec3(instanceMatrix[3]);
        float gust =
          sin(uTime * 1.3 + origin.x * 0.11 + origin.z * 0.07) +
          0.5 * sin(uTime * 2.1 + origin.x * 0.23 + aPhase) +
          0.3 * sin(uTime * 3.7 + aPhase * 2.0);
        float bow = gust * uSway + 0.12 * sin(aPhase * 7.0);
        p.x += bow * t * t;
        p.z += bow * 0.35 * t * t;
        vT = t;
        vShade = 0.86 + 0.14 * sin(aPhase * 3.1);
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uRoot; uniform vec3 uTip;
      varying float vT; varying float vShade;
      void main() {
        gl_FragColor = vec4(mix(uRoot, uTip, vT) * vShade, 1.0);
        #include <colorspace_fragment>
      }
    `,
  })
  timeUniforms.push(material.uniforms.uTime as { value: number })
  return material
}

const bladeGeometry = () => {
  const geometry = new BufferGeometry()
  // prettier-ignore
  const vertices = new Float32Array([
    -0.05, 0, 0,   0.05, 0, 0,   0.032, 0.55, 0,
    -0.05, 0, 0,   0.032, 0.55, 0,   -0.032, 0.55, 0,
    -0.032, 0.55, 0,   0.032, 0.55, 0,   0, 1, 0,
  ])
  geometry.setAttribute('position', new BufferAttribute(vertices, 3))
  return geometry
}

/** Gull "m" chevron: two-segment wings, tips flagged for the flap. */
const birdGeometry = () => {
  const geometry = new BufferGeometry()
  // prettier-ignore
  const vertices = new Float32Array([
    0, 0.02, 0.32,   -0.62, 0.3, 0.02,   -0.5, 0.16, -0.28,
    -0.62, 0.3, 0.02,   -1.45, 0.08, -0.42,   -0.5, 0.16, -0.28,
    0, 0.02, 0.32,   0.5, 0.16, -0.28,   0.62, 0.3, 0.02,
    0.62, 0.3, 0.02,   0.5, 0.16, -0.28,   1.45, 0.08, -0.42,
  ])
  // prettier-ignore
  const wings = new Float32Array([
    0, 0.35, 0.28,
    0.35, 1, 0.28,
    0, 0.28, 0.35,
    0.35, 0.28, 1,
  ])
  geometry.setAttribute('position', new BufferAttribute(vertices, 3))
  geometry.setAttribute('aWing', new BufferAttribute(wings, 1))
  return geometry
}

const birdMaterial = (color: string, timeUniforms: { value: number }[]) => {
  const material = new ShaderMaterial({
    side: DoubleSide,
    uniforms: { uColor: { value: new Color(color) }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aWing;
      attribute vec3 aFlight; // phase, orbit radius, angular speed
      uniform float uTime;
      void main() {
        vec3 p = position;
        float beat = uTime * (5.5 + aFlight.z * 14.0) + aFlight.x * 5.0;
        p.y += sin(beat) * aWing * 0.45 + sin(beat - 0.6) * aWing * aWing * 0.25;
        float bank = 0.5 * (10.0 / aFlight.y);
        p = vec3(p.x * cos(bank) - p.y * sin(bank), p.x * sin(bank) + p.y * cos(bank), p.z);
        float a = uTime * aFlight.z + aFlight.x;
        float yaw = atan(cos(a), -sin(a));
        p = vec3(p.x * cos(yaw) + p.z * sin(yaw), p.y, -p.x * sin(yaw) + p.z * cos(yaw));
        p.x += sin(a) * aFlight.y;
        p.z += cos(a) * aFlight.y;
        p.y += sin(a * 2.0 + aFlight.x) * 1.1;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      void main() {
        gl_FragColor = vec4(uColor, 1.0);
        #include <colorspace_fragment>
      }
    `,
  })
  timeUniforms.push(material.uniforms.uTime as { value: number })
  return material
}

export interface FloraOptions {
  biome: BoardBiome
  path: TilePathResult
  pond?: PondSite
  summit?: SummitSite
  river?: RiverPath
  lake?: LakeSite
  town?: TownSite
  /** The railway loop, when this board dealt one — props keep off the rails. */
  railway?: Vector3[]
  /** The FINAL composed sampler — flora sits exactly on rendered ground. */
  sampler: HeightSampler
  /** Analytic distance to the nearest water (the moisture field's source). */
  waterDistanceAt: (x: number, z: number) => number
  seed: string
  phone: boolean
}

export const buildFlora = (
  options: FloraOptions,
  timeUniforms: { value: number }[]
): InstancedMesh[] => {
  const {
    biome,
    path,
    pond,
    summit,
    river,
    lake,
    town,
    railway,
    sampler,
    waterDistanceAt,
    seed,
    phone,
  } = options
  const { shelfPoints, spacing } = path
  const prng = Alea(`${seed}:flora`)
  const still = prefersReducedMotion()
  const meshes: InstancedMesh[] = []
  const matrix = new Matrix4()
  const quaternion = new Quaternion()
  const up = new Vector3(0, 1, 0)

  const clearOfTrack = (x: number, z: number, clearance: number): boolean => {
    const clearanceSquared = clearance * clearance
    for (const point of shelfPoints) {
      const dx = point.x - x
      const dz = point.z - z
      if (dx * dx + dz * dz < clearanceSquared) return false
    }
    if (pond && Math.hypot(pond.center.x - x, pond.center.z - z) < pond.basinRadius + 1)
      return false
    if (summit && Math.hypot(summit.center.x - x, summit.center.z - z) < summit.radius + 1)
      return false
    if ((river || lake) && waterDistanceAt(x, z) < 1.2) return false
    if (town) {
      // Trees through roofs may not; grass may lap the hamlet's edges — the
      // caller's clearance tells which population is asking.
      const margin = clearance >= spacing * 1.2 ? 2 : 0.5
      if (Math.hypot(town.center.x - x, town.center.z - z) < town.radius + margin) return false
    }
    if (railway) {
      // 2.6 covers the worst case: a spot midway between two ~2.5-apart loop
      // samples, a max-scale canopy (1.6), and the sleeper tips (0.5).
      for (const point of railway) {
        if (Math.hypot(point.x - x, point.z - z) < 2.6) return false
      }
    }
    return true
  }

  // --- Blade grass: a moisture-thickened carpet -----------------------------
  const spotTarget = Math.round(biome.stippleCount * (phone ? 0.5 : 1))
  const spots: { x: number; z: number }[] = []
  for (let attempt = 0; attempt < spotTarget * 8 && spots.length < spotTarget; attempt++) {
    const x = (prng() - 0.5) * 150
    const z = (prng() - 0.5) * 150
    if (!clearOfTrack(x, z, spacing * 0.95)) continue
    const moisture = 1 - Math.min(1, waterDistanceAt(x, z) / 9)
    const baseCoverage = biome.grassCoverage
    if (prng() > baseCoverage + Math.pow(moisture, 1.3) * (1 - baseCoverage)) continue
    spots.push({ x, z })
  }
  if (spots.length) {
    const BLADES_PER_CLUMP = 6
    const count = spots.length * BLADES_PER_CLUMP
    const root = new Color(biome.lush).lerp(new Color(biome.stippleColor), 0.5)
    const tip = new Color(biome.stippleColor).lerp(new Color(biome.lit), 0.55)
    const grass = new InstancedMesh(
      bladeGeometry(),
      bladeMaterial(root, tip, still ? 0 : 0.35, timeUniforms),
      count
    )
    const phases = new Float32Array(count)
    let blade = 0
    for (const spot of spots) {
      for (let sprout = 0; sprout < BLADES_PER_CLUMP; sprout++) {
        const angle = prng() * Math.PI * 2
        const spread = Math.sqrt(prng()) * 1.9
        const x = spot.x + Math.sin(angle) * spread
        const z = spot.z + Math.cos(angle) * spread
        quaternion.setFromAxisAngle(up, prng() * Math.PI * 2)
        matrix.compose(
          new Vector3(x, sampler(x, z) - 0.04, z),
          quaternion,
          new Vector3(1.0 + prng() * 0.5, 0.3 + prng() * 0.4, 1)
        )
        grass.setMatrixAt(blade, matrix)
        phases[blade] = prng() * Math.PI * 2
        blade++
      }
    }
    grass.geometry.setAttribute('aPhase', new InstancedBufferAttribute(phases, 1))
    meshes.push(grass)
  }

  // --- Biome props: trees / desert spires / ice shards ----------------------
  const propTarget = Math.round(biome.foliageCount * (phone ? 0.6 : 1))
  const propSpots: { x: number; z: number; y: number }[] = []

  for (let attempt = 0; attempt < propTarget * 12 && propSpots.length < propTarget; attempt++) {
    const x = (prng() - 0.5) * 150
    const z = (prng() - 0.5) * 150
    if (!clearOfTrack(x, z, spacing * 1.6)) continue
    // Huddling props keep to the water — the open ground stays empty, which
    // is the desert's real signature (its oasis ring made structural). The
    // extra draw is biome-gated, so non-huddling biomes' scatter never moves.
    if (biome.huddleToWater && waterDistanceAt(x, z) > 12 && prng() < 0.6) continue
    propSpots.push({ x, z, y: sampler(x, z) })
  }

  // Surveyed orchard: a minority of the trees stand in one small seeded grid
  // on flat clear ground — hand-drawn maps mark orchards exactly this way.
  // Placed on its OWN derived stream, REPLACING already-scattered spots, so
  // the rest of the population (and every later draw) stays byte-stable.
  let orchardCount = 0
  if (biome.orchard) {
    const orchardPrng = Alea(`${seed}:flora-orchard`)
    const ROWS = 2
    const COLS = 5
    const PITCH = 2.2
    for (let attempt = 0; attempt < 40 && !orchardCount; attempt++) {
      const centerX = (orchardPrng() - 0.5) * 110
      const centerZ = (orchardPrng() - 0.5) * 110
      const yaw = orchardPrng() * Math.PI
      const grid: { x: number; z: number; y: number }[] = []
      let low = Infinity
      let high = -Infinity
      for (let row = 0; row < ROWS; row++) {
        for (let column = 0; column < COLS; column++) {
          const along = (column - (COLS - 1) / 2) * PITCH
          const across = (row - (ROWS - 1) / 2) * PITCH
          const x = centerX + Math.cos(yaw) * along - Math.sin(yaw) * across
          const z = centerZ + Math.sin(yaw) * along + Math.cos(yaw) * across
          if (!clearOfTrack(x, z, spacing * 1.6)) break
          const y = sampler(x, z)
          low = Math.min(low, y)
          high = Math.max(high, y)
          grid.push({ x, z, y })
        }
      }
      // The whole plot must be clear AND level — an orchard on a hillside
      // reads as scattered trees, not a survey mark.
      if (grid.length === ROWS * COLS && high - low < 0.5 && propSpots.length >= grid.length) {
        propSpots.splice(0, grid.length, ...grid)
        orchardCount = grid.length
      }
    }
  }
  if (propSpots.length) {
    const canopy =
      biome.foliage === 'trees'
        ? new ConeGeometry(1.1, 2.6, 7)
        : biome.foliage === 'spires'
          ? new CylinderGeometry(0.28, 0.5, 2.6, 6)
          : new ConeGeometry(0.55, 2.8, 4)
    canopy.translate(0, biome.foliage === 'trees' ? 2.1 : 1.3, 0)
    const canopyMesh = new InstancedMesh(
      canopy,
      windMaterial(biome.foliageColor, still ? 0 : 0.03, timeUniforms),
      propSpots.length
    )
    // Trees stand on trunks; ice shards on squat hex slabs (rooted ice, not
    // floating cones); desert spires rise straight from the sand.
    const trunk =
      biome.foliage === 'shards'
        ? new CylinderGeometry(0.5, 0.62, 0.22, 6)
        : new CylinderGeometry(0.14, 0.18, 1.1, 6)
    trunk.translate(0, biome.foliage === 'shards' ? 0.11 : 0.55, 0)
    const trunkMesh = new InstancedMesh(
      trunk,
      windMaterial(biome.trunkColor, 0, timeUniforms),
      propSpots.length
    )
    const phases = new Float32Array(propSpots.length)
    propSpots.forEach((spot, index) => {
      // Orchard rows stand at one size — uniformity is what marks the grid
      // as surveyed rather than accidental.
      const scale = index < orchardCount ? 0.9 : 0.75 + prng() * 0.7
      matrix.makeScale(scale, scale, scale)
      matrix.setPosition(spot.x, spot.y, spot.z)
      canopyMesh.setMatrixAt(index, matrix)
      trunkMesh.setMatrixAt(index, matrix)
      phases[index] = prng() * Math.PI * 2
    })
    canopy.setAttribute('aPhase', new InstancedBufferAttribute(phases, 1))
    trunk.setAttribute('aPhase', new InstancedBufferAttribute(phases, 1))
    if (biome.foliage === 'spires') trunkMesh.count = 0
    meshes.push(canopyMesh, trunkMesh)
  }

  // --- Birds: flocks on slow orbits, well above the play surface ------------
  if (!still && biome.birdCount > 0) {
    const flock = phone ? Math.ceil(biome.birdCount / 2) : biome.birdCount
    const birds = birdGeometry()
    const birdMesh = new InstancedMesh(birds, birdMaterial(biome.major, timeUniforms), flock)
    const flights = new Float32Array(flock * 3)
    let placed = 0
    while (placed < flock) {
      const centerX = (prng() - 0.5) * 120
      const centerZ = (prng() - 0.5) * 120
      const altitude = 26 + prng() * 8
      const radius = 7 + prng() * 8
      const speed = 0.07 + prng() * 0.06
      const flockmates = Math.min(flock - placed, 2 + Math.floor(prng() * 3))
      const lead = prng() * Math.PI * 2
      for (let mate = 0; mate < flockmates; mate++) {
        const scale = 0.7 + prng() * 0.5
        matrix.makeScale(scale, scale, scale)
        matrix.setPosition(centerX, altitude + mate * 0.6, centerZ)
        birdMesh.setMatrixAt(placed, matrix)
        flights[placed * 3] = lead + mate * (0.45 + prng() * 0.2)
        flights[placed * 3 + 1] = radius
        flights[placed * 3 + 2] = speed
        placed++
      }
    }
    birds.setAttribute('aFlight', new InstancedBufferAttribute(flights, 3))
    meshes.push(birdMesh)
  }

  // --- Reed fringe: dark blades crowding the water margins ------------------
  // Drawn AFTER every other population on the same stream, so a reed-fringed
  // biome's grass, props and birds land exactly where they always did.
  // (Stream-stability holds per biome only where that biome's OWN draws are
  // unchanged — a huddling biome reshapes its scatter by design.)
  if (biome.reedFringe && (river || pond || lake)) {
    const reedTarget = Math.round(140 * (phone ? 0.5 : 1))
    const reedSpots: { x: number; z: number }[] = []
    for (
      let attempt = 0;
      attempt < reedTarget * 4 && reedSpots.length < reedTarget;
      attempt++
    ) {
      // Sample ALONG the water instead of over the whole page — the band is
      // thin, and a blind sweep would starve it.
      let x: number
      let z: number
      const draw = prng()
      if (lake && draw < (river || pond ? 0.45 : 1)) {
        const at = lake.shore[Math.floor(prng() * lake.shore.length)]
        // Outward from the shore cell, away from the water's heart.
        const away = Math.atan2(at.x - lake.center.x, at.z - lake.center.z)
        const reach = 1.2 + prng() * 1.8
        x = at.x + Math.sin(away) * reach
        z = at.z + Math.cos(away) * reach
      } else if (river && (!pond || prng() < 0.75)) {
        const at = river.points[Math.floor(prng() * river.points.length)]
        const angle = prng() * Math.PI * 2
        const reach = river.width + 1.2 + prng() * 1.8
        x = at.x + Math.sin(angle) * reach
        z = at.z + Math.cos(angle) * reach
      } else if (pond) {
        const angle = prng() * Math.PI * 2
        const reach = pond.waterRadius + 1.2 + prng() * 1.8
        x = pond.center.x + Math.sin(angle) * reach
        z = pond.center.z + Math.cos(angle) * reach
      } else {
        continue
      }
      const wet = waterDistanceAt(x, z)
      if (wet < 1.2 || wet > 3.0) continue
      if (!clearOfTrack(x, z, spacing * 0.95)) continue
      reedSpots.push({ x, z })
    }
    if (reedSpots.length) {
      const REEDS_PER_CLUMP = 4
      const count = reedSpots.length * REEDS_PER_CLUMP
      const root = new Color(biome.lush).lerp(new Color(biome.major), 0.45)
      const tip = new Color(biome.stippleColor).lerp(new Color(biome.major), 0.55)
      const reeds = new InstancedMesh(
        bladeGeometry(),
        bladeMaterial(root, tip, still ? 0 : 0.22, timeUniforms),
        count
      )
      const phases = new Float32Array(count)
      let reed = 0
      for (const spot of reedSpots) {
        for (let sprout = 0; sprout < REEDS_PER_CLUMP; sprout++) {
          const angle = prng() * Math.PI * 2
          const spread = Math.sqrt(prng()) * 0.7
          const x = spot.x + Math.sin(angle) * spread
          const z = spot.z + Math.cos(angle) * spread
          quaternion.setFromAxisAngle(up, prng() * Math.PI * 2)
          matrix.compose(
            new Vector3(x, sampler(x, z) - 0.04, z),
            quaternion,
            // Tall and narrow against the carpet's squat blades.
            new Vector3(0.55 + prng() * 0.2, 1.4 + prng() * 0.5, 1)
          )
          reeds.setMatrixAt(reed, matrix)
          phases[reed] = prng() * Math.PI * 2
          reed++
        }
      }
      reeds.geometry.setAttribute('aPhase', new InstancedBufferAttribute(phases, 1))
      meshes.push(reeds)
    }
  }

  return meshes
}
