<template>
  <canvas ref="canvas" class="audio-field-gl" aria-hidden="true" />
</template>
<script lang="ts" setup>
import {
  Color,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
} from 'three'
import { audioFieldPalette, MAX_FIELD_COLORS, NEUTRAL_FIELD } from '~~/lib/audio-palette'
import { hexToRgb } from '~~/lib/palette'
import { MOTION, prefersReducedMotion } from '~~/lib/motion'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * The ambient backdrop for the audio rounds: soft blobs drifting on a slow
 * loop, their colours travelling from the game's own hues into the answer's as
 * the clock runs. The palette IS the hint — you half-notice Sweden's blue and
 * gold before you can name why.
 *
 * One draw call per frame: a full-screen quad and a fragment shader, with the
 * blobs computed per-pixel. No per-frame CPU geometry, and nothing allocated
 * inside `tick` — a GC pause mid-round would be felt as a stutter while a
 * player races a buzz clock.
 */
const props = withDefaults(
  defineProps<{
    /** The answer's countries. Tongues passes every speaker, so the
     *  field blends rather than fingering one nation. */
    isoCodes?: ISOCountryCode[]
    /** 0..1 along the round, from `useBuzzRound`'s `elapsedFraction`. Drives
     *  how far the colours have travelled. */
    progress?: number
    /** Once the answer is out the field stops drifting and holds — that
     *  stillness is the anthem round's reveal. */
    settled?: boolean
  }>(),
  { isoCodes: () => [], progress: 0, settled: false }
)

const canvas = ref<HTMLCanvasElement>()
let renderer: WebGLRenderer | undefined
let material: ShaderMaterial | undefined
let scene: Scene | undefined
let camera: OrthographicCamera | undefined
let geometry: PlaneGeometry | undefined
let frame = 0
let resizeObserver: ResizeObserver | undefined

/**
 * The drawing buffer's long edge, in pixels — FIXED, never derived from the
 * viewport or the device pixel ratio. The field has no hard edges anywhere,
 * so the compositor's bilinear upscale to full screen reads as the softness
 * the design wants; more pixels buy nothing but fill-rate heat, and a blob
 * field is fill-rate-bound. This also means a 5K desktop window costs the
 * same as a phone. NO CSS blur on top: a filter over a canvas that redraws
 * cannot be cached, so the browser would re-blur the whole viewport layer
 * every frame — measured as the single biggest cost of the first cut.
 */
const BUFFER_LONG_EDGE = 320

/** The drift crosses the screen over ~90s, so frames above this rate are
 *  indistinguishable. Rendering at display rate (120Hz on ProMotion) was the
 *  other half of the first cut's cost. */
const FIELD_FPS = 30

/** Per-rendered-frame exponential smoothing for the blend (≈1s time constant
 *  at FIELD_FPS). The round clock steps once per second, so driving the
 *  uniform from it directly popped the colours forward in visible 3% jumps —
 *  the clock is a TARGET; the loop glides toward it. */
const BLEND_EASE = 0.04

/** How long the colours take to finish arriving, as a fraction of the round.
 *  Landing before the clock does means the last stretch is the strongest hint
 *  rather than a colour still visibly moving. */
const BLEND_COMPLETE_AT = 0.9

/**
 * Components are set numerically, NEVER from the hex string: three.Color's
 * string paths convert sRGB into the linear working space, so `#3072a6` would
 * reach the shader as (0.03, 0.17, 0.38) instead of (0.19, 0.45, 0.65). This
 * shader writes straight to an sRGB framebuffer with no tone mapping, so those
 * linear values render as mud — progressively darker as the blend moves off
 * the near-white neutral. The palette's legibility band is defined in sRGB;
 * the uniforms must arrive in the same space. Numeric components pass through
 * untouched.
 */
const toColorArray = (hexes: readonly string[]): Color[] =>
  Array.from({ length: MAX_FIELD_COLORS }, (_, index) => {
    const [r, g, b] = hexToRgb(hexes[index % hexes.length]) as [number, number, number]
    return new Color(r / 255, g / 255, b / 255)
  })

/** Uniform arrays are fixed-length, so both ends are padded to the same size
 *  by repeating — a 2-colour flag simply repeats its blue and gold. */
const neutralColors = toColorArray(NEUTRAL_FIELD)

const targetColors = computed(() => toColorArray(audioFieldPalette(props.isoCodes)))

onMounted(() => {
  const element = canvas.value
  if (!element) return

  let renderContext: WebGLRenderer
  try {
    // Opaque canvas: the field covers its wrapper edge to edge, so alpha
    // compositing against the page is pure cost. `low-power` asks a dual-GPU
    // machine not to spin up the discrete chip for an ambient backdrop.
    renderContext = new WebGLRenderer({
      canvas: element,
      alpha: false,
      antialias: false,
      powerPreference: 'low-power',
    })
  } catch {
    // No WebGL: the scene's CSS background stands on its own, and the round
    // still plays. The colour hint is a bonus, never load-bearing.
    return
  }
  renderer = renderContext
  // Pixel ratio stays 1: the buffer is sized by BUFFER_LONG_EDGE alone.

  material = new ShaderMaterial({
    // The field is a solid backdrop, not a glaze: it writes every pixel it
    // covers, and the scene's own fade handles standing down for the map.
    transparent: false,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uBlend: { value: 0 },
      uAspect: { value: 1 },
      uFrom: { value: neutralColors },
      uTo: { value: targetColors.value },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision mediump float;
      varying vec2 vUv;
      uniform float uTime;
      uniform float uBlend;
      uniform float uAspect;
      uniform vec3 uFrom[${MAX_FIELD_COLORS}];
      uniform vec3 uTo[${MAX_FIELD_COLORS}];

      // How far a blob's colour carries, in UV units. This is the distinctness
      // knob: at 0.42 every blob reached every pixel and the normalised mix
      // averaged Sweden's blue and gold into one green wash. Smaller sigma
      // keeps each core ITS colour and steepens (but never hardens) the
      // feathered crossover where two blobs meet — the merge stays a soft
      // bleed, the middles stay pure.
      const float RADIUS = 0.21;

      // Each blob is a soft radial source drifting on its own slow ellipse.
      // Weighting by inverse distance and normalising gives a metaball-ish
      // mix with no hard boundary anywhere — the colours bleed into each
      // other the way ink does in water.
      vec2 orbit(float index, float time) {
        float phase = index * 1.7;
        return vec2(
          0.5 + 0.30 * sin(time * 0.42 + phase) + 0.10 * sin(time * 0.23 + phase * 2.1),
          0.5 + 0.26 * cos(time * 0.37 + phase * 1.3) + 0.09 * cos(time * 0.19 + phase)
        );
      }

      void main() {
        // Correct for aspect so blobs stay round on a wide screen.
        vec2 uv = vec2(vUv.x * uAspect, vUv.y);

        vec3 sum = vec3(0.0);
        float total = 0.0;
        for (int i = 0; i < ${MAX_FIELD_COLORS}; i++) {
          vec2 center = orbit(float(i), uTime);
          center.x *= uAspect;
          float distance = length(uv - center);
          // Gaussian falloff, not inverse-distance: a 1/d² tail never really
          // reaches zero, so every blob tinted every pixel and the palette
          // averaged into one grey wash. This keeps each colour local enough
          // to stay itself where it sits.
          float weight = exp(-distance * distance / (2.0 * RADIUS * RADIUS));
          sum += mix(uFrom[i], uTo[i], uBlend) * weight;
          total += weight;
        }

        // Normalise by the total weight and nothing else. Anything that scales
        // the result by absolute coverage darkens the whole field wherever the
        // blobs happen to be thin — the palette's lightness band is chosen for
        // legibility, so the shader must not undo it.
        gl_FragColor = vec4(sum / max(total, 0.0001), 1.0);
      }
    `,
  })

  // A single clip-space quad: the vertex shader writes gl_Position directly,
  // so the geometry never needs resizing and the camera is a formality.
  geometry = new PlaneGeometry(2, 2)
  const mesh = new Mesh(geometry, material)
  // Both are required, and for the same reason: the quad is already in clip
  // space, so its world-space bounds are meaningless. Left on, three.js tests
  // those bounds against the frustum and culls the mesh — a blank canvas that
  // looks exactly like a shader bug.
  mesh.frustumCulled = false
  scene = new Scene()
  scene.add(mesh)
  camera = new OrthographicCamera(-1, 1, 1, -1, -1, 1)

  const resize = () => {
    const { clientWidth, clientHeight } = element
    if (!clientWidth || !clientHeight || !renderer || !material) return
    // Fixed budget, viewport-shaped: the buffer keeps the screen's aspect so
    // blobs stay round, but its size never grows past the token. CSS stretches
    // the canvas to fill; on resize only the aspect uniform and this tiny
    // buffer change.
    const scale = BUFFER_LONG_EDGE / Math.max(clientWidth, clientHeight)
    renderer.setSize(
      Math.max(1, Math.round(clientWidth * scale)),
      Math.max(1, Math.round(clientHeight * scale)),
      false
    )
    material.uniforms.uAspect.value = clientWidth / clientHeight
    // The buffer starts opaque black; painting inside the same task as any
    // size change means no black flash is ever composited.
    renderFrame()
  }
  resize()
  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(element)

  // The loop always runs — under reduced motion the tick freezes the drift
  // and skips the GPU entirely once the colour has arrived, so the quiet case
  // costs a comparison per frame, not a render.
  frame = requestAnimationFrame(tick)
})

/** Kept out of `tick` so the loop allocates nothing per frame. */
const renderFrame = () => {
  if (renderer && scene && camera) renderer.render(scene, camera)
}

let lastFrameAt = 0

const tick = (now: number) => {
  if (!material) return

  // Hold still once the answer is out — no perpetual rAF behind a static
  // reveal, the same rule the contour backdrop follows.
  if (!props.settled) frame = requestAnimationFrame(tick)

  // rAF fires at display rate — 120Hz on ProMotion — but the drift can't show
  // a difference above FIELD_FPS, so the frames between are skipped without
  // touching the GPU at all.
  if (now - lastFrameAt < 1000 / FIELD_FPS) return
  lastFrameAt = now

  const blend = material.uniforms.uBlend
  blend.value += (blendTarget - (blend.value as number)) * BLEND_EASE

  if (prefersReducedMotion()) {
    // No drift — but the colour hint survives as a slow cross-fade, which is
    // a fade, not motion. Once the blend has arrived there is nothing new to
    // draw, so the GPU goes quiet between clock steps.
    if (Math.abs(blendTarget - (blend.value as number)) < 0.001) return
    renderFrame()
    return
  }

  // MOTION.ambient is the house token for drifting loops; dividing by it turns
  // milliseconds into that loop's own slow time base.
  material.uniforms.uTime.value = now / 1000 / MOTION.ambient
  renderFrame()
}

// The clock's step lands here as a target only — the loop eases the actual
// uniform toward it, so a 1Hz tick never pops the colours forward.
let blendTarget = 0
watch(
  () => props.progress,
  progress => {
    blendTarget = Math.min(1, progress / BLEND_COMPLETE_AT)
  }
)

watch(targetColors, colors => {
  if (material) material.uniforms.uTo.value = colors
})

// Coming to rest is a state change, so the last frame has to be drawn
// explicitly — by then the loop has already returned. The blend snaps to its
// target first: the reveal's stillness should hold the ARRIVED colours, not
// wherever the glide happened to be.
watch(
  () => props.settled,
  settled => {
    if (settled) {
      cancelAnimationFrame(frame)
      if (material) material.uniforms.uBlend.value = blendTarget
      renderFrame()
      return
    }
    frame = requestAnimationFrame(tick)
  }
)

onUnmounted(() => {
  cancelAnimationFrame(frame)
  resizeObserver?.disconnect()
  geometry?.dispose()
  material?.dispose()
  // Releases the WebGL context. Browsers cap how many may be live at once, so
  // a round-per-round leak would eventually blank the field mid-game.
  renderer?.dispose()
})
</script>
<style lang="scss" scoped>
.audio-field-gl {
  width: 100%;
  height: 100%;
  display: block;
  // NO filter here. The softness comes from the tiny buffer's bilinear
  // upscale — a CSS blur over a canvas that redraws can't be cached, so the
  // browser re-blurs the whole viewport layer every frame. That filter was
  // the single biggest cost of the first cut, measured, not guessed.
}
</style>
