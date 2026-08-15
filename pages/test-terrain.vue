<template>
  <div class="terrain-lab">
    <div class="controls">
      <button
        v-for="name in biomeNames"
        :key="name"
        :class="{ active: name === biome }"
        @click="setBiome(name)"
      >
        {{ name }}
      </button>
    </div>
    <ClientOnly>
      <TresCanvas clear-color="#fffaf5" antialias power-preference="high-performance">
        <TresPerspectiveCamera :position="cameraStart" :fov="42" :near="0.5" :far="600" />
        <OrbitControls
          make-default
          enable-damping
          :damping-factor="0.08"
          :min-distance="14"
          :max-distance="180"
          :max-polar-angle="1.4"
        />
        <primitive v-if="world" :object="world" />
      </TresCanvas>
    </ClientOnly>
  </div>
</template>

<script lang="ts" setup>
// Terrain-technique prototype (an isolated lab, not wired into the game):
// - elevation + slope color ramps (the painterly modelling Elysium leans on)
// - aerial perspective toward the horizon, then the page fade
// - a massif whose ascent gorge is TERRACED TERRAIN — steps carved, not placed
// - river + lake with analytic depth: foam shores and depth-scaled alpha,
//   no depth textures involved (we carved the bed, so we KNOW the depth)
// - instanced foliage with a faint vertex sway (reduced-motion gated)
// - the contour-ink language kept on top of all of it, per-biome palettes
import Alea from 'alea'
import { OrbitControls } from '@tresjs/cientos'
import { gsap } from 'gsap'
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DataTexture,
  DoubleSide,
  FloatType,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  RedFormat,
  ShaderMaterial,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { createNoise2D } from 'simplex-noise'
import { prefersReducedMotion } from '~~/lib/motion'
import { smoothstep } from '~~/lib/board3d/terrain'

definePageMeta({ layout: false })

// ---------------------------------------------------------------------------
// Biome presets: a biome is a ramp + ink palette + noise character + foliage.
// ---------------------------------------------------------------------------
interface Biome {
  valley: string
  mid: string
  crest: string
  rock: string
  /** Wet-ground tint pulled in near water (the oasis effect). */
  lush: string
  /** Quantized hillshade: sun-facing and shaded slope tones. */
  lit: string
  shade: string
  minor: string
  major: string
  snow: string
  atmosphere: string
  water: string
  foam: string
  /** fBm frequency multiplier and anisotropic stretch (dune grain). */
  frequency: number
  stretch: number
  hilliness: number
  foliage: 'trees' | 'spires' | 'shards'
  foliageColor: string
  trunkColor: string
  /** How many props the landscape carries — a desert is sparse BY nature. */
  foliageCount: number
  /** Hypsometric banding: how strongly the stepped elevation tint prints. */
  banding: number
  /** Hachure strokes on mid-slopes — the old-map relief hand. */
  hachure: number
  /** Ground stipple: tiny tufts drawn to water (oasis grass, frost, reeds). */
  stippleColor: string
  stippleCount: number
}

const BIOMES: Record<string, Biome> = {
  parchment: {
    valley: '#fffaf5',
    mid: '#fdf3e7',
    crest: '#f7e7d2',
    rock: '#e8d3b8',
    lush: '#dcead9',
    lit: '#fffdf8',
    shade: '#f0e5da',
    minor: '#3481a1',
    major: '#0d2f61',
    snow: '#eef4f7',
    atmosphere: '#f3ede9',
    water: '#4d92b3',
    foam: '#fffaf5',
    frequency: 1,
    stretch: 1,
    hilliness: 1,
    foliage: 'trees',
    foliageColor: '#90bcb5',
    trunkColor: '#0d2f61',
    foliageCount: 115,
    banding: 0.2,
    hachure: 0.32,
    stippleColor: '#a8c3b8',
    stippleCount: 2000,
  },
  grassland: {
    valley: '#eef3e2',
    mid: '#dce8c8',
    crest: '#c2d3a8',
    rock: '#b5b39a',
    lush: '#a9cf99',
    lit: '#f5f8ea',
    shade: '#c8d6ba',
    minor: '#7d9b6a',
    major: '#3f5d3a',
    snow: '#f2f6ee',
    atmosphere: '#e9efe4',
    water: '#4d92b3',
    foam: '#f4f8ef',
    frequency: 0.9,
    stretch: 1,
    hilliness: 1.05,
    foliage: 'trees',
    foliageColor: '#5c8a52',
    trunkColor: '#6b4f35',
    foliageCount: 130,
    banding: 0.16,
    hachure: 0.14,
    stippleColor: '#7fae6e',
    stippleCount: 4500,
  },
  desert: {
    valley: '#f7e9cf',
    mid: '#f0d9ae',
    crest: '#e3bd82',
    rock: '#c98f5f',
    lush: '#9fc48b',
    lit: '#fbf2da',
    shade: '#dfc192',
    minor: '#c2955c',
    major: '#8a5a33',
    snow: '#f7efdd',
    atmosphere: '#f4e9d8',
    water: '#3f9296',
    foam: '#f8f1de',
    frequency: 1.35,
    stretch: 2.6,
    hilliness: 0.8,
    foliage: 'spires',
    foliageColor: '#c98f5f',
    trunkColor: '#8a5a33',
    foliageCount: 38,
    banding: 0.42,
    hachure: 0.28,
    stippleColor: '#9fc48b',
    stippleCount: 480,
  },
  ice: {
    valley: '#f2f6f9',
    mid: '#e2ecf2',
    crest: '#cfdfe9',
    rock: '#b9cdd9',
    lush: '#cfe6e2',
    lit: '#ffffff',
    shade: '#d3e0ea',
    minor: '#7fa8bd',
    major: '#3d6b85',
    snow: '#fbfdfe',
    atmosphere: '#eef4f7',
    water: '#5d9fc4',
    foam: '#ffffff',
    frequency: 0.7,
    stretch: 1,
    hilliness: 0.7,
    foliage: 'shards',
    foliageColor: '#cfe2ec',
    trunkColor: '#8fb4c6',
    foliageCount: 55,
    banding: 0.28,
    hachure: 0.2,
    stippleColor: '#dcebf2',
    stippleCount: 800,
  },
}

const biomeNames = Object.keys(BIOMES)
const biome = ref('grassland')
const cameraStart = new Vector3(0, 70, 95)

// ---------------------------------------------------------------------------
// The landscape: fBm + a cragged massif whose gorge floor is TERRACED, a
// river marching from the gorge mouth down to a carved lake.
// ---------------------------------------------------------------------------
const SIZE = 170
const SEGMENTS = 300
const MAX_H = 7

const MASSIF = { x: -20, z: -24, radius: 27, height: 15, plateau: 5 }
const LAKE = { x: 26, z: 30, radius: 14, level: 1.6 }
const GORGE_HALF = 0.5
const TERRACES = 5

const buildSampler = (preset: Biome) => {
  const noise = createNoise2D(Alea('terrain-lab'))
  const base = (x: number, z: number) => {
    let amplitude = 1
    let frequency = (2.0 / 100) * preset.frequency
    let sum = 0
    let normalization = 0
    for (let octave = 0; octave < 4; octave++) {
      sum += amplitude * noise((x * frequency) / preset.stretch, z * frequency)
      normalization += amplitude
      amplitude *= 0.45
      frequency *= 2
    }
    return (sum / normalization) * 0.5 * MAX_H * preset.hilliness + MAX_H * 0.5
  }

  // Shoulder peaks: the massif is a FAMILY — a snowy main summit with two
  // lower rocky companions merged into its flanks, the way real massifs
  // shoulder. Placed away from the gorge face so the ascent stays clean.
  const shoulderAt = (
    x: number,
    z: number,
    cx: number,
    cz: number,
    radius: number,
    peak: number
  ) => {
    const d = Math.hypot(x - cx, z - cz)
    if (d >= radius) return 0
    return Math.pow(smoothstep((radius - d) / radius), 1.5) * peak
  }

  const massifAt = (x: number, z: number) => {
    const dx = x - MASSIF.x
    const dz = z - MASSIF.z
    const distance = Math.hypot(dx, dz)

    const shoulders = Math.max(
      shoulderAt(x, z, MASSIF.x + 15, MASSIF.z - 8, 14, MASSIF.height * 0.52),
      shoulderAt(x, z, MASSIF.x - 12, MASSIF.z - 13, 12, MASSIF.height * 0.38)
    )

    if (distance >= MASSIF.radius) return shoulders
    const theta = Math.atan2(dx, dz)
    const crag =
      0.17 * (0.5 + 0.5 * Math.sin(3 * theta + 1.1)) +
      0.07 * (0.5 + 0.5 * Math.sin(5 * theta + 2.7)) +
      0.035 * (0.5 + 0.5 * Math.sin(8 * theta + 0.6))
    const cragged = MASSIF.radius * (1 - crag)
    if (distance >= cragged) return shoulders
    if (distance <= MASSIF.plateau) return MASSIF.height
    const t = Math.pow(smoothstep((cragged - distance) / (cragged - MASSIF.plateau)), 1.6)

    // The ascent gorge faces +z — toward the default camera AND the river's
    // spring, so the water visibly pours out of the mountain's mouth. Its
    // floor is QUANTIZED into terraces — the steps are the mountain itself,
    // so nothing can ever cut into it.
    const swing = Math.atan2(Math.sin(theta), Math.cos(theta))
    const gorge = Math.exp(-((swing / GORGE_HALF) * (swing / GORGE_HALF)))
    const outer = smoothstep(Math.min(1, (distance - MASSIF.plateau) / (cragged - MASSIF.plateau)))
    let h = MASSIF.height * t * (1 - 0.55 * gorge * outer)
    if (gorge > 0.45) {
      const stepSize = MASSIF.height / TERRACES
      const stepped = Math.floor(h / stepSize) * stepSize + stepSize * 0.4
      h = h * (1 - gorge * 0.85) + stepped * (gorge * 0.85)
    }
    // Flank character: fBm crenellates the rings mid-flank — shoulders,
    // spurs, hollows — while the plateau, the base seam and the terraced
    // gorge stay clean (the mask peaks between them and the gorge damps it).
    const flankMask = t * (1 - t) * 4 * (1 - gorge)
    h += noise(x * 0.09, z * 0.09) * 1.7 * flankMask
    return Math.max(h, shoulders)
  }

  return { base, massifAt }
}

// River: deterministic downhill march from the gorge mouth toward the lake.
const buildRiver = (height: (x: number, z: number) => number) => {
  const prng = Alea('terrain-lab:river')
  const points: Vector3[] = []
  const position = new Vector3(MASSIF.x, 0, MASSIF.z + MASSIF.radius * 1.05)
  const momentum = new Vector3(0, 0, 1)
  let level = Infinity
  for (let step = 0; step < 70; step++) {
    const y = height(position.x, position.z)
    level = Math.min(level, y - 0.35)
    points.push(new Vector3(position.x, level, position.z))
    if (Math.hypot(position.x - LAKE.x, position.z - LAKE.z) < LAKE.radius * 0.7) break
    const gx = (height(position.x + 1, position.z) - height(position.x - 1, position.z)) / 2
    const gz = (height(position.x, position.z + 1) - height(position.x, position.z - 1)) / 2
    const toLake = new Vector3(LAKE.x - position.x, 0, LAKE.z - position.z).normalize()
    const downhill = new Vector3(-gx, 0, -gz)
    if (downhill.lengthSq() > 1e-6) downhill.normalize()
    momentum
      .multiplyScalar(0.5)
      .addScaledVector(downhill, 0.3)
      .addScaledVector(toLake, 0.35)
      .normalize()
    const wobble = (prng() - 0.5) * 0.45
    const heading = Math.atan2(momentum.x, momentum.z) + wobble
    position.x += Math.sin(heading) * 2.6
    position.z += Math.cos(heading) * 2.6
  }
  return points
}

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------
const terrainMaterial = (preset: Biome, heightMap: DataTexture, heightHalf: number) =>
  new ShaderMaterial({
    uniforms: {
      uHeightMap: { value: heightMap },
      uHeightHalf: { value: heightHalf },
      uTime: { value: 0 },
      uBanding: { value: preset.banding },
      uHachure: { value: preset.hachure },
      uValley: { value: new Color(preset.valley) },
      uMid: { value: new Color(preset.mid) },
      uCrest: { value: new Color(preset.crest) },
      uRock: { value: new Color(preset.rock) },
      uLush: { value: new Color(preset.lush) },
      uLit: { value: new Color(preset.lit) },
      uShade: { value: new Color(preset.shade) },
      uMinor: { value: new Color(preset.minor) },
      uMajor: { value: new Color(preset.major) },
      uSnow: { value: new Color(preset.snow) },
      uAtmosphere: { value: new Color(preset.atmosphere) },
      uPage: { value: new Color('#fffaf5') },
      uStep: { value: MAX_H / 8 },
      uMajorEvery: { value: 5 },
      uLineWidth: { value: 0.9 },
      uMaxH: { value: MAX_H },
      uSnowline: { value: MASSIF.height * 0.72 },
      uAtmoStart: { value: 46 },
      uFadeStart: { value: 74 },
      uFadeEnd: { value: 110 },
    },
    vertexShader: /* glsl */ `
      attribute float aSlope;
      attribute vec2 aGradient;
      attribute float aCurve;
      attribute float aMoisture;
      varying float vElevation;
      varying float vSlope;
      varying vec2 vGradient;
      varying float vCurve;
      varying float vMoisture;
      varying vec2 vXZ;
      void main() {
        vElevation = position.y;
        vSlope = aSlope;
        vGradient = aGradient;
        vCurve = aCurve;
        vMoisture = aMoisture;
        vXZ = position.xz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uValley; uniform vec3 uMid; uniform vec3 uCrest; uniform vec3 uRock;
      uniform vec3 uLush; uniform vec3 uLit; uniform vec3 uShade;
      uniform vec3 uMinor; uniform vec3 uMajor; uniform vec3 uSnow; uniform vec3 uAtmosphere;
      uniform vec3 uPage;
      uniform float uStep; uniform float uMajorEvery; uniform float uLineWidth;
      uniform float uMaxH; uniform float uSnowline;
      uniform float uAtmoStart; uniform float uFadeStart; uniform float uFadeEnd;
      uniform sampler2D uHeightMap; uniform float uHeightHalf; uniform float uTime;
      uniform float uBanding; uniform float uHachure;
      varying float vElevation; varying float vSlope; varying vec2 vXZ;
      varying vec2 vGradient; varying float vCurve; varying float vMoisture;

      float lineMask(float value, float stepSize, float width) {
        float derivative = max(fwidth(value), 1e-5);
        float dist = abs(fract(value / stepSize - 0.5) - 0.5) * stepSize / derivative;
        float mask = 1.0 - smoothstep(width, width + 1.8, dist);
        float density = derivative / stepSize;
        return mask * (1.0 - smoothstep(0.18, 0.5, density));
      }

      void main() {
        // Painterly modelling with zero lights: an elevation ramp plus a
        // slope tint. The gorge terraces and crag spurs pop out of these two
        // mixes alone.
        float h = clamp(vElevation / uMaxH, 0.0, 2.4);
        vec3 color = mix(uValley, uMid, smoothstep(0.25, 0.85, h));
        color = mix(color, uCrest, smoothstep(0.85, 1.7, h));

        // Moisture: wet ground pulls toward the lush tone near water —
        // rich banks in grass, an oasis ring in sand. Flat ground only;
        // slopes stay in the rock family.
        color = mix(color, uLush, vMoisture * (1.0 - smoothstep(0.25, 0.8, vSlope)) * 0.55);
        // The wet band: a damp darker rim right at the shore.
        color = mix(color, uShade, smoothstep(0.86, 0.98, vMoisture) * 0.22);
        color = mix(color, uRock, smoothstep(0.55, 1.35, vSlope) * 0.65);

        // Quantized hillshade from the analytic normal — cartographic relief
        // with a fixed NW sun, three tones, no lights in the scene.
        vec3 normal = normalize(vec3(-vGradient.x, 1.0, -vGradient.y));
        float lambert = dot(normal, normalize(vec3(-0.45, 0.85, -0.4)));
        float litSide = smoothstep(0.86, 0.98, lambert);
        float shadeSide = 1.0 - smoothstep(0.55, 0.78, lambert);
        color = mix(color, uLit, litSide * 0.35);
        color = mix(color, uShade, shadeSide * 0.5);

        // Curvature accents: ink the ridgelines, deepen the hollows — the
        // crag spurs and terrace edges become drawn strokes.
        float ridge = smoothstep(0.06, 0.3, -vCurve);
        float hollow = smoothstep(0.06, 0.3, vCurve);
        color = mix(color, uMajor, ridge * 0.12);
        color = mix(color, uShade, hollow * 0.25);

        // Contours from a HIGH-RES height texture sampled per fragment, not
        // the coarse vertex lattice — the aliasing fix: the field the lines
        // trace is finer than the mesh, so the ink stops crumbling along
        // triangle edges.
        float hField = texture2D(uHeightMap, (vXZ + uHeightHalf) / (2.0 * uHeightHalf)).r;

        // Hypsometric banding: the printed-atlas layer — a quantized tint per
        // contour interval, laid gently over the smooth ramp.
        float hQuant = (floor(hField / uStep) + 0.5) * uStep / uMaxH;
        vec3 bandColor = mix(uValley, uCrest, clamp(hQuant * 0.7, 0.0, 1.0));
        color = mix(color, bandColor, uBanding);

        float flatness = smoothstep(0.02, 0.06, vSlope);
        float edgeFade = 1.0 - smoothstep(uFadeStart, uFadeEnd, length(vXZ));
        float snow = smoothstep(uSnowline, uSnowline + 1.4, vElevation);
        float strength = flatness * edgeFade * (1.0 - snow);
        // Hachures: the old-map relief hand — short strokes running downslope,
        // curving with the gradient, on mid-slopes where contours are sparse.
        vec2 downslope = normalize(vGradient + vec2(1e-4));
        float across = dot(vXZ, vec2(-downslope.y, downslope.x)) * 0.85;
        float acrossWidth = fwidth(across);
        float strokePhase = abs(fract(across) - 0.5) * 2.0;
        float stroke = 1.0 - smoothstep(0.3, 0.3 + acrossWidth * 2.2, strokePhase);
        stroke *= 1.0 - smoothstep(0.45, 1.1, acrossWidth);
        float hachureBand = smoothstep(0.24, 0.42, vSlope) * (1.0 - smoothstep(0.85, 1.25, vSlope));
        color = mix(color, uMajor, stroke * hachureBand * uHachure * edgeFade * (1.0 - snow));

        float minor = lineMask(hField, uStep, uLineWidth) * strength;
        float major = lineMask(hField, uStep * uMajorEvery, uLineWidth * 1.6) * strength;
        color = mix(color, uMinor, minor * 0.9);
        color = mix(color, uMajor, major);
        color = mix(color, uSnow, snow * 0.9);

        // Drifting cloud shadows: three slow sine fields sum into soft blobs
        // that darken the ground faintly as they pass. Frozen under reduced
        // motion (uTime holds at zero).
        float cloud =
          sin(vXZ.x * 0.045 + uTime * 0.05) +
          sin(vXZ.y * 0.038 - uTime * 0.04) +
          sin((vXZ.x + vXZ.y) * 0.027 + uTime * 0.03);
        color = mix(color, uShade, smoothstep(1.4, 2.6, cloud) * 0.1);

        // Aerial perspective: the far field cools and lightens BEFORE the
        // page fade — depth without lights, fog without fog.
        float aerial = smoothstep(uAtmoStart, uFadeStart, length(vXZ));
        color = mix(color, uAtmosphere, aerial * 0.55);

        // Valley mist: in that same far field, LOW ground drowns first —
        // fog pools in distant valleys while crests ride clear above it.
        float mist = smoothstep(uAtmoStart * 0.7, uFadeStart, length(vXZ)) *
          (1.0 - smoothstep(uMaxH * 0.35, uMaxH * 0.95, vElevation));
        color = mix(color, uAtmosphere, mist * 0.45);

        color = mix(color, uPage, smoothstep(uFadeStart, uFadeEnd, length(vXZ)));

        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
  })

// Water: per-vertex ANALYTIC depth (we carved the bed, we know it) drives a
// foam shore and depth-scaled transparency — no depth textures, no banding.
const waterMaterial = (preset: Biome) =>
  new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    uniforms: {
      uWater: { value: new Color(preset.water) },
      uFoam: { value: new Color(preset.foam) },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute float aDepth;
      varying float vDepth;
      varying vec2 vXZ;
      void main() {
        vDepth = aDepth;
        vXZ = position.xz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uWater; uniform vec3 uFoam; uniform float uTime;
      varying float vDepth; varying vec2 vXZ;
      void main() {
        if (vDepth <= 0.0) discard;
        float shimmer = sin(uTime * 1.1 + vXZ.x * 1.7 + vXZ.y * 1.3) * 0.045;
        float foam = 1.0 - smoothstep(0.05, 0.3 + shimmer, vDepth);
        float alpha = mix(0.3, 0.72, smoothstep(0.0, 1.1, vDepth));
        // Two-tone depth: shallows keep the bright water hue, the middle
        // falls toward a deep tone — the Elysium lake read, analytically.
        vec3 color = mix(uWater, uWater * 0.55, smoothstep(0.3, 1.3, vDepth));
        color = mix(color, uFoam, foam);
        gl_FragColor = vec4(color, max(alpha, foam * 0.9));
        #include <colorspace_fragment>
      }
    `,
  })

// The switchback trail: dashed ink, alpha from the along-length coordinate.
const trailMaterial = (preset: Biome) =>
  new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uInk: { value: new Color(preset.major) } },
    vertexShader: /* glsl */ `
      attribute float aAlong;
      varying float vAlong;
      void main() {
        vAlong = aAlong;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uInk;
      varying float vAlong;
      void main() {
        float dash = step(fract(vAlong * 0.9), 0.55);
        if (dash < 0.5) discard;
        gl_FragColor = vec4(uInk, 0.55);
        #include <colorspace_fragment>
      }
    `,
  })

// Grass the Elysium way: each instance is ONE tapered blade, bowed along its
// length in the vertex shader (bend grows with t², so the tip leads), colored
// root-to-tip so the base grounds into the terrain — never crossed quads,
// which read as X-marks from a high camera.
const bladeMaterial = (root: Color, tip: Color, sway: number) =>
  new ShaderMaterial({
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
      varying float vT;
      varying float vShade;
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

const bladeGeometry = () => {
  const geometry = new BufferGeometry()
  // A single tapered blade: wide-ish root, waisted middle, pointed tip.
  // prettier-ignore
  const vertices = new Float32Array([
    -0.05, 0, 0,   0.05, 0, 0,   0.032, 0.55, 0,
    -0.05, 0, 0,   0.032, 0.55, 0,   -0.032, 0.55, 0,
    -0.032, 0.55, 0,   0.032, 0.55, 0,   0, 1, 0,
  ])
  geometry.setAttribute('position', new BufferAttribute(vertices, 3))
  return geometry
}

// Birds: instanced ink chevrons circling on slow orbits, wings flapping,
// each instance steered in the vertex shader — no per-frame JS at all.
const birdMaterial = (color: string) =>
  new ShaderMaterial({
    side: DoubleSide,
    uniforms: { uColor: { value: new Color(color) }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aWing;
      attribute vec3 aFlight; // phase, orbit radius, angular speed
      uniform float uTime;
      void main() {
        vec3 p = position;
        // Flap: outer wing leads, inner follows a beat behind.
        float beat = uTime * (5.5 + aFlight.z * 14.0) + aFlight.x * 5.0;
        p.y += sin(beat) * aWing * 0.45 + sin(beat - 0.6) * aWing * aWing * 0.25;
        // Bank into the turn: roll around the body axis, harder on tight orbits.
        float bank = 0.5 * (10.0 / aFlight.y);
        p = vec3(p.x * cos(bank) - p.y * sin(bank), p.x * sin(bank) + p.y * cos(bank), p.z);
        float a = uTime * aFlight.z + aFlight.x;
        // Face along the orbit's tangent.
        float yaw = atan(cos(a), -sin(a));
        p = vec3(p.x * cos(yaw) + p.z * sin(yaw), p.y, -p.x * sin(yaw) + p.z * cos(yaw));
        p.x += sin(a) * aFlight.y;
        p.z += cos(a) * aFlight.y;
        // A slow rise and fall along the loop — gliding, not a carousel.
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

const birdGeometry = () => {
  const geometry = new BufferGeometry()
  // A gull "m": each wing is two segments — a lifted inner panel and a
  // swept, drooping outer blade — so the silhouette reads as a bird from
  // every angle, not a dart. aWing drives the flap, strongest at the tips.
  // prettier-ignore
  const vertices = new Float32Array([
    // left inner panel
    0, 0.02, 0.32,   -0.62, 0.3, 0.02,   -0.5, 0.16, -0.28,
    // left outer blade
    -0.62, 0.3, 0.02,   -1.45, 0.08, -0.42,   -0.5, 0.16, -0.28,
    // right inner panel
    0, 0.02, 0.32,   0.5, 0.16, -0.28,   0.62, 0.3, 0.02,
    // right outer blade
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

// Foliage: instanced, with a faint per-instance vertex sway.
const foliageMaterial = (color: string, sway: number) =>
  new ShaderMaterial({
    side: DoubleSide,
    uniforms: { uColor: { value: new Color(color) }, uTime: { value: 0 }, uSway: { value: sway } },
    vertexShader: /* glsl */ `
      attribute float aPhase;
      uniform float uTime; uniform float uSway;
      varying float vShade;
      void main() {
        vec3 p = position;
        float reach = pow(max(p.y, 0.0), 1.3);
        // WIND, not jitter: a wave with spatial phase from the instance's
        // world origin, so gusts visibly TRAVEL through the field — whole
        // stretches of meadow bow together and recover.
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

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
const world = shallowRef<Group>()
const timeUniforms: { value: number }[] = []
let ticker: (() => void) | undefined

const buildWorld = (name: string) => {
  const preset = BIOMES[name]
  const group = new Group()
  const { base, massifAt } = buildSampler(preset)

  const lakeFloor = LAKE.level - 1.5
  const height = (x: number, z: number) => {
    let h = base(x, z) + massifAt(x, z)
    const lakeDistance = Math.hypot(x - LAKE.x, z - LAKE.z)
    if (lakeDistance < LAKE.radius * 1.4) {
      const t = smoothstep(Math.min(1, lakeDistance / (LAKE.radius * 1.4)))
      h = Math.min(h, lakeFloor * (1 - t) + h * t)
    }
    return h
  }

  const river = buildRiver(height)
  const bedAt = (x: number, z: number, h: number) => {
    let carved = h
    for (const point of river) {
      const d = Math.hypot(point.x - x, point.z - z)
      if (d >= 2.4) continue
      const t = smoothstep(d / 2.4)
      carved = Math.min(carved, (point.y - 0.35) * (1 - t) + carved * t)
    }
    return carved
  }

  // --- Terrain mesh ---------------------------------------------------------
  const geometry = new PlaneGeometry(SIZE * 1.6, SIZE * 1.6, SEGMENTS, SEGMENTS)
  geometry.rotateX(-Math.PI / 2)
  const positions = geometry.attributes.position
  const lattice = SEGMENTS + 1
  const heights = new Float32Array(positions.count)
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index)
    const z = positions.getZ(index)
    heights[index] = bedAt(x, z, height(x, z))
  }
  const slopes = new Float32Array(positions.count)
  const gradients = new Float32Array(positions.count * 2)
  const curvatures = new Float32Array(positions.count)
  const moistures = new Float32Array(positions.count)
  const epsilon = (SIZE * 1.6) / SEGMENTS
  for (let index = 0; index < positions.count; index++) {
    positions.setY(index, heights[index])
    const row = Math.floor(index / lattice)
    const column = index % lattice
    const left = Math.max(column - 1, 0)
    const right = Math.min(column + 1, SEGMENTS)
    const near = Math.max(row - 1, 0)
    const far = Math.min(row + 1, SEGMENTS)
    const gradientX =
      (heights[row * lattice + right] - heights[row * lattice + left]) / ((right - left) * epsilon)
    const gradientZ =
      (heights[far * lattice + column] - heights[near * lattice + column]) /
      ((far - near) * epsilon)
    slopes[index] = Math.hypot(gradientX, gradientZ)
    gradients[index * 2] = gradientX
    gradients[index * 2 + 1] = gradientZ
    // Laplacian: negative on ridgelines and crag crests, positive in hollows.
    curvatures[index] =
      heights[row * lattice + right] +
      heights[row * lattice + left] +
      heights[far * lattice + column] +
      heights[near * lattice + column] -
      4 * heights[index]

    // Moisture: analytic distance to the nearest water — the ground greens
    // toward the river and lake (an oasis ring, in the desert's case).
    const x = positions.getX(index)
    const z = positions.getZ(index)
    let waterDistance = Math.max(0, Math.hypot(x - LAKE.x, z - LAKE.z) - LAKE.radius)
    for (const point of river) {
      const d = Math.hypot(point.x - x, point.z - z)
      if (d < waterDistance) waterDistance = d
    }
    moistures[index] = 1 - Math.min(1, waterDistance / 9)
  }
  positions.needsUpdate = true
  geometry.setAttribute('aSlope', new BufferAttribute(slopes, 1))
  geometry.setAttribute('aGradient', new BufferAttribute(gradients, 2))
  geometry.setAttribute('aCurve', new BufferAttribute(curvatures, 1))
  geometry.setAttribute('aMoisture', new BufferAttribute(moistures, 1))

  // The height field again at texture resolution — finer than the mesh, so
  // fragment-sampled contours stop aliasing along triangle edges.
  const FIELD = 512
  const fieldHalf = (SIZE * 1.6) / 2
  const field = new Float32Array(FIELD * FIELD)
  for (let row = 0; row < FIELD; row++) {
    for (let column = 0; column < FIELD; column++) {
      const x = (column / (FIELD - 1)) * fieldHalf * 2 - fieldHalf
      const z = (row / (FIELD - 1)) * fieldHalf * 2 - fieldHalf
      field[row * FIELD + column] = bedAt(x, z, height(x, z))
    }
  }
  const heightMap = new DataTexture(field, FIELD, FIELD, RedFormat, FloatType)
  heightMap.minFilter = LinearFilter
  heightMap.magFilter = LinearFilter
  heightMap.needsUpdate = true

  const terrain = terrainMaterial(preset, heightMap, fieldHalf)
  timeUniforms.push(terrain.uniforms.uTime as { value: number })
  group.add(new Mesh(geometry, terrain))

  // A dashed switchback trail up the gorge terraces — cartographic ascent
  // marks, drawn as a ribbon hugging the carved ground.
  const trail = new BufferGeometry()
  const trailVertices: number[] = []
  const trailAlong: number[] = []
  const trailIndices: number[] = []
  const TRAIL_STEPS = 60
  for (let step = 0; step <= TRAIL_STEPS; step++) {
    const t = step / TRAIL_STEPS
    const reach = MASSIF.radius * 1.02 - t * (MASSIF.radius * 1.02 - MASSIF.plateau * 0.7)
    const wobble = Math.sin(t * Math.PI * 5) * 2.4 * (1 - t * 0.6)
    const x = MASSIF.x + wobble
    const z = MASSIF.z + reach
    const y = bedAt(x, z, height(x, z)) + 0.1
    for (const offset of [-0.28, 0.28]) {
      trailVertices.push(x + offset, y, z)
      trailAlong.push(t * TRAIL_STEPS)
    }
    if (step > 0) {
      const row = (step - 1) * 2
      trailIndices.push(row, row + 2, row + 1, row + 1, row + 2, row + 3)
    }
  }
  trail.setIndex(trailIndices)
  trail.setAttribute('position', new BufferAttribute(new Float32Array(trailVertices), 3))
  trail.setAttribute('aAlong', new BufferAttribute(new Float32Array(trailAlong), 1))
  group.add(new Mesh(trail, trailMaterial(preset)))

  // --- Lake water (grid with analytic depth) --------------------------------
  const lakeGeometry = new PlaneGeometry(LAKE.radius * 3, LAKE.radius * 3, 72, 72)
  lakeGeometry.rotateX(-Math.PI / 2)
  lakeGeometry.translate(LAKE.x, LAKE.level, LAKE.z)
  const lakePositions = lakeGeometry.attributes.position
  const lakeDepth = new Float32Array(lakePositions.count)
  for (let index = 0; index < lakePositions.count; index++) {
    const x = lakePositions.getX(index)
    const z = lakePositions.getZ(index)
    lakeDepth[index] = LAKE.level - bedAt(x, z, height(x, z))
  }
  lakeGeometry.setAttribute('aDepth', new BufferAttribute(lakeDepth, 1))
  const lakeWater = waterMaterial(preset)
  timeUniforms.push(lakeWater.uniforms.uTime)
  group.add(new Mesh(lakeGeometry, lakeWater))

  // --- River water (ribbon with analytic depth) -----------------------------
  if (river.length > 2) {
    const ribbon = new BufferGeometry()
    const vertices: number[] = []
    const depths: number[] = []
    const indices: number[] = []
    for (let index = 0; index < river.length; index++) {
      const point = river[index]
      const next = river[Math.min(index + 1, river.length - 1)]
      const previous = river[Math.max(index - 1, 0)]
      const tangent = new Vector3().subVectors(next, previous).setY(0).normalize()
      const side = new Vector3(-tangent.z, 0, tangent.x)
      for (const offset of [-1, -0.33, 0.33, 1]) {
        const x = point.x + side.x * offset * 1.9
        const z = point.z + side.z * offset * 1.9
        vertices.push(x, point.y, z)
        depths.push(point.y - bedAt(x, z, height(x, z)))
      }
    }
    for (let segment = 0; segment < river.length - 1; segment++) {
      const row = segment * 4
      for (let quad = 0; quad < 3; quad++) {
        const a = row + quad
        indices.push(a, a + 4, a + 1, a + 1, a + 4, a + 5)
      }
    }
    ribbon.setIndex(indices)
    ribbon.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3))
    ribbon.setAttribute('aDepth', new BufferAttribute(new Float32Array(depths), 1))
    const riverWater = waterMaterial(preset)
    timeUniforms.push(riverWater.uniforms.uTime)
    group.add(new Mesh(ribbon, riverWater))

    // Waterfalls: wherever the downhill clamp took a big step, hang a white
    // cascade sheet down the drop and boil a foam pool at its foot — the
    // water shader renders both as pure foam (their depth is near zero).
    const fallVertices: number[] = []
    const fallDepths: number[] = []
    const fallIndices: number[] = []
    for (let index = 0; index < river.length - 1; index++) {
      const top = river[index]
      const bottom = river[index + 1]
      const drop = top.y - bottom.y
      if (drop < 1.1) continue
      const tangent = new Vector3().subVectors(bottom, top).setY(0).normalize()
      const side = new Vector3(-tangent.z, 0, tangent.x)
      const lip = new Vector3().addVectors(top, tangent.clone().multiplyScalar(1.1))
      const row = fallVertices.length / 3
      for (const [point, y] of [
        [lip, top.y + 0.06],
        [lip, bottom.y - 0.15],
      ] as const) {
        for (const offset of [-1, 1]) {
          fallVertices.push(point.x + side.x * offset * 1.15, y, point.z + side.z * offset * 1.15)
          fallDepths.push(0.12)
        }
      }
      fallIndices.push(row, row + 2, row + 1, row + 1, row + 2, row + 3)

      // The plunge pool: a foam disc where the cascade lands.
      const pool = new Vector3().addVectors(bottom, tangent.clone().multiplyScalar(0.6))
      const poolRow = fallVertices.length / 3
      const POOL_SPOKES = 10
      fallVertices.push(pool.x, bottom.y + 0.05, pool.z)
      fallDepths.push(0.08)
      for (let spoke = 0; spoke <= POOL_SPOKES; spoke++) {
        const angle = (spoke / POOL_SPOKES) * Math.PI * 2
        fallVertices.push(
          pool.x + Math.cos(angle) * 1.7,
          bottom.y + 0.05,
          pool.z + Math.sin(angle) * 1.7
        )
        fallDepths.push(0.22)
        if (spoke > 0) fallIndices.push(poolRow, poolRow + spoke, poolRow + spoke + 1)
      }
    }
    if (fallIndices.length) {
      const falls = new BufferGeometry()
      falls.setIndex(fallIndices)
      falls.setAttribute('position', new BufferAttribute(new Float32Array(fallVertices), 3))
      falls.setAttribute('aDepth', new BufferAttribute(new Float32Array(fallDepths), 1))
      const fallWater = waterMaterial(preset)
      timeUniforms.push(fallWater.uniforms.uTime)
      group.add(new Mesh(falls, fallWater))
    }
  }

  // --- Foliage (instanced, swaying) -----------------------------------------
  const prng = Alea('terrain-lab:foliage')
  const spots: { x: number; z: number; y: number }[] = []
  for (let attempt = 0; attempt < 900 && spots.length < preset.foliageCount; attempt++) {
    const x = (prng() - 0.5) * SIZE * 0.95
    const z = (prng() - 0.5) * SIZE * 0.95
    if (massifAt(x, z) > 0.4) continue
    if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.radius * 1.5) continue
    if (river.some(point => Math.hypot(point.x - x, point.z - z) < 3.4)) continue
    const y = height(x, z)
    const gradient = Math.hypot(
      (height(x + 1, z) - height(x - 1, z)) / 2,
      (height(x, z + 1) - height(x, z - 1)) / 2
    )
    if (gradient > 0.35) continue
    spots.push({ x, z, y })
  }

  const canopy =
    preset.foliage === 'trees'
      ? new ConeGeometry(1.1, 2.6, 7)
      : preset.foliage === 'spires'
        ? new CylinderGeometry(0.28, 0.5, 2.6, 6)
        : new ConeGeometry(0.55, 2.8, 4)
  canopy.translate(0, preset.foliage === 'trees' ? 2.1 : 1.3, 0)
  const canopyMaterial = foliageMaterial(preset.foliageColor, prefersReducedMotion() ? 0 : 0.03)
  timeUniforms.push(canopyMaterial.uniforms.uTime)
  const canopyMesh = new InstancedMesh(canopy, canopyMaterial, spots.length)

  const trunk = new CylinderGeometry(0.14, 0.18, 1.1, 6)
  trunk.translate(0, 0.55, 0)
  const trunkMaterial = foliageMaterial(preset.trunkColor, 0)
  const trunkMesh = new InstancedMesh(trunk, trunkMaterial, spots.length)

  const matrix = new Matrix4()
  const phases = new Float32Array(spots.length)
  spots.forEach((spot, index) => {
    const scale = 0.75 + prng() * 0.7
    matrix.makeScale(scale, scale, scale)
    matrix.setPosition(spot.x, spot.y, spot.z)
    canopyMesh.setMatrixAt(index, matrix)
    trunkMesh.setMatrixAt(index, matrix)
    phases[index] = prng() * Math.PI * 2
  })
  canopy.setAttribute('aPhase', new InstancedBufferAttribute(phases, 1))
  trunk.setAttribute('aPhase', new InstancedBufferAttribute(phases, 1))
  if (preset.foliage !== 'trees') trunkMesh.count = 0
  group.add(canopyMesh, trunkMesh)

  // --- Grass stipple: tiny crossed tufts drawn toward water ------------------
  const waterDistanceAt = (x: number, z: number) => {
    let distance = Math.max(0, Math.hypot(x - LAKE.x, z - LAKE.z) - LAKE.radius)
    for (const point of river) {
      const d = Math.hypot(point.x - x, point.z - z)
      if (d < distance) distance = d
    }
    return distance
  }

  const tuftSpots: { x: number; z: number; y: number }[] = []
  for (
    let attempt = 0;
    attempt < preset.stippleCount * 8 && tuftSpots.length < preset.stippleCount;
    attempt++
  ) {
    const x = (prng() - 0.5) * SIZE * 0.95
    const z = (prng() - 0.5) * SIZE * 0.95
    if (massifAt(x, z) > 0.3) continue
    const y = bedAt(x, z, height(x, z))
    if (y < LAKE.level + 0.2) continue
    const moisture = 1 - Math.min(1, waterDistanceAt(x, z) / 11)
    // A field is a CARPET, not islands: high base coverage everywhere grass
    // can grow, moisture only thickening it. The desert alone stays gated to
    // its oasis.
    const baseCoverage = name === 'desert' ? 0.05 : 0.45
    if (prng() > baseCoverage + Math.pow(moisture, 1.3) * (1 - baseCoverage)) continue
    tuftSpots.push({ x, z, y })
  }
  if (tuftSpots.length) {
    // Each moist spot becomes a CLUMP of individual blades — patchy growth,
    // the way real meadows (and Elysium's) fill in.
    const BLADES_PER_CLUMP = 6
    const bladeCount = tuftSpots.length * BLADES_PER_CLUMP
    // Low contrast against the ground: the root sits near the lush terrain
    // tone (blades EMERGE from the field), only the tips lift lighter. Dark
    // wiry strokes on pale ground was the hair-on-skin read.
    const root = new Color(preset.lush).lerp(new Color(preset.stippleColor), 0.5)
    const tip = new Color(preset.stippleColor).lerp(new Color(preset.lit), 0.55)
    const blades = bladeMaterial(root, tip, prefersReducedMotion() ? 0 : 0.35)
    timeUniforms.push(blades.uniforms.uTime as { value: number })
    const bladeMesh = new InstancedMesh(bladeGeometry(), blades, bladeCount)
    const bladePhases = new Float32Array(bladeCount)
    const bladeQuaternion = new Quaternion()
    const up = new Vector3(0, 1, 0)
    let blade = 0
    for (const spot of tuftSpots) {
      for (let sprout = 0; sprout < BLADES_PER_CLUMP; sprout++) {
        const angle = prng() * Math.PI * 2
        const spread = Math.sqrt(prng()) * 1.9
        const x = spot.x + Math.sin(angle) * spread
        const z = spot.z + Math.cos(angle) * spread
        const y = bedAt(x, z, height(x, z))
        bladeQuaternion.setFromAxisAngle(up, prng() * Math.PI * 2)
        // Short and broad-ish: turf, not wisps.
        matrix.compose(
          new Vector3(x, y - 0.04, z),
          bladeQuaternion,
          new Vector3(1.0 + prng() * 0.5, 0.3 + prng() * 0.4, 1)
        )
        bladeMesh.setMatrixAt(blade, matrix)
        bladePhases[blade] = prng() * Math.PI * 2
        blade++
      }
    }
    bladeMesh.geometry.setAttribute('aPhase', new InstancedBufferAttribute(bladePhases, 1))
    group.add(bladeMesh)
  }

  // --- Birds: small flocks on slow orbits over the open country --------------
  if (!prefersReducedMotion()) {
    const flockSizes: Record<string, number> = {
      parchment: 12,
      grassland: 14,
      desert: 7,
      ice: 6,
    }
    const flock = flockSizes[name] ?? 10
    const birds = birdGeometry()
    const birdShader = birdMaterial(preset.major)
    timeUniforms.push(birdShader.uniforms.uTime as { value: number })
    // Birds fly in FLOCKS: a few share each orbit, phase-staggered so they
    // chase one another around the loop instead of wandering alone.
    const birdMesh = new InstancedMesh(birds, birdShader, flock)
    const flights = new Float32Array(flock * 3)
    let placed = 0
    while (placed < flock) {
      const centerX = (prng() - 0.5) * SIZE * 0.7
      const centerZ = (prng() - 0.5) * SIZE * 0.7
      const altitude = 20 + prng() * 8
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
    group.add(birdMesh)
  }

  // --- Contour elevation labels: numbers riding the major lines --------------
  const majorStep = (MAX_H / 8) * 5
  const labelLevels: number[] = []
  for (let level = majorStep; level < MASSIF.height; level += majorStep) labelLevels.push(level)

  const labelCanvas = document.createElement('canvas')
  const CELL = 96
  labelCanvas.width = CELL * labelLevels.length
  labelCanvas.height = CELL
  const context = labelCanvas.getContext('2d')
  if (context) {
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.font = 'bold 44px Georgia, serif'
    labelLevels.forEach((level, index) => {
      const text = `${Math.round(level * 10)}`
      // The halo is the page color, so the label visually BREAKS the line —
      // the topo-map convention.
      context.lineWidth = 12
      context.strokeStyle = '#fffaf5'
      context.strokeText(text, CELL * index + CELL / 2, CELL / 2)
      context.fillStyle = preset.major
      context.fillText(text, CELL * index + CELL / 2, CELL / 2)
    })
  }
  const labelTexture = new CanvasTexture(labelCanvas)

  const labelQuads: BufferGeometry[] = []
  const placed: Vector3[] = []
  for (let x = -78; x <= 78 && labelQuads.length < 14; x += 5) {
    for (let z = -78; z <= 78; z += 5) {
      const h = bedAt(x, z, height(x, z))
      const levelIndex = labelLevels.findIndex(level => Math.abs(h - level) < 0.1)
      if (levelIndex < 0) continue
      const gradientX = (height(x + 1, z) - height(x - 1, z)) / 2
      const gradientZ = (height(x, z + 1) - height(x, z - 1)) / 2
      const gradient = Math.hypot(gradientX, gradientZ)
      if (gradient < 0.05 || gradient > 0.5) continue
      if (placed.some(point => Math.hypot(point.x - x, point.z - z) < 26)) continue

      const quad = new PlaneGeometry(3.4, 1.7)
      const uv = quad.attributes.uv
      for (let corner = 0; corner < uv.count; corner++) {
        uv.setX(corner, (levelIndex + uv.getX(corner)) / labelLevels.length)
      }
      quad.rotateX(-Math.PI / 2)
      // Lie along the contour: the line's tangent is perpendicular to the
      // gradient; flip so the text never reads upside down from the south.
      let yaw = Math.atan2(-gradientZ, gradientX)
      if (Math.cos(yaw) < 0) yaw += Math.PI
      quad.rotateY(yaw)
      quad.translate(x, h + 0.14, z)
      labelQuads.push(quad)
      placed.push(new Vector3(x, 0, z))
    }
  }
  if (labelQuads.length) {
    const labels = new Mesh(
      mergeGeometries(labelQuads),
      new MeshBasicMaterial({ map: labelTexture, transparent: true, depthWrite: false })
    )
    labelQuads.forEach(quad => quad.dispose())
    group.add(labels)
  }

  return group
}

const disposeWorld = () => {
  world.value?.traverse(child => {
    if (child instanceof Mesh || child instanceof InstancedMesh) {
      child.geometry.dispose()
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      materials.forEach(material => {
        const heightMap = (material as ShaderMaterial).uniforms?.uHeightMap?.value as
          DataTexture | undefined
        heightMap?.dispose()
        if ('map' in material) (material as MeshBasicMaterial).map?.dispose()
        material.dispose()
      })
    }
  })
  timeUniforms.length = 0
}

const setBiome = (name: string) => {
  biome.value = name
  disposeWorld()
  world.value = buildWorld(name)
}

onMounted(() => {
  world.value = buildWorld(biome.value)
  ticker = () => {
    for (const uniform of timeUniforms) uniform.value = gsap.ticker.time
  }
  gsap.ticker.add(ticker)
})

onUnmounted(() => {
  if (ticker) gsap.ticker.remove(ticker)
  disposeWorld()
})
</script>

<style lang="scss" scoped>
.terrain-lab {
  position: fixed;
  inset: 0;

  .controls {
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 5;
    display: flex;
    gap: 6px;

    button {
      padding: 4px 12px;
      border: 1px solid #0d2f61;
      border-radius: 999px;
      background: #fffaf5;
      color: #0d2f61;
      text-transform: capitalize;
      cursor: pointer;

      &.active {
        background: #0d2f61;
        color: #fffaf5;
      }
    }
  }
}
</style>
