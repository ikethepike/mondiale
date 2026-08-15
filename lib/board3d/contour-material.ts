import { Color, type DataTexture, ShaderMaterial, Vector2 } from 'three'
import type { BoardBiome } from './biomes'
import { EDGE_FADE_END, EDGE_FADE_START, MAX_ELEVATION } from './terrain'

export interface ContourMaterial extends ShaderMaterial {
  uniforms: ShaderMaterial['uniforms'] & {
    uRippleCenter: { value: Vector2 }
    uRippleProgress: { value: number }
    uRippleColor: { value: Color }
  }
}

export interface ContourMaterialOptions {
  rippleRadius: number
  biome: BoardBiome
  /** High-res height field for fragment-space contours — the field the ink
   *  traces is finer than the mesh, so lines never crumble along triangle
   *  edges (proven in /test-terrain). */
  heightMap: DataTexture
  /** Half-extent of the square the height map covers, world units. */
  heightHalf: number
  /** Contour lines fade into the snow wash above this world elevation; only
   *  a finale massif crosses a real snowline. */
  snowlineY?: number
}

/**
 * The landscape material, grown from the plain iso-line shader through the
 * /test-terrain lab: elevation + slope ramps and quantized hillshade model
 * the land with zero lights; curvature inks ridgelines; moisture greens the
 * water margins; hypsometric banding and hachures print the atlas layer;
 * aerial perspective and valley mist give the far field air — all under the
 * fwidth-antialiased contour ink, per-biome palettes throughout.
 *
 * Success feedback is unchanged: `uRippleCenter` + `uRippleProgress` drive
 * the expanding annulus that tints lines around a landing tile.
 */
export const createContourMaterial = (options: ContourMaterialOptions): ContourMaterial => {
  const { rippleRadius, biome, heightMap, heightHalf, snowlineY = 1e6 } = options
  const material = new ShaderMaterial({
    uniforms: {
      uValley: { value: new Color(biome.valley) },
      uMid: { value: new Color(biome.mid) },
      uCrest: { value: new Color(biome.crest) },
      uRock: { value: new Color(biome.rock) },
      uLush: { value: new Color(biome.lush) },
      uLit: { value: new Color(biome.lit) },
      uShade: { value: new Color(biome.shade) },
      uMinor: { value: new Color(biome.minor) },
      uMajor: { value: new Color(biome.major) },
      uSnow: { value: new Color(biome.snow) },
      uAtmosphere: { value: new Color(biome.atmosphere) },
      // The page the canvas clears to — the far fade must land EXACTLY here
      // or the plane's edge draws itself (the horizon-seam bug).
      uPage: { value: new Color('#fffaf5') },
      uBanding: { value: biome.banding },
      uHachure: { value: biome.hachure },
      uStep: { value: MAX_ELEVATION / 8 },
      uMajorEvery: { value: 5 },
      uLineWidth: { value: 0.9 },
      uMaxElevation: { value: MAX_ELEVATION },
      uSnowline: { value: snowlineY },
      uSnowBand: { value: 1.6 },
      uHeightMap: { value: heightMap },
      uHeightHalf: { value: heightHalf },
      uTime: { value: 0 },
      uRippleCenter: { value: new Vector2() },
      uRippleProgress: { value: -1 },
      uRippleRadius: { value: rippleRadius },
      // Mint for landings, swapped to coral when a pawn slams into a challenge
      uRippleColor: { value: new Color(biome.foam) },
      // Matches withEdgeFalloff's band, so lines, hills and tint melt together
      uAtmoStart: { value: EDGE_FADE_START * 0.6 },
      uFadeStart: { value: EDGE_FADE_START },
      uFadeEnd: { value: EDGE_FADE_END },
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
      uniform float uBanding; uniform float uHachure;
      uniform float uStep; uniform float uMajorEvery; uniform float uLineWidth;
      uniform float uMaxElevation; uniform float uSnowline; uniform float uSnowBand;
      uniform sampler2D uHeightMap; uniform float uHeightHalf; uniform float uTime;
      uniform vec2 uRippleCenter; uniform float uRippleProgress;
      uniform float uRippleRadius; uniform vec3 uRippleColor;
      uniform float uAtmoStart; uniform float uFadeStart; uniform float uFadeEnd;

      varying float vElevation; varying float vSlope; varying vec2 vXZ;
      varying vec2 vGradient; varying float vCurve; varying float vMoisture;

      float lineMask(float value, float stepSize, float width) {
        float derivative = max(fwidth(value), 1e-5);
        float dist = abs(fract(value / stepSize - 0.5) - 0.5) * stepSize / derivative;
        float mask = 1.0 - smoothstep(width, width + 1.8, dist);
        // Fade lines as their period approaches pixel scale — the far-field
        // grey-wash and steep-flank moiré guard in one term.
        float density = derivative / stepSize;
        return mask * (1.0 - smoothstep(0.18, 0.5, density));
      }

      void main() {
        // Painterly modelling with zero lights: elevation ramp, then the
        // wet margin, then rock on steep ground.
        float h = clamp(vElevation / uMaxElevation, 0.0, 2.4);
        vec3 color = mix(uValley, uMid, smoothstep(0.25, 0.85, h));
        color = mix(color, uCrest, smoothstep(0.85, 1.7, h));
        color = mix(color, uLush, vMoisture * (1.0 - smoothstep(0.25, 0.8, vSlope)) * 0.55);
        color = mix(color, uShade, smoothstep(0.86, 0.98, vMoisture) * 0.22);
        color = mix(color, uRock, smoothstep(0.55, 1.35, vSlope) * 0.65);

        // Quantized hillshade from the analytic normal — cartographic relief
        // with a fixed NW sun.
        vec3 normal = normalize(vec3(-vGradient.x, 1.0, -vGradient.y));
        float lambert = dot(normal, normalize(vec3(-0.45, 0.85, -0.4)));
        color = mix(color, uLit, smoothstep(0.86, 0.98, lambert) * 0.35);
        color = mix(color, uShade, (1.0 - smoothstep(0.55, 0.78, lambert)) * 0.5);

        // Curvature accents: ink the ridgelines, deepen the hollows.
        color = mix(color, uMajor, smoothstep(0.06, 0.3, -vCurve) * 0.12);
        color = mix(color, uShade, smoothstep(0.06, 0.3, vCurve) * 0.25);

        // Contours trace the HIGH-RES height texture, not the vertex lattice.
        float hField = texture2D(uHeightMap, (vXZ + uHeightHalf) / (2.0 * uHeightHalf)).r;

        // Hypsometric banding: the printed-atlas layer.
        float hQuant = (floor(hField / uStep) + 0.5) * uStep / uMaxElevation;
        color = mix(color, mix(uValley, uCrest, clamp(hQuant * 0.7, 0.0, 1.0)), uBanding);

        float flatness = smoothstep(0.02, 0.06, vSlope);
        float edgeFade = 1.0 - smoothstep(uFadeStart, uFadeEnd, length(vXZ));
        float snow = smoothstep(uSnowline, uSnowline + uSnowBand, vElevation);
        float strength = flatness * edgeFade * (1.0 - snow);

        // Hachures: downslope strokes curving with the gradient on mid-slopes.
        vec2 downslope = normalize(vGradient + vec2(1e-4));
        float across = dot(vXZ, vec2(-downslope.y, downslope.x)) * 0.85;
        float acrossWidth = fwidth(across);
        float stroke = 1.0 - smoothstep(0.3, 0.3 + acrossWidth * 2.2, abs(fract(across) - 0.5) * 2.0);
        stroke *= 1.0 - smoothstep(0.45, 1.1, acrossWidth);
        float hachureBand = smoothstep(0.24, 0.42, vSlope) * (1.0 - smoothstep(0.85, 1.25, vSlope));
        color = mix(color, uMajor, stroke * hachureBand * uHachure * edgeFade * (1.0 - snow));

        float minor = lineMask(hField, uStep, uLineWidth) * strength;
        float major = lineMask(hField, uStep * uMajorEvery, uLineWidth * 1.6) * strength;
        color = mix(color, uMinor, minor * 0.9);
        color = mix(color, uMajor, major);
        color = mix(color, uSnow, snow * 0.9);

        // Drifting cloud shadows: three slow sine fields, faint on purpose —
        // the board stays a game surface first. uTime holds at zero while the
        // stage is hidden or under reduced motion, freezing the sky.
        float cloud =
          sin(vXZ.x * 0.045 + uTime * 0.05) +
          sin(vXZ.y * 0.038 - uTime * 0.04) +
          sin((vXZ.x + vXZ.y) * 0.027 + uTime * 0.03);
        color = mix(color, uShade, smoothstep(1.4, 2.6, cloud) * 0.08);

        if (uRippleProgress >= 0.0) {
          float radius = uRippleProgress * uRippleRadius;
          float width = uRippleRadius * 0.22;
          float distanceToCenter = distance(vXZ, uRippleCenter);
          float annulus = smoothstep(radius - width, radius, distanceToCenter)
            * (1.0 - smoothstep(radius, radius + width, distanceToCenter));
          float fade = 1.0 - smoothstep(0.4, 1.0, uRippleProgress);

          color = mix(color, uRippleColor, annulus * fade * max(minor, major));
          color = mix(color, uRippleColor, annulus * fade * 0.3);
        }

        // Aerial perspective, then valley mist (LOW far ground drowns first),
        // then the page fade — which must land exactly on the clear color.
        float aerial = smoothstep(uAtmoStart, uFadeStart, length(vXZ));
        color = mix(color, uAtmosphere, aerial * 0.55);
        float mist = smoothstep(uAtmoStart * 0.7, uFadeStart, length(vXZ)) *
          (1.0 - smoothstep(uMaxElevation * 0.35, uMaxElevation * 0.95, vElevation));
        color = mix(color, uAtmosphere, mist * 0.45);
        color = mix(color, uPage, smoothstep(uFadeStart, uFadeEnd, length(vXZ)));

        gl_FragColor = vec4(color, 1.0);
        // Colorspace conversion ONLY — no tonemapping chunk: the renderer
        // never tone-maps the clear color, so converted-but-unmapped output
        // is what makes the far field EXACTLY the page the canvas clears to.
        #include <colorspace_fragment>
      }
    `,
  })

  return material as ContourMaterial
}
