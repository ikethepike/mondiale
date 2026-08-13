/**
 * Deterministic "national-style" flag generator, seeded by a string (a short
 * commit hash on /health). Composition families, their weights, the palette
 * and its frequencies are all derived from a pixel-level study of the 197
 * real flags in flag-icons: horizontal stripes dominate (~90 flags incl.
 * emblem/canton variants), then hoist triangles, crosses, vertical tribands,
 * cantons, solid-field emblems, diagonals — plus rarer archetypes (pall,
 * quartered, bordure, hoist bar, serrated hoist, sunburst rays). A second
 * pass added the archetypes that study had missed: arms on a field (~20% of
 * real flags carry a shield), the hoist chevron, the colonial ensign whose
 * canton holds a whole flag, star-led designs, and the corner fan
 * (Seychelles). Red appears
 * in ~75% of real flags, white in ~66%, gold ~42%; flags carry 2–4
 * significant colors, and low-contrast pairs are separated by white/gold
 * fimbriation. Compositions that quantize to an actual country's flag are
 * re-picked (REAL_* guards) so no deploy accidentally flies the Netherlands.
 */
import { clamp } from '~~/lib/number'

export type ForgeFamily =
  | 'h-stripes'
  | 'v-stripes'
  | 'hoist-triangle'
  | 'nordic-cross'
  | 'canton'
  | 'field-emblem'
  | 'diagonal'
  | 'saltire'
  | 'pall'
  | 'quartered'
  | 'bordure'
  | 'hoist-bar'
  | 'serrated'
  | 'rays'
  | 'arms'
  | 'chevron'
  | 'ensign'
  | 'corner-fan'
  | 'starfield'

export interface ForgedFlag {
  seed: string
  family: ForgeFamily
  colors: string[]
  svg: string
}

const W = 900
const H = 600

interface FlagColor {
  name: string
  hex: string
  /** Selection weight ≈ share of real flags using the color. */
  w: number
}

const PALETTE: FlagColor[] = [
  { name: 'red', hex: '#CE1126', w: 30 },
  { name: 'white', hex: '#FFFFFF', w: 26 },
  { name: 'gold', hex: '#FCD116', w: 17 },
  { name: 'green', hex: '#007A3D', w: 15 },
  { name: 'blue', hex: '#0052B4', w: 10 },
  { name: 'navy', hex: '#002B7F', w: 8 },
  { name: 'black', hex: '#111111', w: 8 },
  { name: 'lightblue', hex: '#75AADB', w: 7 },
  { name: 'orange', hex: '#F77F00', w: 4 },
  { name: 'maroon', hex: '#8A1538', w: 3 },
  { name: 'darkgreen', hex: '#006233', w: 2 },
]

const WHITE = PALETTE[1]
const GOLD = PALETTE[2]

// --- seeded PRNG (xmur3 hash -> mulberry32) --------------------------------

const seededRng = (seed: string): (() => number) => {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let a = (Math.imul(h ^ (h >>> 16), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Rng = () => number

const int = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1))
const chance = (rng: Rng, p: number) => rng() < p
const pick = <T>(rng: Rng, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)]
const pickWeighted = <T extends { w: number }>(rng: Rng, arr: readonly T[]): T => {
  const total = arr.reduce((s, x) => s + x.w, 0)
  let r = rng() * total
  for (const x of arr) {
    r -= x.w
    if (r <= 0) return x
  }
  return arr[arr.length - 1]
}

// --- color rules ------------------------------------------------------------

const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))

/** Euclidean RGB distance — the vexillological "rule of tincture" stand-in. */
const dist = (a: FlagColor, b: FlagColor) => {
  const [r1, g1, b1] = rgb(a.hex)
  const [r2, g2, b2] = rgb(b.hex)
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2)
}

const contrasts = (a: FlagColor, b: FlagColor, min = 140) => dist(a, b) >= min

/**
 * A weighted color distinct from `taken` and contrasting with every neighbor
 * in `against`.
 *
 * When the constraints are unsatisfiable the fallback RELAXES the threshold
 * rather than abandoning it: the old version picked at random from whatever
 * was untaken, which could return the exact color of a neighbor — that is how
 * a red star ended up invisible on a red half. Contrast is the one rule worth
 * degrading gracefully instead of dropping, so it steps the minimum down and
 * finally takes whichever color is furthest from its neighbors.
 */
const pickColor = (
  rng: Rng,
  taken: FlagColor[],
  against: FlagColor[] = [],
  min = 140
): FlagColor => {
  const untaken = PALETTE.filter(c => !taken.includes(c))
  const pool = untaken.length ? untaken : PALETTE
  if (!against.length) return pickWeighted(rng, pool)
  for (let threshold = min; threshold >= 60; threshold -= 20) {
    const ok = pool.filter(c => against.every(a => contrasts(c, a, threshold)))
    if (ok.length) return pickWeighted(rng, ok)
  }
  // Nothing clears even the floor: take the color that is furthest from the
  // nearest neighbor, so the charge is still as legible as the palette allows.
  return pool.reduce((best, c) =>
    Math.min(...against.map(a => dist(c, a))) > Math.min(...against.map(a => dist(best, a)))
      ? c
      : best
  )
}

/** White or gold, whichever contrasts better with the given neighbors. */
const fimbriation = (against: FlagColor[]): FlagColor => {
  const score = (c: FlagColor) => Math.min(...against.map(a => dist(c, a)))
  return score(WHITE) >= score(GOLD) ? WHITE : GOLD
}

// --- anti-plagiarism guards ---------------------------------------------------
// Quantized color sequences of REAL flags (from the flag-icons pixel study).
// A generated composition matching one of these is a real flag in disguise —
// builders re-pick until the combination is fictional.

const REAL_STRIPES = new Set([
  'red>white>red',
  'red>gold>green',
  'orange>white>green',
  'red>white>black',
  'red>white>blue',
  'lightblue>white>lightblue',
  'gold>navy>red',
  'blue>white>blue',
  'green>gold>red',
  'red>white',
  'red>blue>orange',
  'lightblue>red>green',
  'black>gold>red',
  'lightblue>black>lightblue',
  'white>green>red',
  'navy>gold>red',
  'navy>white>red>white>navy',
  'lightblue>black>white',
  'navy>white>red',
  'green>gold>blue',
  'red>white>navy>white>green',
  'black>red>gold',
  'navy>red',
  'red>white>green',
  'green>white>orange',
  'white>blue>white>blue>white',
  'green>white>red',
  'red>navy>red',
  'maroon>white>maroon',
  'navy>white>green',
  'red>black>green',
  'gold>green>red',
  'red>green>red',
  'red>navy>gold>green',
  'green>white>green',
  'white>red',
  'blue>gold',
  'lightblue>gold',
  'white>blue>red',
  'white>lightblue',
  'green>white>blue',
  'green>white>red>white>green',
  'red>white>darkgreen',
  'red>white>navy>white>red',
  'black>gold>red>black>gold>red',
  'red>gold>red', // Spain's bands (the study filed ES under emblem flags)
])

const REAL_NORDIC = new Set([
  'red>white',
  'blue>gold',
  'white>blue',
  'white>lightblue',
  'red>white>navy',
  'navy>white>red',
  'lightblue>white>red',
])

// field|charge|kind: JP BD TR/TN VN MA SO MR EU
const REAL_EMBLEMS = new Set([
  'white|red|disc',
  'green|red|disc',
  'red|white|crescent-star',
  'red|gold|star',
  'red|green|star',
  'lightblue|white|star',
  'green|gold|crescent-star',
  'red|white|star',
  'navy|gold|stars-ring',
  'blue|gold|stars-ring',
])

// field>canton-ground>canton-charge: the Commonwealth blue ensigns (AU NZ FJ
// TV CK) and the red ensign. A navy/lightblue field under a red-or-white
// canton cross is one of them wearing a different hat.
const REAL_ENSIGNS = new Set([
  'navy>navy>red',
  'navy>navy>white',
  'navy>white>red',
  'navy>red>white',
  'lightblue>navy>red',
  'lightblue>navy>white',
  'red>navy>white',
  'white>navy>red',
])

// saltire>top/bottom>hoist/fly: JM, Scotland, AL(abama)
const REAL_SALTIRES = new Set([
  'gold>green>black',
  'white>navy>navy',
  'white>blue>blue',
  'red>white>white',
])

const seq = (colors: FlagColor[]) => colors.map(c => c.name).join('>')
const isRealStripes = (colors: FlagColor[]) =>
  REAL_STRIPES.has(seq(colors)) || REAL_STRIPES.has(seq([...colors].reverse()))

// --- drawing helpers --------------------------------------------------------

const n1 = (v: number) => +v.toFixed(1)
const rect = (x: number, y: number, w: number, h: number, c: FlagColor) =>
  `<rect x="${n1(x)}" y="${n1(y)}" width="${n1(w)}" height="${n1(h)}" fill="${c.hex}"/>`
const poly = (pts: Array<[number, number]>, c: FlagColor) =>
  `<polygon points="${pts.map(([x, y]) => `${n1(x)},${n1(y)}`).join(' ')}" fill="${c.hex}"/>`
const circle = (cx: number, cy: number, r: number, c: FlagColor) =>
  `<circle cx="${n1(cx)}" cy="${n1(cy)}" r="${n1(r)}" fill="${c.hex}"/>`

const starPath = (cx: number, cy: number, r: number, rot = -Math.PI / 2) => {
  const pts: string[] = []
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.382
    const a = (Math.PI / 5) * i + rot
    pts.push(`${n1(cx + rad * Math.cos(a))},${n1(cy + rad * Math.sin(a))}`)
  }
  return `M${pts.join('L')}Z`
}
const star = (cx: number, cy: number, r: number, c: FlagColor) =>
  `<path d="${starPath(cx, cy, r)}" fill="${c.hex}"/>`

/**
 * Place `n` stars inside a box without letting any two touch. Real
 * constellations (the Southern Cross on AU/NZ/PG/BR) are deliberate
 * arrangements — a pure random spray reads as a mistake the moment two stars
 * collide. Rejection-samples each point against the ones already placed and
 * shrinks the spacing if the box is too tight to satisfy, so it always returns
 * `n` stars rather than silently dropping some.
 */
const scatterStars = (
  rng: Rng,
  n: number,
  box: { x: number; y: number; w: number; h: number },
  radii: number[],
  c: FlagColor
): string[] => {
  const placed: Array<[number, number, number]> = []
  for (let i = 0; i < n; i++) {
    const r = radii[i % radii.length]
    let best: [number, number] | null = null
    // Relax the required gap as attempts run out, so a tight box still fills.
    for (let attempt = 0; attempt < 60; attempt++) {
      const gap = 1.25 - Math.min(0.45, attempt / 100)
      const x = box.x + r + rng() * Math.max(0, box.w - 2 * r)
      const y = box.y + r + rng() * Math.max(0, box.h - 2 * r)
      const clear = placed.every(([px, py, pr]) => Math.hypot(px - x, py - y) >= (r + pr) * gap)
      if (clear) {
        best = [x, y]
        break
      }
      if (attempt === 59) best = [x, y]
    }
    const [x, y] = best!
    placed.push([x, y, r])
  }
  return placed.map(([x, y, r]) => star(x, y, r, c))
}

type ChargeKind =
  | 'star'
  | 'stars-ring'
  | 'stars-arc'
  | 'crescent'
  | 'crescent-star'
  | 'disc'
  | 'disc-star'
  | 'sun'
  | 'trident'
  | 'cross-charge'
  | 'crosslet'
  | 'wreath-star'
  | 'shield'
  | 'mountain'
  | 'anchor'

const CHARGE_KINDS: Array<{ kind: ChargeKind; w: number }> = [
  { kind: 'star', w: 28 },
  { kind: 'stars-ring', w: 9 },
  { kind: 'stars-arc', w: 9 },
  { kind: 'crescent', w: 7 },
  { kind: 'crescent-star', w: 11 },
  { kind: 'disc', w: 12 },
  { kind: 'disc-star', w: 10 },
  { kind: 'sun', w: 8 },
  { kind: 'trident', w: 4 },
  { kind: 'cross-charge', w: 6 },
  { kind: 'crosslet', w: 5 },
  { kind: 'wreath-star', w: 5 },
  { kind: 'shield', w: 6 },
  { kind: 'mountain', w: 4 },
  { kind: 'anchor', w: 3 },
]

/**
 * Silhouettes whose outline counter-draws a hole (the anchor's ring). These
 * must fill with `evenodd`; everything else stays on the default `nonzero` so
 * overlapping subpaths merge into one solid shape.
 */
const HOLLOW_SILHOUETTES = new Set<ChargeKind>(['anchor'])

/** Peak-count and height bounds for a generated ridge, in the 0–100 box. */
const RIDGE = {
  minPeaks: 2,
  maxPeaks: 5,
  /**
   * Summit height above the baseline. The tallest peak lands in this band, and
   * the floor is high because a shallow ridge reads as a crown or a saw rather
   * than mountains — the silhouette needs most of the box's height.
   */
  minHeight: 62,
  maxHeight: 84,
  /**
   * Secondary summits, as a share of the tallest. Kept high so the range stays
   * a range: below about half, the shorter peaks read as foothill noise.
   */
  minPeakShare: 0.62,
  /**
   * A saddle's height as a share of its lower neighbouring summit. The floor
   * is high because a valley cut near the baseline severs the range into
   * detached spikes — mountains share a massif, they do not stand apart.
   */
  minSaddle: 0.52,
  maxSaddle: 0.78,
  baseline: 92,
} as const

/**
 * A mountain ridge with a seeded number of peaks at seeded relative heights —
 * every parameter clamped to RIDGE so the silhouette always reads as
 * mountains: at least two peaks, none taller than the box, and saddles that
 * dip enough to separate summits without cutting to the baseline.
 *
 * One outline, left to right: up the first flank, over each summit via its
 * saddle, then down the last flank and back along the baseline.
 */
const mountainPath = (rng: Rng): string => {
  const n = int(rng, RIDGE.minPeaks, RIDGE.maxPeaks)
  // Relative summit heights, normalised so the tallest hits the top band and
  // every other peak keeps at least `minPeakShare` of it.
  const rel = Array.from({ length: n }, () => RIDGE.minPeakShare + rng() * (1 - RIDGE.minPeakShare))
  const tallest = Math.max(...rel)
  const peakTop = RIDGE.minHeight + rng() * (RIDGE.maxHeight - RIDGE.minHeight)
  const heights = rel.map(v =>
    clamp((v / tallest) * peakTop, RIDGE.minHeight * RIDGE.minPeakShare, RIDGE.maxHeight)
  )
  // The range is centred and spans a width proportional to its height, so the
  // flanks sit at a mountain's slope rather than a crown's spike. Wider ranges
  // get more room, or five summits crowd into a picket fence.
  const peakTopActual = Math.max(...heights)
  const span = clamp(peakTopActual * (1.2 + 0.22 * (n - 1)), 44, 96)
  const x0 = clamp(50 - span / 2, 2, 50)
  const x1 = clamp(x0 + span, 50, 98)
  // The outer summits are INSET from the range's feet, so the silhouette rises
  // along a flank instead of jumping from the baseline straight to a peak (with
  // two peaks, that jump reads as a V rather than mountains).
  const flank = (x1 - x0) / (n + 1.6)
  const first = x0 + flank
  const last = x1 - flank
  const xs = heights.map((_, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1)
    const jitter = (rng() - 0.5) * ((last - first) / (n + 2)) * 0.35
    return clamp(first + t * (last - first) + jitter, x0 + flank * 0.5, x1 - flank * 0.5)
  })
  const y = (h: number) => RIDGE.baseline - h
  const pts: string[] = [`M${n1(x0)} ${RIDGE.baseline}`]
  for (let i = 0; i < n; i++) {
    pts.push(`L${n1(xs[i])} ${n1(y(heights[i]))}`)
    if (i < n - 1) {
      // Saddle between this summit and the next, as a share of the lower one.
      const lower = Math.min(heights[i], heights[i + 1])
      const k = RIDGE.minSaddle + rng() * (RIDGE.maxSaddle - RIDGE.minSaddle)
      const sx = (xs[i] + xs[i + 1]) / 2
      pts.push(`L${n1(sx)} ${n1(y(lower * k))}`)
    }
  }
  pts.push(`L${n1(x1)} ${RIDGE.baseline}`, 'Z')
  return pts.join(' ')
}

/** Bounds for a generated trident, in the 0–100 box. */
const TRIDENT = {
  /** Half-width of the shaft and the side prongs. */
  minBar: 2.6,
  maxBar: 4.4,
  /** Half-distance from the axis out to the side prongs. */
  minSpread: 15,
  maxSpread: 23,
  /** How far the side prongs rise above the crossbar. */
  minProng: 26,
  maxProng: 38,
  /** Length of each prong's tapered point, as a share of its rise. */
  minPoint: 0.3,
  maxPoint: 0.5,
  /**
   * The centre spearhead's half-width at its base, as a MULTIPLE of the bar.
   * Held near 1 so the head is a blade on a shaft of the same weight as the
   * prongs — an absolute half-width of 6–9.5 against a 2.6–4.4 bar made the
   * centre roughly twice as wide as its neighbours down its whole length,
   * which read as a solid wedge rather than a spearhead.
   */
  minHead: 1.15,
  maxHead: 1.75,
  /** Where the spearhead's blade starts, as a share of its total run. */
  minBlade: 0.42,
  maxBlade: 0.62,
  /**
   * How far BOTH edges of a side prong bow outward between the crossbar and
   * the tip, in box units. Both edges take the same offset, so the prong keeps
   * an even thickness along a curved axis — a real trident's outer tines sweep
   * away from the shaft, and a floor above zero keeps that sweep visible
   * rather than leaving the prong dead straight.
   */
  minBow: 2.5,
  maxBow: 7,
  /**
   * How deep the yoke's belly hangs below where the prongs branch, in box
   * units. A real trident has NO straight crossbar: the arms leave the shaft
   * on a continuous U and the prongs rise off that curve, so a flat bar with
   * curved tips grafted on reads as a pitchfork head.
   */
  minYoke: 9,
  maxYoke: 17,
} as const

/**
 * A trident whose prong length, spread, point taper and bar thickness are all
 * seeded and clamped. Every prong ends in a TAPERED POINT rather than a square
 * post — a blunt-ended version reads as a pitchfork, and an earlier curved one
 * bulged at the midpoint and read as a flexed arm.
 *
 * Traced as one outline: up the shaft, out along the crossbar, up the right
 * prong to its point and back down, into the centre spearhead, then mirrored
 * down the left side.
 */
const tridentPath = (rng: Rng): string => {
  const bar = TRIDENT.minBar + rng() * (TRIDENT.maxBar - TRIDENT.minBar)
  const spread = TRIDENT.minSpread + rng() * (TRIDENT.maxSpread - TRIDENT.minSpread)
  const rise = TRIDENT.minProng + rng() * (TRIDENT.maxProng - TRIDENT.minProng)
  const pointShare = TRIDENT.minPoint + rng() * (TRIDENT.maxPoint - TRIDENT.minPoint)
  const head = bar * (TRIDENT.minHead + rng() * (TRIDENT.maxHead - TRIDENT.minHead))
  const bladeShare = TRIDENT.minBlade + rng() * (TRIDENT.maxBlade - TRIDENT.minBlade)
  const bow = TRIDENT.minBow + rng() * (TRIDENT.maxBow - TRIDENT.minBow)
  const yoke = TRIDENT.minYoke + rng() * (TRIDENT.maxYoke - TRIDENT.minYoke)
  const cx = 50
  const foot = 97
  // The centre spearhead must clear the top of the box, so lay the shape out
  // from ITS tip downward rather than from the crossbar up — sizing from the
  // bar let a long prong push the spearhead off the top edge.
  const headTipY = 3
  const prongTipY = clamp(headTipY + 9, 6, 30)
  const barY = clamp(prongTipY + rise, 42, 62)
  const pointY = prongTipY + rise * pointShare
  // The centre runs from the bar to the tip at the SAME width as the prongs,
  // widening into a blade only over its top stretch.
  const bladeY = barY - (barY - headTipY) * bladeShare
  const p = (x: number, y: number) => `${n1(x)} ${n1(y)}`
  // A side prong's outer and inner edges each bow outward by `bow`, so the
  // prong keeps a constant thickness along a curved axis instead of swelling.
  //
  // The outline is traced anticlockwise from the foot, so each half is walked
  // in the opposite direction. Rather than hand-write both (a swap of which
  // edge comes first folded the right prong into a hook, then into a solid
  // wedge), build the LEFT half's vertices once and mirror them: symmetry then
  // holds by construction, whatever the parameters.
  // Each entry is either a point or a quadratic with its control point, given
  // for the left half in the order the outline visits them.
  type Step = { x: number; y: number; cx?: number; cy?: number }
  // There is no straight crossbar. The arm leaves the shaft on a U whose belly
  // hangs `yoke` below the branch point, sweeps out to the prong's foot, and
  // the prong rises off that curve — so the underside is one continuous line
  // from shaft to prong tip, never a flat slab with spikes on top.
  const outerX = cx - spread - bar - bow
  const innerX = cx - spread + bar - bow
  // The underside leaves the shaft here and bellies out to the prong's outer
  // edge; the topside returns on a shallower curve, leaving the arm thicker at
  // the shaft than at the tip, as a cast trident is.
  const yokeBellyY = barY + yoke
  const leftHalf: Step[] = [
    { x: cx - bar, y: foot },
    { x: cx - bar, y: yokeBellyY - yoke * 0.5 },
    // the yoke's underside: out and up to the prong's outer edge, one curve
    { x: outerX, y: pointY, cx: cx - spread * 0.72, cy: yokeBellyY },
    // the tip rides the bow too, so the whole prong sweeps outward
    { x: cx - spread - bow, y: prongTipY },
    { x: innerX, y: pointY },
    // back down the prong's inner edge into the yoke's throat
    { x: cx - bar, y: barY - bar, cx: cx - spread * 0.5, cy: barY - bar * 0.4 },
    // up the shaft to the blade
    { x: cx - bar, y: bladeY },
    { x: cx - head, y: bladeY },
  ]
  const draw = (s: Step) =>
    s.cx === undefined ? `L${p(s.x, s.y)} ` : `Q${p(s.cx, s.cy!)} ${p(s.x, s.y)} `
  const mx = (x: number) => 2 * cx - x
  return (
    `M${p(leftHalf[0].x, leftHalf[0].y)} ` +
    leftHalf.slice(1).map(draw).join('') +
    // the spearhead's tip, on the axis
    `L${p(cx, headTipY)} ` +
    // The right half is the left half mirrored and walked in reverse. A
    // quadratic's control point belongs to the segment ARRIVING at its vertex,
    // so on the way back down each step must carry the control point of the
    // vertex it is leaving — not the one it is heading to.
    leftHalf
      .map((s, i) => {
        const leaving = leftHalf[i + 1]
        return {
          x: mx(s.x),
          y: s.y,
          cx: leaving?.cx === undefined ? undefined : mx(leaving.cx),
          cy: leaving?.cy,
        }
      })
      .reverse()
      .map(draw)
      .join('') +
    'Z'
  )
}

/** Bounds for a generated anchor, in the 0–100 box. */
const ANCHOR = {
  /** Half-width of the shank. */
  minShank: 3.4,
  maxShank: 5.2,
  /** Outer radius of the ring at the top. */
  minRing: 8,
  maxRing: 12,
  /** Ring wall thickness, as a share of its outer radius. */
  minWall: 0.36,
  maxWall: 0.52,
  /** Half-length of the crossbar. */
  minStock: 17,
  maxStock: 26,
  /** How wide the arms sweep out from the axis. */
  minArm: 30,
  maxArm: 40,
  /** Fluke barb length. */
  minBarb: 7,
  maxBarb: 12,
} as const

/**
 * An anchor with seeded, clamped ring size, shank thickness, stock length, arm
 * sweep and barb length. One closed outline for the body (so no seam shows
 * where the parts meet) plus the ring's counter-drawn hole, which is why the
 * anchor is in HOLLOW_SILHOUETTES.
 */
const anchorPath = (rng: Rng): string => {
  const shank = ANCHOR.minShank + rng() * (ANCHOR.maxShank - ANCHOR.minShank)
  const ring = ANCHOR.minRing + rng() * (ANCHOR.maxRing - ANCHOR.minRing)
  const wall = ring * (ANCHOR.minWall + rng() * (ANCHOR.maxWall - ANCHOR.minWall))
  const stock = ANCHOR.minStock + rng() * (ANCHOR.maxStock - ANCHOR.minStock)
  const arm = ANCHOR.minArm + rng() * (ANCHOR.maxArm - ANCHOR.minArm)
  const barb = ANCHOR.minBarb + rng() * (ANCHOR.maxBarb - ANCHOR.minBarb)
  const cx = 50
  const ringTop = 4
  const ringCy = ringTop + ring
  const stockY = clamp(ringCy + ring + 4, 20, 40)
  const stockH = shank * 1.9
  const crownY = 92
  const armY = clamp(crownY - 22, 50, 76)
  const p = (x: number, y: number) => `${n1(x)} ${n1(y)}`
  return (
    // ring (outer), then down the right side of the shank
    `M${p(cx, ringTop)} A${n1(ring)} ${n1(ring)} 0 0 1 ${p(cx + shank, ringCy + ring * 0.72)} ` +
    `L${p(cx + shank, stockY)} ` +
    `L${p(cx + stock, stockY)} L${p(cx + stock, stockY + stockH)} L${p(cx + shank, stockY + stockH)} ` +
    // shank down to the crown, then out along the right arm. The arm's two
    // edges bow by different amounts so the fluke has real thickness — a
    // single-curvature sweep came out as a hairline.
    `L${p(cx + shank, crownY - 12)} ` +
    `Q${p(cx + arm * 0.58, armY + 20)} ${p(cx + arm, armY + 4)} ` +
    // barb: outward point, then back in along the fluke's underside
    `L${p(cx + arm + barb * 0.4, armY - barb * 0.8)} ` +
    `L${p(cx + arm + barb * 1.0, armY + barb * 1.05)} ` +
    `Q${p(cx + arm * 0.66, crownY + 2)} ${p(cx, crownY)} ` +
    // mirrored left side
    `Q${p(cx - arm * 0.66, crownY + 2)} ${p(cx - arm - barb * 1.0, armY + barb * 1.05)} ` +
    `L${p(cx - arm - barb * 0.4, armY - barb * 0.8)} L${p(cx - arm, armY + 4)} ` +
    `Q${p(cx - arm * 0.58, armY + 20)} ${p(cx - shank, crownY - 12)} ` +
    `L${p(cx - shank, stockY + stockH)} ` +
    `L${p(cx - stock, stockY + stockH)} L${p(cx - stock, stockY)} L${p(cx - shank, stockY)} ` +
    `L${p(cx - shank, ringCy + ring * 0.72)} ` +
    `A${n1(ring)} ${n1(ring)} 0 0 1 ${p(cx, ringTop)} Z ` +
    // the ring's hole
    `M${p(cx, ringCy - wall)} ` +
    `A${n1(wall)} ${n1(wall)} 0 1 0 ${p(cx, ringCy + wall)} ` +
    `A${n1(wall)} ${n1(wall)} 0 1 0 ${p(cx, ringCy - wall)} Z`
  )
}

/**
 * Fixed silhouettes drawn in a local 0–100 box, scaled to radius r. The
 * trident, anchor and mountain are NOT here — they are generated per flag by
 * `tridentPath`, `anchorPath` and `mountainPath`, whose proportions vary
 * within clamped bounds.
 */
const SILHOUETTES: Record<'crosslet', string> = {
  // Bolnur-Katskhuri cross (Georgia): equal arms whose ends flare outward in a
  // shallow concave curve. Repeats cleanly at any size, so it stays legible
  // where the figurative silhouettes would close up.
  crosslet:
    'M42 4 C43 14 43 22 42 30 C34 29 26 29 16 28 C17 34 17 42 16 48 ' +
    'C26 47 34 47 42 46 C43 54 43 62 42 72 C46 71 54 71 58 72 ' +
    'C57 62 57 54 58 46 C66 47 74 47 84 48 C83 42 83 34 84 28 ' +
    'C74 29 66 29 58 30 C57 22 57 14 58 4 C54 5 46 5 42 4 Z',
}

/** Draw a charge centered at (cx, cy) with outer radius r on background `bg`. */
const drawCharge = (
  rng: Rng,
  kind: ChargeKind,
  cx: number,
  cy: number,
  r: number,
  c: FlagColor,
  bg: FlagColor
): string => {
  // multi-star charges turn into illegible dots at small radii, and the
  // figurative silhouettes turn to mud
  if (r < 95 && (kind === 'stars-ring' || kind === 'stars-arc')) kind = 'star'
  if (r < 70 && kind === 'trident') kind = 'star'
  // The wreath's leaves and the shield's interior close up below this; the
  // bare charge inside them still reads.
  if (r < 80 && kind === 'wreath-star') kind = 'star'
  if (r < 90 && kind === 'shield') kind = 'disc'
  switch (kind) {
    case 'star':
      return star(cx, cy, r, c)
    // For both multi-star charges `r` is the charge's OUTER bound: the orbit
    // plus each star's own radius must fit inside it, or the ring spills past
    // the band it was sized to (stars landing on the neighbouring stripe).
    case 'stars-ring': {
      const n = int(rng, 5, 9)
      const sr = r * 0.24
      const orbit = r - sr
      const parts: string[] = []
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 2 * Math.PI - Math.PI / 2
        parts.push(star(cx + orbit * Math.cos(a), cy + orbit * Math.sin(a), sr, c))
      }
      return parts.join('')
    }
    case 'stars-arc': {
      const n = int(rng, 3, 6)
      const sr = r * 0.2
      const orbit = r - sr
      const parts: string[] = []
      for (let i = 0; i < n; i++) {
        const a = Math.PI * (1.15 + (i / (n - 1)) * 0.7) // arc over the top
        parts.push(star(cx + orbit * Math.cos(a), cy + orbit * Math.sin(a), sr, c))
      }
      return parts.join('')
    }
    case 'crescent':
      return circle(cx, cy, r, c) + circle(cx + r * 0.38, cy, r * 0.82, bg)
    case 'crescent-star':
      return (
        circle(cx - r * 0.15, cy, r * 0.85, c) +
        circle(cx + r * 0.17, cy, r * 0.7, bg) +
        star(cx + r * 0.55, cy, r * 0.38, c)
      )
    case 'disc':
      return circle(cx, cy, r, c)
    case 'disc-star': {
      const inner = fimbriation([c])
      return circle(cx, cy, r, c) + star(cx, cy, r * 0.62, inner)
    }
    case 'sun': {
      const n = int(rng, 8, 12)
      const parts = [circle(cx, cy, r * 0.52, c)]
      const w = (Math.PI / n) * 0.5
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 2 * Math.PI - Math.PI / 2
        parts.push(
          poly(
            [
              [cx + r * 0.62 * Math.cos(a - w), cy + r * 0.62 * Math.sin(a - w)],
              [cx + r * Math.cos(a), cy + r * Math.sin(a)],
              [cx + r * 0.62 * Math.cos(a + w), cy + r * 0.62 * Math.sin(a + w)],
            ],
            c
          )
        )
      }
      return parts.join('')
    }
    case 'trident':
    case 'crosslet':
    case 'mountain':
    case 'anchor': {
      const s = +((2 * r) / 100).toFixed(3)
      // Three of these vary their proportions per flag within clamped bounds;
      // the crosslet is a fixed path.
      const d =
        kind === 'mountain'
          ? mountainPath(rng)
          : kind === 'trident'
            ? tridentPath(rng)
            : kind === 'anchor'
              ? anchorPath(rng)
              : SILHOUETTES[kind]
      // Silhouettes carrying a counter-drawn hole (the anchor's ring) need
      // even-odd; the rest default to nonzero so their overlapping subpaths
      // merge instead of cancelling.
      const fr = HOLLOW_SILHOUETTES.has(kind) ? ' fill-rule="evenodd"' : ''
      return `<path d="${d}" fill="${c.hex}"${fr} transform="translate(${n1(cx - r)} ${n1(cy - r)}) scale(${s})"/>`
    }
    case 'cross-charge': {
      // Equal-armed cross, sometimes flared to a Maltese-ish silhouette.
      const t = r * (chance(rng, 0.35) ? 0.24 : 0.32)
      return (
        rect(cx - t, cy - r * 0.92, t * 2, r * 1.84, c) +
        rect(cx - r * 0.92, cy - t, r * 1.84, t * 2, c)
      )
    }
    case 'wreath-star': {
      // A charge inside an open laurel: two arcs of leaves, gapped at the top.
      const parts = [star(cx, cy, r * 0.46, c)]
      const leaves = int(rng, 7, 10)
      for (const side of [-1, 1]) {
        for (let i = 0; i < leaves; i++) {
          const a = Math.PI * (0.62 + (i / (leaves - 1)) * 0.76) * side + Math.PI / 2
          const lx = cx + r * 0.78 * Math.cos(a)
          const ly = cy + r * 0.78 * Math.sin(a)
          parts.push(
            `<ellipse cx="${n1(lx)}" cy="${n1(ly)}" rx="${n1(r * 0.16)}" ry="${n1(r * 0.07)}" fill="${c.hex}" transform="rotate(${n1((a * 180) / Math.PI)} ${n1(lx)} ${n1(ly)})"/>`
          )
        }
      }
      return parts.join('')
    }
    case 'shield': {
      // Heraldic escutcheon: flat chief, curved flanks, pointed base. Filled
      // with a simple ordinary (per fess / per pale / plain) so it reads as
      // arms rather than a blob, and outlined when it would vanish into `bg`.
      const w = r * 0.82
      const top = cy - r * 0.9
      const bot = cy + r * 0.95
      const path =
        `M${n1(cx - w)} ${n1(top)} L${n1(cx + w)} ${n1(top)} L${n1(cx + w)} ${n1(cy + r * 0.1)} ` +
        `Q${n1(cx + w)} ${n1(bot - r * 0.1)} ${n1(cx)} ${n1(bot)} ` +
        `Q${n1(cx - w)} ${n1(bot - r * 0.1)} ${n1(cx - w)} ${n1(cy + r * 0.1)} Z`
      // The shield's ground must read against BOTH the flag behind it and the
      // charge inside it — `fimbriation` alone can hand back the same white as
      // a white stripe, and the shield loses its edge.
      const field =
        PALETTE.filter(p => p !== c && contrasts(p, bg, 120) && contrasts(p, c, 140)).sort(
          (a, z) => Math.min(dist(z, bg), dist(z, c)) - Math.min(dist(a, bg), dist(a, c))
        )[0] ?? fimbriation([bg, c])
      const parts = [`<path d="${path}" fill="${field.hex}"/>`]
      // One ordinary inside, in the charge colour.
      const ordinary = int(rng, 0, 2)
      const clip = `sh${n1(cx)}${n1(cy)}`.replace(/[^a-z0-9]/gi, '')
      parts.unshift(`<clipPath id="${clip}"><path d="${path}"/></clipPath>`)
      const inner: string[] = []
      if (ordinary === 0) inner.push(rect(cx - w, cy, w * 2, bot - cy, c))
      else if (ordinary === 1) inner.push(rect(cx, top, w, bot - top, c))
      else inner.push(star(cx, cy + r * 0.05, r * 0.42, c))
      if (ordinary < 2) parts.push(`<g clip-path="url(#${clip})">${inner.join('')}</g>`)
      else parts.push(...inner)
      parts.push(`<path d="${path}" fill="none" stroke="${c.hex}" stroke-width="${n1(r * 0.07)}"/>`)
      return parts.join('')
    }
  }
}

// --- family builders --------------------------------------------------------

interface Built {
  family: ForgeFamily
  parts: string[]
  used: FlagColor[]
}

const buildHStripes = (rng: Rng, allowCharge = true): Built => {
  const n = pickWeighted(rng, [
    { v: 2, w: 22 },
    { v: 3, w: 58 },
    { v: 5, w: 20 },
  ]).v
  const parts: string[] = []
  let colors: FlagColor[]
  if (n === 5) {
    const a = pickColor(rng, [])
    const b = pickColor(rng, [a], [a])
    colors = chance(rng, 0.5) ? [a, b, a, b, a] : [a, b, pickColor(rng, [a, b], [b]), b, a]
  } else {
    colors = [pickColor(rng, [])]
    for (let i = 1; i < n; i++) colors.push(pickColor(rng, colors, [colors[i - 1]]))
  }
  for (let guard = 0; isRealStripes(colors) && guard < 4; guard++) {
    const i = Math.floor(colors.length / 2)
    colors[i] = pickColor(rng, colors, [colors[i - 1], colors[i + 1]].filter(Boolean))
  }
  const stillReal = isRealStripes(colors)
  // Spanish 1:2:1 middle band, sometimes
  const weights = n === 3 && chance(rng, 0.25) ? [1, 2, 1] : Array(colors.length).fill(1)
  const total = weights.reduce((s, w) => s + w, 0)
  let y = 0
  const bounds: Array<[number, number]> = []
  for (let i = 0; i < colors.length; i++) {
    const h = (H * weights[i]) / total
    parts.push(rect(0, y, W, h, colors[i]))
    bounds.push([y, h])
    y += h
  }
  const used = [...new Set(colors)]
  if (allowCharge && (stillReal || chance(rng, 0.38))) {
    const mid = Math.floor(colors.length / 2)
    const [by, bh] = bounds[mid]
    const bg = colors[mid]
    const c = pickColor(rng, [], [bg], 180)
    const r = Math.min(bh * 0.42, H * 0.24)
    parts.push(drawCharge(rng, pickWeighted(rng, CHARGE_KINDS).kind, W / 2, by + bh / 2, r, c, bg))
    used.push(c)
  } else if (allowCharge && chance(rng, 0.2)) {
    // small device in the upper hoist (Turkey-on-stripes / Myanmar style)
    const bg = colors[0]
    const c = pickColor(rng, [], [bg], 180)
    parts.push(
      drawCharge(
        rng,
        pick(rng, ['star', 'crescent-star'] as const),
        W * 0.18,
        bounds[0][1] / 2 + bounds[0][0],
        bounds[0][1] * 0.34,
        c,
        bg
      )
    )
    used.push(c)
  }
  return { family: 'h-stripes', parts, used: [...new Set(used)] }
}

const buildVStripes = (rng: Rng): Built => {
  const n = chance(rng, 0.85) ? 3 : 2
  const colors = [pickColor(rng, [])]
  for (let i = 1; i < n; i++) colors.push(pickColor(rng, colors, [colors[i - 1]]))
  for (let guard = 0; isRealStripes(colors) && guard < 4; guard++) {
    const i = Math.floor(n / 2)
    colors[i] = pickColor(rng, colors, [colors[i - 1], colors[i + 1]].filter(Boolean))
  }
  const stillReal = isRealStripes(colors)
  const weights = n === 3 && chance(rng, 0.25) ? [1, 2, 1] : Array(n).fill(1)
  const total = weights.reduce((s: number, w: number) => s + w, 0)
  const parts: string[] = []
  let x = 0
  const bounds: Array<[number, number]> = []
  for (let i = 0; i < n; i++) {
    const w = (W * weights[i]) / total
    parts.push(rect(x, 0, w, H, colors[i]))
    bounds.push([x, w])
    x += w
  }
  const used = [...colors]
  if (stillReal || chance(rng, 0.35)) {
    const mid = Math.floor(n / 2)
    const bg = colors[mid]
    const c = pickColor(rng, [], [bg], 180)
    const [bx, bw] = bounds[mid]
    parts.push(
      drawCharge(
        rng,
        pickWeighted(rng, CHARGE_KINDS).kind,
        bx + bw / 2,
        H / 2,
        Math.min(bw * 0.36, H * 0.22),
        c,
        bg
      )
    )
    used.push(c)
  }
  return { family: 'v-stripes', parts, used: [...new Set(used)] }
}

const buildHoistTriangle = (rng: Rng): Built => {
  const base = buildHStripes(rng, false)
  const edgeColors = [base.used[0], base.used[base.used.length - 1]]
  const tri = pickColor(rng, base.used, edgeColors)
  const tw = W * (0.32 + rng() * 0.14)
  const parts = [...base.parts]
  if (!edgeColors.every(c => contrasts(tri, c, 140))) {
    const f = fimbriation([tri, ...edgeColors])
    parts.push(
      poly(
        [
          [0, 0],
          [tw + 24, H / 2],
          [0, H],
        ],
        f
      )
    )
  }
  parts.push(
    poly(
      [
        [0, 0],
        [tw, H / 2],
        [0, H],
      ],
      tri
    )
  )
  const used = [...base.used, tri]
  if (chance(rng, 0.45)) {
    const c = pickColor(rng, [], [tri], 180)
    parts.push(
      drawCharge(
        rng,
        pick(rng, ['star', 'star', 'stars-arc', 'crescent-star'] as const),
        tw * 0.38,
        H / 2,
        H * 0.13,
        c,
        tri
      )
    )
    used.push(c)
  }
  return { family: 'hoist-triangle', parts, used: [...new Set(used)] }
}

const buildNordicCross = (rng: Rng): Built => {
  const field = pickColor(rng, [])
  let cross = pickColor(rng, [field], [field])
  const withInner = chance(rng, 0.45)
  let inner = withInner ? pickColor(rng, [field, cross], [cross]) : null
  for (
    let guard = 0;
    REAL_NORDIC.has(seq([field, cross, ...(inner ? [inner] : [])])) && guard < 4;
    guard++
  ) {
    cross = pickColor(rng, [field, cross], [field])
    if (inner) inner = pickColor(rng, [field, cross, inner], [cross])
  }
  const t = H * (0.14 + rng() * 0.06)
  const cx = W * 0.36
  const parts = [
    rect(0, 0, W, H, field),
    rect(0, (H - t) / 2, W, t, cross),
    rect(cx - t / 2, 0, t, H, cross),
  ]
  const used = [field, cross]
  if (inner) {
    const it = t * 0.45
    parts.push(rect(0, (H - it) / 2, W, it, inner), rect(cx - it / 2, 0, it, H, inner))
    used.push(inner)
  }
  return { family: 'nordic-cross', parts, used }
}

const buildCanton = (rng: Rng): Built => {
  const parts: string[] = []
  const used: FlagColor[] = []
  const striped = chance(rng, 0.6)
  let fieldTop: FlagColor
  if (striped) {
    const a = pickColor(rng, [])
    const b = pickColor(rng, [a], [a])
    const n = pick(rng, [5, 7, 9] as const)
    for (let i = 0; i < n; i++) parts.push(rect(0, (H * i) / n, W, H / n, i % 2 === 0 ? a : b))
    fieldTop = a
    used.push(a, b)
  } else {
    fieldTop = pickColor(rng, [])
    parts.push(rect(0, 0, W, H, fieldTop))
    used.push(fieldTop)
  }
  const canton = pickColor(rng, used, [fieldTop])
  const cw = W * 0.42
  const ch = H * 0.5
  parts.push(rect(0, 0, cw, ch, canton))
  used.push(canton)
  const c = pickColor(rng, [], [canton], 180)
  const kind = pick(rng, ['star', 'stars-ring', 'stars-ring', 'crescent-star'] as const)
  parts.push(drawCharge(rng, kind, cw / 2, ch / 2, ch * 0.34, c, canton))
  used.push(c)
  return { family: 'canton', parts, used: [...new Set(used)] }
}

const buildFieldEmblem = (rng: Rng): Built => {
  const field = pickColor(rng, [])
  let c = pickColor(rng, [field], [field], 180)
  let kind = pickWeighted(rng, CHARGE_KINDS).kind
  for (let guard = 0; REAL_EMBLEMS.has(`${field.name}|${c.name}|${kind}`) && guard < 4; guard++) {
    kind = pickWeighted(rng, CHARGE_KINDS).kind
    c = pickColor(rng, [field, c], [field], 180)
  }
  const cx = chance(rng, 0.3) ? W * 0.44 : W / 2 // hoist-shifted, Bangladesh-style
  const parts = [rect(0, 0, W, H, field), drawCharge(rng, kind, cx, H / 2, H * 0.27, c, field)]
  return { family: 'field-emblem', parts, used: [field, c] }
}

const buildDiagonal = (rng: Rng): Built => {
  const a = pickColor(rng, [])
  const b = pickColor(rng, [a], [a])
  const band = pickColor(rng, [a, b], [], 0)
  const rising = chance(rng, 0.5) // lower-hoist -> upper-fly
  const parts = rising
    ? [
        poly(
          [
            [0, 0],
            [W, 0],
            [0, H],
          ],
          a
        ),
        poly(
          [
            [W, 0],
            [W, H],
            [0, H],
          ],
          b
        ),
      ]
    : [
        poly(
          [
            [0, 0],
            [W, 0],
            [W, H],
          ],
          a
        ),
        poly(
          [
            [0, 0],
            [W, H],
            [0, H],
          ],
          b
        ),
      ]
  // fimbriated central band, Tanzania/DRC style — a vertical ±dy offset of the
  // diagonal line; overflow past the corners is clipped by the viewBox
  const dy = H * 0.13
  const diagBand = (d: number, c: FlagColor) =>
    rising
      ? poly(
          [
            [0, H - d],
            [W, -d],
            [W, d],
            [0, H + d],
          ],
          c
        )
      : poly(
          [
            [0, -d],
            [W, H - d],
            [W, H + d],
            [0, d],
          ],
          c
        )
  const needsFimbriation = !contrasts(band, a) || !contrasts(band, b)
  const f = fimbriation([a, b, band])
  if (needsFimbriation) parts.push(diagBand(dy * 1.55, f))
  parts.push(diagBand(dy, band))
  const used = [a, b, band]
  if (needsFimbriation) used.push(f)
  return { family: 'diagonal', parts, used: [...new Set(used)] }
}

const buildSaltire = (rng: Rng): Built => {
  let saltire = pickColor(rng, [])
  const tb = pickColor(rng, [saltire], [saltire])
  const lr = chance(rng, 0.55) ? pickColor(rng, [saltire, tb], [saltire]) : tb
  for (let guard = 0; REAL_SALTIRES.has(seq([saltire, tb, lr])) && guard < 4; guard++) {
    saltire = pickColor(rng, [saltire, tb, lr], [tb, lr])
  }
  const parts = [
    poly(
      [
        [0, 0],
        [W, 0],
        [W / 2, H / 2],
      ],
      tb
    ),
    poly(
      [
        [0, H],
        [W, H],
        [W / 2, H / 2],
      ],
      tb
    ),
    poly(
      [
        [0, 0],
        [0, H],
        [W / 2, H / 2],
      ],
      lr
    ),
    poly(
      [
        [W, 0],
        [W, H],
        [W / 2, H / 2],
      ],
      lr
    ),
  ]
  const t = H * 0.11
  const dx = t * 0.9
  const bar = (x1: number, y1: number, x2: number, y2: number, tt: number, c: FlagColor) =>
    poly(
      [
        [x1 - tt, y1],
        [x1 + tt, y1],
        [x2 + tt, y2],
        [x2 - tt, y2],
      ],
      c
    )
  if (!contrasts(saltire, tb) || !contrasts(saltire, lr)) {
    const f = fimbriation([saltire, tb, lr])
    parts.push(bar(0, 0, W, H, dx * 1.6, f), bar(W, 0, 0, H, dx * 1.6, f))
  }
  parts.push(bar(0, 0, W, H, dx, saltire), bar(W, 0, 0, H, dx, saltire))
  return { family: 'saltire', parts, used: [...new Set([saltire, tb, lr])] }
}

const buildPall = (rng: Rng): Built => {
  const top = pickColor(rng, [])
  const bottom = chance(rng, 0.6) ? pickColor(rng, [top]) : top
  const pall = pickColor(rng, [top, bottom])
  // the triangle merges invisibly with a same-colored field half
  const tri = pickColor(rng, [pall, top, bottom], [pall])
  const x = W * 0.36
  const t = H * 0.17
  // The V is ONE polyline so the fork gets a clean miter join (two subpaths
  // leave butt-cap wedges there); the ends overshoot the hoist corners so the
  // caps are clipped away by the viewBox. The horizontal bar starts under the
  // bend, where the same-color overlap hides the seam.
  const L = Math.hypot(x, H / 2)
  const [ex, ey] = [(x / L) * t * 2, (H / 2 / L) * t * 2]
  const vPath = `M${n1(-ex)} ${n1(-ey)} L${n1(x)} ${H / 2} L${n1(-ex)} ${n1(H + ey)}`
  const vStroke = (tt: number, c: FlagColor) =>
    `<path d="${vPath}" fill="none" stroke="${c.hex}" stroke-width="${n1(tt)}"/>`
  const bar = (tt: number, c: FlagColor) => rect(x - t / 2, H / 2 - tt / 2, W - x + t / 2, tt, c)
  const parts = [rect(0, 0, W, H / 2, top), rect(0, H / 2, W, H / 2, bottom)]
  const used = [top, bottom, pall, tri]
  const f = fimbriation([pall, top, bottom, tri])
  const needsFimbriation = !contrasts(pall, top) || !contrasts(pall, bottom)
  if (needsFimbriation) {
    parts.push(vStroke(t * 1.55, f), bar(t * 1.55, f))
    used.push(f)
  }
  parts.push(vStroke(t, pall), bar(t, pall))
  // hoist triangle nested inside the fork, South Africa style — sized to the
  // V's inner edge (fimbriated or not) so no field sliver shows at the seam
  const k = needsFimbriation ? 1.0 : 0.62
  parts.push(
    poly(
      [
        [0, k * t],
        [x - k * t * 1.1, H / 2],
        [0, H - k * t],
      ],
      tri
    )
  )
  return { family: 'pall', parts, used: [...new Set(used)] }
}

const buildQuartered = (rng: Rng): Built => {
  const a = pickColor(rng, [])
  const b = pickColor(rng, [a], [a])
  const parts = [
    rect(0, 0, W / 2, H / 2, a),
    rect(W / 2, 0, W / 2, H / 2, b),
    rect(0, H / 2, W / 2, H / 2, b),
    rect(W / 2, H / 2, W / 2, H / 2, a),
  ]
  const used = [a, b]
  if (chance(rng, 0.65)) {
    // Panama-style devices in two opposite quarters
    const c1 = pickColor(rng, [], [a], 180)
    const c2 = chance(rng, 0.5) ? c1 : pickColor(rng, [], [a], 180)
    const kind = pick(rng, ['star', 'star', 'disc', 'crescent'] as const)
    parts.push(drawCharge(rng, kind, W / 4, H / 4, H * 0.14, c1, a))
    parts.push(drawCharge(rng, kind, (3 * W) / 4, (3 * H) / 4, H * 0.14, c2, a))
    used.push(c1, c2)
  }
  return { family: 'quartered', parts, used: [...new Set(used)] }
}

const buildBordure = (rng: Rng): Built => {
  const field = pickColor(rng, [])
  // a white border reads as no border at all against light surroundings
  const border = pickColor(rng, [field, WHITE], [field])
  const bw = H * (0.09 + rng() * 0.05)
  const parts = [rect(0, 0, W, H, border), rect(bw, bw, W - 2 * bw, H - 2 * bw, field)]
  const used = [field, border]
  if (chance(rng, 0.75)) {
    const c = pickColor(rng, [], [field], 180)
    parts.push(
      drawCharge(rng, pickWeighted(rng, CHARGE_KINDS).kind, W / 2, H / 2, H * 0.22, c, field)
    )
    used.push(c)
  }
  return { family: 'bordure', parts, used: [...new Set(used)] }
}

const buildHoistBar = (rng: Rng): Built => {
  const bar = pickColor(rng, [])
  const n = chance(rng, 0.7) ? 3 : 2
  const colors = [pickColor(rng, [bar], [bar])]
  for (let i = 1; i < n; i++) colors.push(pickColor(rng, [bar, ...colors], [colors[i - 1], bar]))
  const bw = W * (0.25 + rng() * 0.08)
  const parts: string[] = []
  for (let i = 0; i < n; i++) parts.push(rect(bw, (H * i) / n, W - bw, H / n, colors[i]))
  parts.push(rect(0, 0, bw, H, bar))
  const used = [bar, ...colors]
  if (chance(rng, 0.3)) {
    const c = pickColor(rng, [], [bar], 180)
    parts.push(
      drawCharge(
        rng,
        pick(rng, ['star', 'crescent-star'] as const),
        bw / 2,
        H / 2,
        bw * 0.32,
        c,
        bar
      )
    )
    used.push(c)
  }
  return { family: 'hoist-bar', parts, used: [...new Set(used)] }
}

const buildSerrated = (rng: Rng): Built => {
  const hoist = pickColor(rng, [])
  const fly = pickColor(rng, [hoist], [hoist])
  const xs = W * 0.3
  const teeth = pick(rng, [7, 9, 11] as const)
  const amp = W * 0.09
  const pts: Array<[number, number]> = [
    [0, 0],
    [xs, 0],
  ]
  for (let i = 0; i < teeth; i++) {
    pts.push([xs + amp, (H * (i + 0.5)) / teeth], [xs, (H * (i + 1)) / teeth])
  }
  pts.push([0, H])
  const parts = [rect(0, 0, W, H, fly), poly(pts, hoist)]
  return { family: 'serrated', parts, used: [hoist, fly] }
}

const REAL_RAYS = new Set(['white>red', 'red>gold']) // Japanese naval ensign, North Macedonia

const buildRays = (rng: Rng): Built => {
  const field = pickColor(rng, [])
  let ray = pickColor(rng, [field], [field], 180)
  for (let guard = 0; REAL_RAYS.has(seq([field, ray])) && guard < 4; guard++) {
    ray = pickColor(rng, [field, ray], [field], 180)
  }
  const nRays = pick(rng, [8, 10, 12] as const)
  const cx = W / 2
  const cy = H / 2
  const delta = (Math.PI / nRays) * 0.38
  const R = W
  const parts = [rect(0, 0, W, H, field)]
  for (let i = 0; i < nRays; i++) {
    const a = (i / nRays) * 2 * Math.PI - Math.PI / 2
    parts.push(
      poly(
        [
          [cx, cy],
          [cx + R * Math.cos(a - delta), cy + R * Math.sin(a - delta)],
          [cx + R * Math.cos(a + delta), cy + R * Math.sin(a + delta)],
        ],
        ray
      )
    )
  }
  // sun disc set off from the rays by a thin ring of field, Macedonia style
  parts.push(circle(cx, cy, H * 0.19, field), circle(cx, cy, H * 0.155, ray))
  return { family: 'rays', parts, used: [field, ray] }
}

/**
 * Arms on a field — the corpus's biggest archetype after stripes (~20% of real
 * flags carry a shield or heraldic device). The field is a plain or striped
 * ground so the shield stays the subject; `drawCharge` degrades it to a disc
 * below the radius where its interior closes up.
 */
const buildArms = (rng: Rng): Built => {
  const striped = chance(rng, 0.45)
  const parts: string[] = []
  const used: FlagColor[] = []
  let bg: FlagColor
  if (striped) {
    const colors = [pickColor(rng, [])]
    for (let i = 1; i < 3; i++) colors.push(pickColor(rng, colors, [colors[i - 1]]))
    for (let guard = 0; isRealStripes(colors) && guard < 4; guard++) {
      colors[1] = pickColor(rng, colors, [colors[0], colors[2]])
    }
    for (let i = 0; i < 3; i++) parts.push(rect(0, (H * i) / 3, W, H / 3, colors[i]))
    bg = colors[1]
    used.push(...colors)
  } else {
    bg = pickColor(rng, [])
    parts.push(rect(0, 0, W, H, bg))
    used.push(bg)
  }
  const c = pickColor(rng, [], [bg], 180)
  parts.push(drawCharge(rng, 'shield', W / 2, H / 2, H * 0.3, c, bg))
  used.push(c)
  return { family: 'arms', parts, used: [...new Set(used)] }
}

/**
 * Chevron — a band following the hoist wedge's angle rather than filling it.
 * Single (Jordan/Sudan) or stacked (Djibouti/Mozambique register). Distinct
 * from `hoist-triangle`, which fills the wedge solid.
 */
const buildChevron = (rng: Rng): Built => {
  const base = buildHStripes(rng, false)
  const edges = [base.used[0], base.used[base.used.length - 1]]
  const parts = [...base.parts]
  const used = [...base.used]
  const depth = W * (0.3 + rng() * 0.12)
  const wedge = (d: number, c: FlagColor) =>
    poly(
      [
        [0, 0],
        [d, H / 2],
        [0, H],
      ],
      c
    )
  const layers = chance(rng, 0.4) ? 2 : 1
  let d = depth
  for (let i = 0; i < layers; i++) {
    const c = pickColor(rng, used, edges)
    if (!edges.every(e => contrasts(c, e, 140)) && i === 0) {
      const f = fimbriation([c, ...edges])
      parts.push(wedge(d + W * 0.03, f))
      used.push(f)
    }
    parts.push(wedge(d, c))
    used.push(c)
    d *= 0.52
  }
  if (layers === 1 && chance(rng, 0.5)) {
    const tip = used[used.length - 1]
    const c = pickColor(rng, [], [tip], 180)
    parts.push(drawCharge(rng, pick(rng, ['star', 'crosslet'] as const), depth * 0.34, H / 2, H * 0.12, c, tip))
    used.push(c)
  }
  return { family: 'chevron', parts, used: [...new Set(used)] }
}

/**
 * Colonial ensign — the canton carries a WHOLE flag rather than a charge
 * (AU, NZ, FJ, TV, CK). The canton flag is forged recursively from a
 * restricted set of simple families, so the inset never becomes a busy mess.
 */
const buildEnsign = (rng: Rng): Built => {
  let field = pickColor(rng, [])
  const cw = W * 0.42
  const ch = H * 0.5
  // The inset is its own little flag: a cross, saltire or triband.
  const inner = pick(rng, ['cross', 'saltire', 'triband'] as const)
  let a = pickColor(rng, [field], [field])
  let b = pickColor(rng, [field, a], [a])
  // A navy field under a red-on-white saltire canton IS the Australian/NZ
  // ensign. Re-pick until the combination stops being a real one.
  for (let guard = 0; REAL_ENSIGNS.has(seq([field, a, b])) && guard < 4; guard++) {
    field = pickColor(rng, [field, a, b], [a])
    a = pickColor(rng, [field], [field])
    b = pickColor(rng, [field, a], [a])
  }
  const parts = [rect(0, 0, W, H, field)]
  const used = [field]
  const sub: string[] = [`<rect x="0" y="0" width="${n1(cw)}" height="${n1(ch)}" fill="${a.hex}"/>`]
  if (inner === 'cross') {
    const t = ch * 0.22
    sub.push(
      `<rect x="0" y="${n1((ch - t) / 2)}" width="${n1(cw)}" height="${n1(t)}" fill="${b.hex}"/>`,
      `<rect x="${n1(cw * 0.38 - t / 2)}" y="0" width="${n1(t)}" height="${n1(ch)}" fill="${b.hex}"/>`
    )
  } else if (inner === 'saltire') {
    const t = ch * 0.16
    sub.push(
      `<path d="M0 0L${n1(cw)} ${n1(ch)}" stroke="${b.hex}" stroke-width="${n1(t)}" fill="none"/>`,
      `<path d="M${n1(cw)} 0L0 ${n1(ch)}" stroke="${b.hex}" stroke-width="${n1(t)}" fill="none"/>`
    )
  } else {
    for (let i = 0; i < 3; i++)
      sub.push(
        `<rect x="0" y="${n1((ch * i) / 3)}" width="${n1(cw)}" height="${n1(ch / 3)}" fill="${(i % 2 ? b : a).hex}"/>`
      )
  }
  // The saltire's strokes run corner to corner with a finite width, so they
  // spill past the canton box unless it is clipped to itself.
  const clip = 'cn' + n1(cw) + n1(ch)
  parts.push(
    `<clipPath id="${clip}"><rect x="0" y="0" width="${n1(cw)}" height="${n1(ch)}"/></clipPath>` +
      `<g clip-path="url(#${clip})">${sub.join('')}</g>`
  )
  used.push(a, b)
  // A constellation in the fly — deliberate placement, never a random spray:
  // one larger lead star with smaller companions, none of them touching.
  const c = pickColor(rng, [], [field], 180)
  const n = int(rng, 4, 6)
  const radii = [H * 0.085, H * 0.06, H * 0.055, H * 0.05, H * 0.045, H * 0.04]
  parts.push(
    ...scatterStars(rng, n, { x: W * 0.55, y: H * 0.1, w: W * 0.38, h: H * 0.78 }, radii, c)
  )
  used.push(c)
  return { family: 'ensign', parts, used: [...new Set(used)] }
}

/**
 * Corner fan — oblique bands radiating from the lower-hoist corner to the fly
 * and top edges (Seychelles). Each band is a triangle sharing that vertex, so
 * the rays stay clean at any aspect.
 */
const buildCornerFan = (rng: Rng): Built => {
  const n = int(rng, 4, 5)
  const colors = [pickColor(rng, [])]
  for (let i = 1; i < n; i++) colors.push(pickColor(rng, colors, [colors[i - 1]]))
  const parts: string[] = []
  // Every ray is a wedge between two ADJACENT boundary points, all sharing the
  // lower-hoist vertex — drawing them side by side rather than stacking, so
  // each colour keeps its own slice.
  //
  // The boundaries walk the perimeter anticlockwise from the top-hoist corner,
  // across the top edge, then down the fly: that is the sweep Seychelles makes.
  const edge = (t: number): [number, number] => {
    // t in [0,1] walks (0,0) -> (W,0) -> (W,H).
    const along = t * (W + H)
    return along <= W ? [along, 0] : [W, along - W]
  }
  for (let i = 0; i < n; i++) {
    const a = edge(i / n)
    const b = edge((i + 1) / n)
    // A wedge can span the top-fly corner; include it so the ray stays convex.
    const pts: Array<[number, number]> = [[0, H], a]
    if (a[1] === 0 && b[0] === W && b[1] > 0) pts.push([W, 0])
    pts.push(b)
    parts.push(poly(pts, colors[i]))
  }
  return { family: 'corner-fan', parts, used: [...new Set(colors)] }
}

/**
 * Star field — the flag IS its stars. Real flags arrange them in a ring (EU,
 * CV), an arc (VE, HN), a constellation (BR, AU, PG), a grid (US) or a
 * southern-cross scatter, on a plain or two-part ground. Distinct from a
 * single centred charge: here the arrangement carries the whole design.
 */
const buildStarfield = (rng: Rng): Built => {
  const split = pickWeighted(rng, [
    { v: 'plain', w: 46 },
    { v: 'bicolour', w: 28 },
    { v: 'canton-less-stripes', w: 26 },
  ]).v
  const parts: string[] = []
  const used: FlagColor[] = []
  // A star layout spans the WHOLE field, so the charge colour has to clear
  // every ground it crosses — not just the first. Picking against one half of
  // a bicolour left red stars invisible on the red half.
  const grounds: FlagColor[] = []
  if (split === 'plain') {
    const a = pickColor(rng, [])
    parts.push(rect(0, 0, W, H, a))
    used.push(a)
    grounds.push(a)
  } else if (split === 'bicolour') {
    const a = pickColor(rng, [])
    const b = pickColor(rng, [a], [a])
    const horizontal = chance(rng, 0.6)
    parts.push(
      rect(0, 0, W, H, a),
      horizontal ? rect(0, H / 2, W, H / 2, b) : rect(W / 2, 0, W / 2, H, b)
    )
    used.push(a, b)
    grounds.push(a, b)
  } else {
    const a = pickColor(rng, [])
    const b = pickColor(rng, [a], [a])
    const n = pick(rng, [5, 7, 9] as const)
    for (let i = 0; i < n; i++) parts.push(rect(0, (H * i) / n, W, H / n, i % 2 === 0 ? a : b))
    used.push(a, b)
    grounds.push(a, b)
  }
  const c = pickColor(rng, [], grounds, 180)
  used.push(c)
  const cx = split === 'bicolour' ? W * 0.5 : W / 2
  const cy = H / 2
  const layout = pickWeighted(rng, [
    { v: 'ring', w: 26 },
    { v: 'arc', w: 20 },
    { v: 'constellation', w: 22 },
    { v: 'grid', w: 14 },
    { v: 'one-big', w: 18 },
  ]).v
  if (layout === 'ring') {
    const n = int(rng, 5, 12)
    const R = H * 0.3
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 2 * Math.PI - Math.PI / 2
      parts.push(star(cx + R * Math.cos(a), cy + R * Math.sin(a), H * 0.075, c))
    }
  } else if (layout === 'arc') {
    // Size the stars to the arc's span so neighbours never collide: the chord
    // between adjacent stars has to clear two radii with a little air.
    const n = int(rng, 5, 9)
    const R = H * 0.34
    const sweep = 0.64 * Math.PI
    const chord = 2 * R * Math.sin(sweep / (2 * (n - 1)))
    const sr = Math.min(H * 0.07, chord * 0.42)
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (1.18 + (i / (n - 1)) * 0.64)
      parts.push(star(cx + R * Math.cos(a), cy + R * 0.9 * Math.sin(a) + H * 0.12, sr, c))
    }
  } else if (layout === 'constellation') {
    // Southern-Cross style: four to six stars of mixed size, off-centre and
    // never touching.
    const n = int(rng, 4, 6)
    const radii = [H * 0.09, H * 0.065, H * 0.06, H * 0.05, H * 0.045, H * 0.04]
    parts.push(
      ...scatterStars(rng, n, { x: cx - W * 0.25, y: cy - H * 0.33, w: W * 0.5, h: H * 0.66 }, radii, c)
    )
  } else if (layout === 'grid') {
    const cols = int(rng, 4, 6)
    const rows = int(rng, 3, 4)
    const gw = W * 0.5
    const gh = H * 0.5
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        const sx = cx - gw / 2 + (gw * (k + 0.5)) / cols
        const sy = cy - gh / 2 + (gh * (r + 0.5)) / rows
        parts.push(star(sx, sy, H * 0.045, c))
      }
    }
  } else {
    // One dominant star, sometimes ringed by small ones (Cape Verde/Somalia).
    parts.push(star(cx, cy, H * 0.28, c))
    if (chance(rng, 0.4)) {
      const n = int(rng, 6, 10)
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 2 * Math.PI - Math.PI / 2
        parts.push(star(cx + H * 0.42 * Math.cos(a), cy + H * 0.42 * Math.sin(a), H * 0.045, c))
      }
    }
  }
  return { family: 'starfield', parts, used: [...new Set(used)] }
}

// --- entry point -------------------------------------------------------------

const FAMILIES: Array<{ w: number; build: (rng: Rng) => Built }> = [
  { w: 24, build: buildHStripes },
  { w: 9, build: buildVStripes },
  { w: 11, build: buildHoistTriangle },
  { w: 7, build: buildNordicCross },
  { w: 8, build: buildCanton },
  { w: 8, build: buildFieldEmblem },
  { w: 6, build: buildDiagonal },
  { w: 4, build: buildSaltire },
  { w: 5, build: buildPall },
  { w: 4, build: buildQuartered },
  { w: 4, build: buildBordure },
  { w: 5, build: buildHoistBar },
  { w: 4, build: buildSerrated },
  { w: 4, build: buildRays },
  { w: 8, build: buildArms },
  { w: 6, build: buildChevron },
  { w: 5, build: buildEnsign },
  { w: 3, build: buildCornerFan },
  { w: 7, build: buildStarfield },
]

export const forgeFlag = (seed: string): ForgedFlag => {
  const rng = seededRng(seed)
  const { family, parts, used } = pickWeighted(rng, FAMILIES).build(rng)
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Generated flag for ${seed}">` +
    parts.join('') +
    `</svg>`
  return { seed, family, colors: used.map(c => c.name), svg }
}
