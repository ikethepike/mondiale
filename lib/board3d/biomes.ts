import Alea from 'alea'
import { weightedPick } from '~~/lib/arrays'

/**
 * A board's landscape voice: ramp + ink palette + noise character + flora,
 * proven technique-by-technique in the /test-terrain lab. The GAME PIECES —
 * tile discs, gate markers, pawns — never read from here: they stay their
 * cream-and-ink selves on every biome, so the ΔE-validated tile tints and
 * the marker language hold untouched.
 */
export interface BoardBiome {
  name: 'parchment' | 'grassland' | 'desert' | 'ice'
  /** Elevation ramp (flat→high) and the steep-ground tone. */
  valley: string
  mid: string
  crest: string
  rock: string
  /** Wet-ground tint pulled in near water. */
  lush: string
  /** Quantized hillshade: sun-facing and shaded slope tones. */
  lit: string
  shade: string
  /** Contour ink. */
  minor: string
  major: string
  snow: string
  atmosphere: string
  water: string
  foam: string
  /** fBm character: frequency multiplier, anisotropic stretch, amplitude. */
  frequency: number
  stretch: number
  hilliness: number
  /** Print strengths. */
  banding: number
  hachure: number
  /** Flora: prop silhouette + palette, blade-grass palette, sky life. */
  foliage: 'trees' | 'spires' | 'shards'
  foliageColor: string
  trunkColor: string
  foliageCount: number
  stippleColor: string
  /** Grass clump spots (desktop; phones halve) — 6 blades sprout per spot. */
  stippleCount: number
  birdCount: number
}

export const BOARD_BIOMES: Record<BoardBiome['name'], BoardBiome> = {
  // The classic editorial look — still the most common deal.
  parchment: {
    name: 'parchment',
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
    banding: 0.14,
    hachure: 0.22,
    foliage: 'trees',
    foliageColor: '#90bcb5',
    trunkColor: '#0d2f61',
    foliageCount: 50,
    stippleColor: '#a8c3b8',
    stippleCount: 900,
    birdCount: 8,
  },
  grassland: {
    name: 'grassland',
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
    banding: 0.14,
    hachure: 0.12,
    foliage: 'trees',
    foliageColor: '#5c8a52',
    trunkColor: '#6b4f35',
    foliageCount: 60,
    stippleColor: '#7fae6e',
    stippleCount: 1600,
    birdCount: 10,
  },
  desert: {
    name: 'desert',
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
    banding: 0.34,
    hachure: 0.2,
    foliage: 'spires',
    foliageColor: '#c98f5f',
    trunkColor: '#8a5a33',
    foliageCount: 22,
    stippleColor: '#9fc48b',
    stippleCount: 220,
    birdCount: 5,
  },
  ice: {
    name: 'ice',
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
    banding: 0.22,
    hachure: 0.16,
    foliage: 'shards',
    foliageColor: '#cfe2ec',
    trunkColor: '#8fb4c6',
    foliageCount: 28,
    stippleColor: '#dcebf2',
    stippleCount: 320,
    birdCount: 4,
  },
}

const BIOME_WEIGHTS: readonly (readonly [BoardBiome['name'], number])[] = [
  ['parchment', 40],
  ['grassland', 25],
  ['desert', 20],
  ['ice', 15],
]

/** The board's landscape deal — seeded like every other board draw, so every
 *  client and the server-side of nothing (terrain is client-only) agree. */
export const pickBoardBiome = (seed: string): BoardBiome => {
  const random = Alea(`${seed}:biome`)
  return BOARD_BIOMES[weightedPick(BIOME_WEIGHTS, random) ?? 'parchment']
}
