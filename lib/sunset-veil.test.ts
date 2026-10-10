import { describe, expect, it } from 'vitest'
import type { MapCode } from '~~/data/map.gen'
import { playableCountries } from '~~/lib/game-rules'
import { sunsetWindowAround } from './sunset-window'
import {
  settledMidPx,
  SEA_OPAQUE_VW,
  SUNSET_VEIL_FEATHER,
  SUNSET_VEIL_TILT_DEG,
  SUNSET_POOL_CLEAR,
  sweepBounds,
  twilightPool,
  veilCodes,
  veilKeyframes,
  veilMidPx,
  veilPlaneSize,
  veilTransforms,
} from './sunset-veil'
import type { MapViewBox } from './use-map-viewbox'

const pool = playableCountries({ variant: 'world', difficulty: 'hard', includeMicroNations: false })
const window = sunsetWindowAround(pool, 'hard', 'HR')!

/** A camera on the window at the screen's aspect, like the map keeps it. */
const cameraFor = (viewport: { width: number; height: number }): MapViewBox => {
  const [x, y, w, h] = window.frame
  const aspect = viewport.width / viewport.height
  const width = Math.max(w, h * aspect)
  const height = width / aspect
  return { x: x + w / 2 - width / 2, y: y + h / 2 - height / 2, w: width, h: height }
}

const LANDSCAPE = { width: 1440, height: 900 }
const PORTRAIT = { width: 390, height: 844 }
const rectFor = (viewport: { width: number; height: number }) => ({ x: 0, y: 0, ...viewport })

const tilt = (SUNSET_VEIL_TILT_DEG * Math.PI) / 180
/** CSS `translateX(a) rotate(b)` about an origin, applied to a point. */
const apply = (
  transform: { a: number; b: number },
  origin: [number, number],
  p: [number, number]
) => {
  const [ox, oy] = origin
  const x = p[0] - ox
  const y = p[1] - oy
  const rx = x * Math.cos(transform.b) - y * Math.sin(transform.b)
  const ry = x * Math.sin(transform.b) + y * Math.cos(transform.b)
  return [rx + transform.a + ox, ry + oy] as [number, number]
}

describe('sunset veil', () => {
  it('samples the sweep into keyframes the plane and its inverse share', () => {
    const midPxAt = (elapsed: number) => 1500 - elapsed * 30
    const { plane, inverse } = veilKeyframes(midPxAt, 40)
    expect(plane).toHaveLength(inverse.length)
    expect(plane[0]!.offset).toBe(0)
    expect(plane.at(-1)!.offset).toBe(1)
    plane.forEach((frame, index) => {
      expect(inverse[index]!.offset).toBe(frame.offset)
      const transforms = veilTransforms(midPxAt(frame.offset! * 40))
      expect(frame.transform).toBe(transforms.plane)
      expect(inverse[index]!.transform).toBe(transforms.inverse)
    })
  })

  it('pools the light around the dealt frame', () => {
    const vb = cameraFor(LANDSCAPE)
    const rect = rectFor(LANDSCAPE)
    const pool = twilightPool(vb, window.frame, rect)
    const [x, y, w, h] = window.frame
    const centre = {
      x: ((x + w / 2 - vb.x) / vb.w) * rect.width,
      y: ((y + h / 2 - vb.y) / vb.h) * rect.height,
    }
    expect(pool.cx).toBeCloseTo(centre.x)
    expect(pool.cy).toBeCloseTo(centre.y)
    // Every corner of the frame stands in full light
    const corner = Math.hypot(
      ((w / vb.w) * rect.width) / 2 / pool.rx,
      ((h / vb.h) * rect.height) / 2 / pool.ry
    )
    expect(corner).toBeLessThanOrEqual(SUNSET_POOL_CLEAR)
  })

  for (const [name, viewport] of [
    ['landscape', LANDSCAPE],
    ['portrait', PORTRAIT],
  ] as const) {
    const vb = cameraFor(viewport)
    const rect = rectFor(viewport)
    const { start, end } = sweepBounds(vb)

    it(`enters from off the east edge and leaves past the west edge (${name})`, () => {
      // The line's top end (the plane's leading corner) is still east of the
      // screen at the start; its bottom end is past the west edge at the end
      const tan = Math.tan(-tilt)
      const topAtStart = veilMidPx(vb, start, rect) + (viewport.height / 2) * tan
      const bottomAtEnd = veilMidPx(vb, end, rect) - (viewport.height / 2) * tan
      expect(topAtStart).toBeGreaterThan(viewport.width)
      expect(bottomAtEnd).toBeLessThan(0)
    })

    it(`covers every viewport corner in full night once settled (${name})`, () => {
      const { width, height } = veilPlaneSize(viewport)
      const origin: [number, number] = [0, viewport.height / 2]
      const corners: [number, number][] = [
        [0, 0],
        [viewport.width, 0],
        [0, viewport.height],
        [viewport.width, viewport.height],
      ]
      const settled = settledMidPx(viewport)
      for (const corner of corners) {
        const [lx, ly] = apply({ a: -settled, b: 0 }, origin, corner)
        const [localX, py] = apply({ a: 0, b: -tilt }, origin, [lx, ly])
        // Inside the plane's box…
        expect(localX).toBeGreaterThan(0)
        expect(localX).toBeLessThanOrEqual(width)
        expect(Math.abs(py - viewport.height / 2)).toBeLessThanOrEqual(height / 2)
        // …and past BOTH the land mask's feather and the sea gradient's
        // opaque stop, or the west edge keeps a lit strip through the reveal
        expect(localX).toBeGreaterThanOrEqual(SUNSET_VEIL_FEATHER * viewport.width)
        expect(localX).toBeGreaterThanOrEqual(SEA_OPAQUE_VW * viewport.width)
      }
    })

    it(`holds the whole viewport inside the plane mid-sweep (${name})`, () => {
      const { width, height } = veilPlaneSize(viewport)
      const origin: [number, number] = [0, viewport.height / 2]
      for (const midPx of [veilMidPx(vb, start, rect), veilMidPx(vb, (start + end) / 2, rect), 0]) {
        for (const corner of [
          [0, 0],
          [viewport.width, 0],
          [0, viewport.height],
          [viewport.width, viewport.height],
        ] as [number, number][]) {
          const [lx, ly] = apply({ a: -midPx, b: 0 }, origin, corner)
          const [localX, py] = apply({ a: 0, b: -tilt }, origin, [lx, ly])
          if (localX <= 0) continue
          expect(localX).toBeLessThanOrEqual(width)
          expect(Math.abs(py - viewport.height / 2)).toBeLessThanOrEqual(height / 2)
        }
      }
    })
  }

  it('composes the plane and its inverse to the identity', () => {
    const origin: [number, number] = [0, 450]
    for (const midPx of [-300, 0, 640, 1900]) {
      const { plane, inverse } = veilTransforms(midPx)
      expect(plane).toContain(`translateX(${midPx}px)`)
      expect(inverse).toContain(`translateX(${-midPx}px)`)
      for (const point of [
        [0, 0],
        [700, 120],
        [1440, 900],
      ] as [number, number][]) {
        // plane = translate then rotate (CSS applies right-to-left: rotate first)
        const rotated = apply({ a: 0, b: tilt }, origin, point)
        const moved = apply({ a: midPx, b: 0 }, origin, rotated)
        const back = apply({ a: -midPx, b: 0 }, origin, moved)
        const [x, y] = apply({ a: 0, b: -tilt }, origin, back)
        expect(x).toBeCloseTo(point[0], 6)
        expect(y).toBeCloseTo(point[1], 6)
      }
    }
  })

  it('takes every shape the camera can see and none it cannot', () => {
    const codes = veilCodes(cameraFor(LANDSCAPE))
    for (const code of ['HR', 'SI', 'BA', 'IT', 'AT'] as MapCode[]) expect(codes).toContain(code)
    // Russia is on screen through Kaliningrad — per ring, not the whole-country bbox
    expect(codes).toContain('RU')
    for (const code of ['US', 'FJ', 'NZ', 'BR', 'CN'] as MapCode[])
      expect(codes).not.toContain(code)
  })
})
