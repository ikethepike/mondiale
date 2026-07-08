<template>
  <canvas ref="canvas" class="contour-gl" aria-hidden="true" />
</template>
<script lang="ts" setup>
import Alea from 'alea'
import { createNoise2D } from 'simplex-noise'
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  LineSegments,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
} from 'three'
import { prefersReducedMotion } from '~~/lib/motion'

/**
 * Procedural topographic backdrop. Contour lines are the iso-lines of an fBm
 * (fractal Brownian motion) noise field — exactly how a real topo map is
 * built — extracted with marching squares. No source SVG, no parsing: the
 * lines are generated, so they're infinitely smooth and never wrong.
 *
 * The reveal is a single GPU uniform (uProgress) driving a per-vertex order,
 * so the sweep costs one draw call per frame — no per-frame CPU work, unlike
 * animating ~40 huge SVG paths' stroke-dashoffset. Emits 'drawn' when done.
 */
const emit = defineEmits<{ drawn: [] }>()

const canvas = ref<HTMLCanvasElement>()
let renderer: WebGLRenderer | undefined
let frame = 0
let resizeObserver: ResizeObserver | undefined

const DRAW_SECONDS = 3.2
const SETTLED_OPACITY = 0.08
const DRAW_OPACITY = 0.2

// Field is generated in a fixed logical space, then cover-fit to the canvas
const FIELD_W = 200
const FIELD_H = 120

onMounted(() => {
  const element = canvas.value
  if (!element) return

  let renderContext: WebGLRenderer
  try {
    renderContext = new WebGLRenderer({ canvas: element, alpha: true, antialias: true })
  } catch {
    emit('drawn')
    return
  }
  renderer = renderContext
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

  // --- fBm height field --------------------------------------------------------
  // Stable seed → the same handsome terrain every load. Sampled on a grid.
  const noise2D = createNoise2D(Alea('mondiale-contours'))
  const fbm = (x: number, y: number) => {
    let sum = 0
    let amplitude = 1
    let frequency = 1
    let norm = 0
    for (let octave = 0; octave < 4; octave++) {
      sum += amplitude * noise2D(x * frequency, y * frequency)
      norm += amplitude
      amplitude *= 0.5
      frequency *= 2
    }
    return sum / norm
  }

  const COLS = 160
  const ROWS = 96
  const BASE_FREQ = 3.4
  const field: number[] = new Array((COLS + 1) * (ROWS + 1))
  for (let row = 0; row <= ROWS; row++) {
    for (let col = 0; col <= COLS; col++) {
      const x = (col / COLS) * BASE_FREQ
      const y = (row / ROWS) * BASE_FREQ
      field[row * (COLS + 1) + col] = fbm(x, y)
    }
  }

  // --- Marching squares: extract iso-lines at evenly spaced levels -------------
  // Each cell contributes short segments where the contour level crosses it.
  // A per-vertex "order" (0→1) is set from the segment's y so the reveal
  // sweeps bottom-up like a helicopter cresting a canyon.
  const positions: number[] = []
  const orders: number[] = []
  const LEVELS = 14

  const cellX = (col: number) => (col / COLS) * FIELD_W
  const cellY = (row: number) => (row / ROWS) * FIELD_H

  // Linear-interpolate where along an edge the iso-level falls
  const lerp = (a: number, b: number, level: number) => (level - a) / (b - a || 1e-6)

  for (let level = 1; level <= LEVELS; level++) {
    const iso = -0.72 + (level / (LEVELS + 1)) * 1.44
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const tl = field[row * (COLS + 1) + col]
        const tr = field[row * (COLS + 1) + col + 1]
        const bl = field[(row + 1) * (COLS + 1) + col]
        const br = field[(row + 1) * (COLS + 1) + col + 1]

        // Marching-squares case index
        let mask = 0
        if (tl > iso) mask |= 8
        if (tr > iso) mask |= 4
        if (br > iso) mask |= 2
        if (bl > iso) mask |= 1
        if (mask === 0 || mask === 15) continue

        const x0 = cellX(col)
        const x1 = cellX(col + 1)
        const y0 = cellY(row)
        const y1 = cellY(row + 1)

        // Edge crossing points (top, right, bottom, left)
        const top: [number, number] = [x0 + (x1 - x0) * lerp(tl, tr, iso), y0]
        const right: [number, number] = [x1, y0 + (y1 - y0) * lerp(tr, br, iso)]
        const bottom: [number, number] = [x0 + (x1 - x0) * lerp(bl, br, iso), y1]
        const left: [number, number] = [x0, y0 + (y1 - y0) * lerp(tl, bl, iso)]

        // Cases → which edge pair(s) the contour connects (saddles split)
        const connect: [[number, number], [number, number]][] = []
        switch (mask) {
          case 1: case 14: connect.push([left, bottom]); break
          case 2: case 13: connect.push([bottom, right]); break
          case 3: case 12: connect.push([left, right]); break
          case 4: case 11: connect.push([top, right]); break
          case 5: connect.push([left, top], [bottom, right]); break
          case 6: case 9: connect.push([top, bottom]); break
          case 7: case 8: connect.push([left, top]); break
          case 10: connect.push([top, right], [left, bottom]); break
        }

        for (const [a, b] of connect) {
          positions.push(a[0], a[1], 0, b[0], b[1], 0)
          // Reveal order: bottom of the field draws first (y near FIELD_H → 0)
          const along = 1 - (a[1] + b[1]) / (2 * FIELD_H)
          orders.push(along, along)
        }
      }
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('aOrder', new BufferAttribute(new Float32Array(orders), 1))

  const material = new ShaderMaterial({
    transparent: true,
    uniforms: {
      uProgress: { value: 0 },
      uOpacity: { value: DRAW_OPACITY },
      uColor: { value: new Color('#5b6b8a') },
    },
    vertexShader: /* glsl */ `
      attribute float aOrder;
      varying float vReveal;
      uniform float uProgress;
      void main() {
        // Visible once the sweep passes this vertex's order (soft leading edge)
        vReveal = smoothstep(aOrder, aOrder + 0.08, uProgress);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision mediump float;
      varying float vReveal;
      uniform vec3 uColor;
      uniform float uOpacity;
      void main() {
        if (vReveal <= 0.0) discard;
        gl_FragColor = vec4(uColor, uOpacity * vReveal);
      }
    `,
  })

  const lines = new LineSegments(geometry, material)
  const scene = new Scene()
  scene.add(lines)

  // Ortho camera in field space; top < bottom keeps the field upright
  const camera = new OrthographicCamera(0, FIELD_W, 0, FIELD_H, -1, 1)

  const resize = () => {
    const { clientWidth, clientHeight } = element
    if (!clientWidth || !clientHeight) return
    renderer!.setSize(clientWidth, clientHeight, false)

    // Cover-fit: expand the shorter axis so the field fills the canvas edge
    // to edge (a topo field tiles nicely, so cropping is invisible).
    const canvasAspect = clientWidth / clientHeight
    const fieldAspect = FIELD_W / FIELD_H
    let frameW = FIELD_W
    let frameH = FIELD_H
    if (canvasAspect > fieldAspect) frameH = FIELD_W / canvasAspect
    else frameW = FIELD_H * canvasAspect

    const cx = FIELD_W / 2
    const cy = FIELD_H / 2
    camera.left = cx - frameW / 2
    camera.right = cx + frameW / 2
    camera.top = cy - frameH / 2
    camera.bottom = cy + frameH / 2
    camera.updateProjectionMatrix()
  }
  resize()
  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(element)

  // --- Reveal: animate uProgress once, then dim and stop ----------------------
  if (prefersReducedMotion()) {
    material.uniforms.uProgress.value = 1
    material.uniforms.uOpacity.value = SETTLED_OPACITY
    renderer.render(scene, camera)
    emit('drawn')
    return
  }

  let start = 0
  let settled = false
  const tick = (now: number) => {
    if (!start) start = now
    const progress = Math.min(1, (now - start) / (DRAW_SECONDS * 1000))
    material.uniforms.uProgress.value = progress

    if (progress >= 1 && !settled) {
      settled = true
      emit('drawn')
    }
    if (settled) {
      const current = material.uniforms.uOpacity.value as number
      material.uniforms.uOpacity.value = current + (SETTLED_OPACITY - current) * 0.06
    }

    renderer!.render(scene, camera)

    // Stop the loop once the fade lands — no perpetual rAF for a static image
    if (settled && Math.abs((material.uniforms.uOpacity.value as number) - SETTLED_OPACITY) < 0.002) {
      material.uniforms.uOpacity.value = SETTLED_OPACITY
      renderer!.render(scene, camera)
      return
    }
    frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)
})

onUnmounted(() => {
  cancelAnimationFrame(frame)
  resizeObserver?.disconnect()
  renderer?.dispose()
})
</script>
<style scoped>
.contour-gl {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
