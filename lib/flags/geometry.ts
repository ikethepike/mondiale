/**
 * 2D affine geometry for flag recomposition. Matrices are the SVG 2×3 form
 * `[a b c d e f]` representing
 *   | a c e |
 *   | b d f |
 *   | 0 0 1 |
 * i.e. x' = a·x + c·y + e,  y' = b·x + d·y + f.
 */

export type Matrix = [number, number, number, number, number, number]

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]

/** Compose two affines: `multiply(m, n)` applies n first, then m. */
export const multiply = (m: Matrix, n: Matrix): Matrix => {
  const [a1, b1, c1, d1, e1, f1] = m
  const [a2, b2, c2, d2, e2, f2] = n
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ]
}

export const translate = (x: number, y: number): Matrix => [1, 0, 0, 1, x, y]
export const scale = (s: number): Matrix => [s, 0, 0, s, 0, 0]
export const scaleXY = (sx: number, sy: number): Matrix => [sx, 0, 0, sy, 0, 0]
export const rotate = (deg: number): Matrix => {
  const r = (deg * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  return [c, s, -s, c, 0, 0]
}

/** Apply a matrix to a point. */
export const applyPoint = (m: Matrix, x: number, y: number): [number, number] => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
]

/** Serialize a matrix as an SVG `matrix(...)` transform value. */
export const toMatrixString = (m: Matrix): string =>
  `matrix(${m.map(n => +n.toFixed(6)).join(' ')})`

/**
 * Parse an SVG transform attribute (`translate`, `scale`, `rotate`, `matrix`,
 * `skewX/Y`, in any order) into a single composed matrix. Unknown ops are
 * ignored. Returns IDENTITY for an empty/absent transform.
 */
export const parseTransform = (transform: string | undefined): Matrix => {
  if (!transform) return IDENTITY
  let m: Matrix = IDENTITY
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(transform))) {
    const op = match[1]
    const args = match[2]
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number)
    let t: Matrix = IDENTITY
    switch (op) {
      case 'matrix':
        if (args.length === 6) t = args as Matrix
        break
      case 'translate':
        t = translate(args[0] || 0, args[1] || 0)
        break
      case 'scale':
        t = scaleXY(args[0] ?? 1, args[1] ?? args[0] ?? 1)
        break
      case 'rotate':
        if (args.length === 3) {
          // rotate(θ, cx, cy) = translate(c)·rotate(θ)·translate(-c)
          t = multiply(
            multiply(translate(args[1], args[2]), rotate(args[0])),
            translate(-args[1], -args[2])
          )
        } else {
          t = rotate(args[0] || 0)
        }
        break
      case 'skewX':
        t = [1, 0, Math.tan((args[0] * Math.PI) / 180), 1, 0, 0]
        break
      case 'skewY':
        t = [1, Math.tan((args[0] * Math.PI) / 180), 0, 1, 0, 0]
        break
    }
    m = multiply(m, t)
  }
  return m
}

export interface Decomposed {
  translateX: number
  translateY: number
  rotationDeg: number
  /** Uniform scale magnitude (geometric mean of the axis scales). */
  scale: number
  scaleX: number
  scaleY: number
}

/**
 * Decompose an affine into translate · rotate · scale (+ shear discarded).
 * We keep rotation (semantic — Korea's taegeuk, Nepal's jag) and the per-axis
 * scales for inspection, but the recompose engine uses a single UNIFORM scale
 * (see `uniformScale`) so a source's non-uniform stretch (e.g. Serbia's
 * `matrix(1 0 0 1.00437 …)`) never survives into the emblem.
 */
export const decompose = (m: Matrix): Decomposed => {
  const [a, b, c, d, e, f] = m
  const scaleX = Math.hypot(a, b)
  const rotationDeg = (Math.atan2(b, a) * 180) / Math.PI
  // Remove rotation to recover the y-scale (determinant / scaleX).
  const det = a * d - b * c
  const scaleY = scaleX === 0 ? 0 : det / scaleX
  return {
    translateX: e,
    translateY: f,
    rotationDeg,
    scale: Math.sqrt(Math.abs(scaleX * scaleY)) || scaleX,
    scaleX,
    scaleY,
  }
}

export const uniformScale = (m: Matrix): number => decompose(m).scale

export interface BBox {
  x: number
  y: number
  width: number
  height: number
}

export const bboxCenter = (b: BBox): [number, number] => [b.x + b.width / 2, b.y + b.height / 2]

/** Union of two bounding boxes (either may be null). */
export const unionBBox = (a: BBox | null, b: BBox | null): BBox | null => {
  if (!a) return b
  if (!b) return a
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  }
}

/** Transform a bbox by a matrix and return the axis-aligned bounds of the result. */
export const transformBBox = (m: Matrix, b: BBox): BBox => {
  const corners: [number, number][] = [
    [b.x, b.y],
    [b.x + b.width, b.y],
    [b.x, b.y + b.height],
    [b.x + b.width, b.y + b.height],
  ].map(([x, y]) => applyPoint(m, x, y))
  const xs = corners.map(c => c[0])
  const ys = corners.map(c => c[1])
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}
