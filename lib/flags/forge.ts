/**
 * Deterministic "national-style" flag generator, seeded by a string (a short
 * commit hash on /health). Composition families, their weights, the palette
 * and its frequencies are all derived from a pixel-level study of the 197
 * real flags in flag-icons: horizontal stripes dominate (~90 flags incl.
 * emblem/canton variants), then hoist triangles, crosses, vertical tribands,
 * cantons, solid-field emblems, diagonals — plus rarer archetypes (pall,
 * quartered, bordure, hoist bar, serrated hoist, sunburst rays). Red appears
 * in ~75% of real flags, white in ~66%, gold ~42%; flags carry 2–4
 * significant colors, and low-contrast pairs are separated by white/gold
 * fimbriation. Compositions that quantize to an actual country's flag are
 * re-picked (REAL_* guards) so no deploy accidentally flies the Netherlands.
 */

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

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

/** Euclidean RGB distance — the vexillological "rule of tincture" stand-in. */
const dist = (a: FlagColor, b: FlagColor) => {
  const [r1, g1, b1] = rgb(a.hex)
  const [r2, g2, b2] = rgb(b.hex)
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2)
}

const contrasts = (a: FlagColor, b: FlagColor, min = 140) => dist(a, b) >= min

/**
 * A weighted color distinct from `taken` and contrasting with every neighbor
 * in `against`. Falls back to the best available if the constraints are
 * unsatisfiable (never happens with <= 4 picks in practice).
 */
const pickColor = (rng: Rng, taken: FlagColor[], against: FlagColor[] = [], min = 140): FlagColor => {
  const ok = PALETTE.filter((c) => !taken.includes(c) && against.every((a) => contrasts(c, a, min)))
  if (ok.length) return pickWeighted(rng, ok)
  const rest = PALETTE.filter((c) => !taken.includes(c))
  return rest.length ? pickWeighted(rng, rest) : pickWeighted(rng, PALETTE)
}

/** White or gold, whichever contrasts better with the given neighbors. */
const fimbriation = (against: FlagColor[]): FlagColor => {
  const score = (c: FlagColor) => Math.min(...against.map((a) => dist(c, a)))
  return score(WHITE) >= score(GOLD) ? WHITE : GOLD
}

// --- anti-plagiarism guards ---------------------------------------------------
// Quantized color sequences of REAL flags (from the flag-icons pixel study).
// A generated composition matching one of these is a real flag in disguise —
// builders re-pick until the combination is fictional.

const REAL_STRIPES = new Set([
  'red>white>red', 'red>gold>green', 'orange>white>green', 'red>white>black',
  'red>white>blue', 'lightblue>white>lightblue', 'gold>navy>red', 'blue>white>blue',
  'green>gold>red', 'red>white', 'red>blue>orange', 'lightblue>red>green',
  'black>gold>red', 'lightblue>black>lightblue', 'white>green>red', 'navy>gold>red',
  'navy>white>red>white>navy', 'lightblue>black>white', 'navy>white>red',
  'green>gold>blue', 'red>white>navy>white>green', 'black>red>gold', 'navy>red',
  'red>white>green', 'green>white>orange', 'white>blue>white>blue>white',
  'green>white>red', 'red>navy>red', 'maroon>white>maroon', 'navy>white>green',
  'red>black>green', 'gold>green>red', 'red>green>red', 'red>navy>gold>green',
  'green>white>green', 'white>red', 'blue>gold', 'lightblue>gold', 'white>blue>red',
  'white>lightblue', 'green>white>blue', 'green>white>red>white>green',
  'red>white>darkgreen', 'red>white>navy>white>red', 'black>gold>red>black>gold>red',
  'red>gold>red', // Spain's bands (the study filed ES under emblem flags)
])

const REAL_NORDIC = new Set([
  'red>white', 'blue>gold', 'white>blue', 'white>lightblue',
  'red>white>navy', 'navy>white>red', 'lightblue>white>red',
])

// field|charge|kind: JP BD TR/TN VN MA SO MR EU
const REAL_EMBLEMS = new Set([
  'white|red|disc', 'green|red|disc', 'red|white|crescent-star', 'red|gold|star',
  'red|green|star', 'lightblue|white|star', 'green|gold|crescent-star',
  'red|white|star', 'navy|gold|stars-ring', 'blue|gold|stars-ring',
])

// saltire>top/bottom>hoist/fly: JM, Scotland, AL(abama)
const REAL_SALTIRES = new Set(['gold>green>black', 'white>navy>navy', 'white>blue>blue', 'red>white>white'])

const seq = (colors: FlagColor[]) => colors.map((c) => c.name).join('>')
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
  | 'bird'

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
  { kind: 'bird', w: 5 },
]

/** Figurative silhouettes drawn in a local 0–100 box, scaled to radius r. */
const SILHOUETTES: Record<'trident' | 'bird', string> = {
  // Barbados-style trident head: centre spearhead, two curved side prongs,
  // broken shaft
  trident:
    'M50 4 L60 24 L54 20 L54 42 L64 42 C68 34 68 26 64 20 L74 14 ' +
    'C82 28 80 46 70 54 L54 54 L54 96 L46 96 L46 54 L30 54 ' +
    'C20 46 18 28 26 14 L36 20 C32 26 32 34 36 42 L46 42 L46 20 L40 24 Z',
  // frigatebird in flight: swept wings, forked tail
  bird:
    'M50 38 C55 28 64 23 74 24 C68 29 64 34 63 40 C74 37 87 40 94 48 ' +
    'C84 47 75 49 68 54 C60 60 52 60 47 56 C42 64 34 71 24 74 ' +
    'C30 67 33 60 34 53 C24 56 13 53 6 46 C14 43 24 42 32 44 C37 39 43 37 50 38 Z',
}

/** Draw a charge centered at (cx, cy) with outer radius r on background `bg`. */
const drawCharge = (rng: Rng, kind: ChargeKind, cx: number, cy: number, r: number, c: FlagColor, bg: FlagColor): string => {
  // multi-star charges turn into illegible dots at small radii, and the
  // figurative silhouettes turn to mud
  if (r < 95 && (kind === 'stars-ring' || kind === 'stars-arc')) kind = 'star'
  if (r < 70 && (kind === 'trident' || kind === 'bird')) kind = 'star'
  switch (kind) {
    case 'star':
      return star(cx, cy, r, c)
    case 'stars-ring': {
      const n = int(rng, 5, 9)
      const parts: string[] = []
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 2 * Math.PI - Math.PI / 2
        parts.push(star(cx + r * 0.72 * Math.cos(a), cy + r * 0.72 * Math.sin(a), r * 0.24, c))
      }
      return parts.join('')
    }
    case 'stars-arc': {
      const n = int(rng, 3, 6)
      const parts: string[] = []
      for (let i = 0; i < n; i++) {
        const a = Math.PI * (1.15 + (i / (n - 1)) * 0.7) // arc over the top
        parts.push(star(cx + r * 0.85 * Math.cos(a), cy + r * 0.85 * Math.sin(a), r * 0.2, c))
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
            c,
          ),
        )
      }
      return parts.join('')
    }
    case 'trident':
    case 'bird': {
      const s = +((2 * r) / 100).toFixed(3)
      return `<path d="${SILHOUETTES[kind]}" fill="${c.hex}" transform="translate(${n1(cx - r)} ${n1(cy - r)}) scale(${s})"/>`
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
    parts.push(drawCharge(rng, pick(rng, ['star', 'crescent-star'] as const), W * 0.18, bounds[0][1] / 2 + bounds[0][0], bounds[0][1] * 0.34, c, bg))
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
    parts.push(drawCharge(rng, pickWeighted(rng, CHARGE_KINDS).kind, bx + bw / 2, H / 2, Math.min(bw * 0.36, H * 0.22), c, bg))
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
  if (!edgeColors.every((c) => contrasts(tri, c, 140))) {
    const f = fimbriation([tri, ...edgeColors])
    parts.push(poly([[0, 0], [tw + 24, H / 2], [0, H]], f))
  }
  parts.push(poly([[0, 0], [tw, H / 2], [0, H]], tri))
  const used = [...base.used, tri]
  if (chance(rng, 0.45)) {
    const c = pickColor(rng, [], [tri], 180)
    parts.push(drawCharge(rng, pick(rng, ['star', 'star', 'stars-arc', 'crescent-star'] as const), tw * 0.38, H / 2, H * 0.13, c, tri))
    used.push(c)
  }
  return { family: 'hoist-triangle', parts, used: [...new Set(used)] }
}

const buildNordicCross = (rng: Rng): Built => {
  const field = pickColor(rng, [])
  let cross = pickColor(rng, [field], [field])
  const withInner = chance(rng, 0.45)
  let inner = withInner ? pickColor(rng, [field, cross], [cross]) : null
  for (let guard = 0; REAL_NORDIC.has(seq([field, cross, ...(inner ? [inner] : [])])) && guard < 4; guard++) {
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
    ? [poly([[0, 0], [W, 0], [0, H]], a), poly([[W, 0], [W, H], [0, H]], b)]
    : [poly([[0, 0], [W, 0], [W, H]], a), poly([[0, 0], [W, H], [0, H]], b)]
  // fimbriated central band, Tanzania/DRC style — a vertical ±dy offset of the
  // diagonal line; overflow past the corners is clipped by the viewBox
  const dy = H * 0.13
  const diagBand = (d: number, c: FlagColor) =>
    rising
      ? poly([[0, H - d], [W, -d], [W, d], [0, H + d]], c)
      : poly([[0, -d], [W, H - d], [W, H + d], [0, d]], c)
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
    poly([[0, 0], [W, 0], [W / 2, H / 2]], tb),
    poly([[0, H], [W, H], [W / 2, H / 2]], tb),
    poly([[0, 0], [0, H], [W / 2, H / 2]], lr),
    poly([[W, 0], [W, H], [W / 2, H / 2]], lr),
  ]
  const t = H * 0.11
  const dx = t * 0.9
  const bar = (x1: number, y1: number, x2: number, y2: number, tt: number, c: FlagColor) =>
    poly([[x1 - tt, y1], [x1 + tt, y1], [x2 + tt, y2], [x2 - tt, y2]], c)
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
  const [ex, ey] = [(x / L) * t * 2, ((H / 2) / L) * t * 2]
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
  parts.push(poly([[0, k * t], [x - k * t * 1.1, H / 2], [0, H - k * t]], tri))
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
    parts.push(drawCharge(rng, pickWeighted(rng, CHARGE_KINDS).kind, W / 2, H / 2, H * 0.22, c, field))
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
    parts.push(drawCharge(rng, pick(rng, ['star', 'crescent-star'] as const), bw / 2, H / 2, bw * 0.32, c, bar))
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
  const pts: Array<[number, number]> = [[0, 0], [xs, 0]]
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
        ray,
      ),
    )
  }
  // sun disc set off from the rays by a thin ring of field, Macedonia style
  parts.push(circle(cx, cy, H * 0.19, field), circle(cx, cy, H * 0.155, ray))
  return { family: 'rays', parts, used: [field, ray] }
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
]

export const forgeFlag = (seed: string): ForgedFlag => {
  const rng = seededRng(seed)
  const { family, parts, used } = pickWeighted(rng, FAMILIES).build(rng)
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Generated flag for ${seed}">` +
    parts.join('') +
    `</svg>`
  return { seed, family, colors: used.map((c) => c.name), svg }
}
