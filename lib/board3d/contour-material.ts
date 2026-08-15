import { Color, ShaderMaterial, Vector2 } from 'three'
import { BOARD_COLORS } from './colors'
import { EDGE_FADE_END, EDGE_FADE_START, MAX_ELEVATION } from './terrain'

export interface ContourMaterial extends ShaderMaterial {
  uniforms: ShaderMaterial['uniforms'] & {
    uRippleCenter: { value: Vector2 }
    uRippleProgress: { value: number }
    uRippleColor: { value: Color }
  }
}

/** Cool near-white for the finale massif's snowcap — deliberately not
 *  sourMilk: against the warm cream page, the cold cast is what reads. */
const SNOW_COLOR = '#eef4f7'

/**
 * Unlit topographic material: fwidth-antialiased iso-lines over a cream base.
 * Minor contours in soft blue, every 5th in dark blue — the clean-lined
 * editorial look, no lighting at all.
 *
 * Success feedback lives in the same language: `uRippleCenter` +
 * `uRippleProgress` (0→1) drive an expanding annulus that briefly tints the
 * contour lines mint around a landing tile.
 *
 * `snowlineY`: above this world elevation, contour lines fade out as a cool
 * snow wash fades in — the finale massif's cap. Only that peak crosses a real
 * snowline (hills top out at MAX_ELEVATION); the default parks it far above
 * everything. The fade doubles as the moiré guard: ring spacing tightens near
 * a summit, and the wash covers exactly the band where rings would alias.
 */
export const createContourMaterial = (rippleRadius: number, snowlineY = 1e6): ContourMaterial => {
  const material = new ShaderMaterial({
    uniforms: {
      uSnow: { value: new Color(SNOW_COLOR) },
      uSnowline: { value: snowlineY },
      uSnowBand: { value: 1.6 },
      uBase: { value: new Color(BOARD_COLORS.sourMilk) },
      uMinor: { value: new Color(BOARD_COLORS.softBlue) },
      uMajor: { value: new Color(BOARD_COLORS.darkBlue) },
      uSand: { value: new Color(BOARD_COLORS.warmSand) },
      uMint: { value: new Color(BOARD_COLORS.softMint) },
      uStep: { value: MAX_ELEVATION / 8 },
      uMajorEvery: { value: 5 },
      uLineWidth: { value: 0.9 },
      uMaxElevation: { value: MAX_ELEVATION },
      uRippleCenter: { value: new Vector2() },
      uRippleProgress: { value: -1 },
      uRippleRadius: { value: rippleRadius },
      // Mint for landings, swapped to coral when a pawn slams into a challenge
      uRippleColor: { value: new Color(BOARD_COLORS.softMint) },
      // Matches withEdgeFalloff's band, so lines, hills and tint melt together
      uFadeStart: { value: EDGE_FADE_START },
      uFadeEnd: { value: EDGE_FADE_END },
    },
    vertexShader: /* glsl */ `
      attribute float aSlope;

      varying float vElevation;
      varying float vSlope;
      varying vec2 vXZ;

      void main() {
        vElevation = position.y;
        vSlope = aSlope;
        vXZ = position.xz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uBase;
      uniform vec3 uMinor;
      uniform vec3 uMajor;
      uniform vec3 uSand;
      uniform vec3 uMint;
      uniform vec3 uSnow;
      uniform float uSnowline;
      uniform float uSnowBand;
      uniform float uStep;
      uniform float uMajorEvery;
      uniform float uLineWidth;
      uniform float uMaxElevation;
      uniform vec2 uRippleCenter;
      uniform float uRippleProgress;
      uniform float uRippleRadius;
      uniform vec3 uRippleColor;
      uniform float uFadeStart;
      uniform float uFadeEnd;

      varying float vElevation;
      varying float vSlope;
      varying vec2 vXZ;

      float lineMask(float value, float stepSize, float width) {
        float derivative = max(fwidth(value), 1e-5);
        float distance = abs(fract(value / stepSize - 0.5) - 0.5) * stepSize / derivative;
        // AA band widened from +1.0 after Isaac's aliasing report: the line
        // edge crumbled where the coarse terrain lattice interpolates the
        // elevation across a whole pixel-scale ring period.
        float mask = 1.0 - smoothstep(width, width + 1.8, distance);
        // When contours pack tighter than the antialiasing can resolve (the
        // far field at grazing camera angles), the smeared lines read as a
        // grey wash over the cream — and that wash meeting the clean page at
        // the plane's edge was the visible horizon seam. Fade lines away as
        // ring period approaches pixel scale; majors (5x the step) naturally
        // survive the longest, which is correct topo behavior.
        float density = derivative / stepSize;
        return mask * (1.0 - smoothstep(0.18, 0.5, density));
      }

      void main() {
        // Fade lines out only on genuinely flat ground (the path shelf).
        // World-space slope keeps line strength constant along a contour —
        // screen-space derivatives vary with zoom/angle and looked patchy.
        // The band's lower edge also culls contour micro-islands: tiny closed
        // loops circling near-flat bumps that read as specks on the page.
        float flatness = smoothstep(0.02, 0.06, vSlope);
        // Contours dissolve toward the horizon instead of ending at a hard edge
        float edgeFade = 1.0 - smoothstep(uFadeStart, uFadeEnd, length(vXZ));
        // Lines hand over to the snow wash across the snowline band
        float snow = smoothstep(uSnowline, uSnowline + uSnowBand, vElevation);
        float strength = flatness * edgeFade * (1.0 - snow);
        float minor = lineMask(vElevation, uStep, uLineWidth) * strength;
        float major = lineMask(vElevation, uStep * uMajorEvery, uLineWidth * 1.6) * strength;

        // Near-imperceptible warm tint toward peaks for depth without shading;
        // it drains with edgeFade so the rim lands on exactly the page color.
        // Clamped: the finale massif rises past uMaxElevation, and unclamped
        // it dragged the mix 2-3x past the wash the palette was tuned for.
        vec3 color = mix(uBase, uSand, clamp(vElevation / uMaxElevation, 0.0, 1.0) * 0.08 * edgeFade);
        color = mix(color, uMinor, minor * 0.95);
        color = mix(color, uMajor, major);
        color = mix(color, uSnow, snow * 0.85);

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

        gl_FragColor = vec4(color, 1.0);
        // Colorspace conversion ONLY — deliberately no tonemapping chunk.
        // Without the conversion, a custom ShaderMaterial outputs raw linear
        // color and the terrain rendered a shade darker than the identical
        // clear color behind it, drawing the plane's edge as a hard horizon
        // seam. Tone mapping must stay OUT: the renderer tone-maps materials
        // but never the clear color, so a tone-mapped terrain can never match
        // the page — converted-but-unmapped output makes the far field
        // EXACTLY the authored cream the canvas clears to.
        #include <colorspace_fragment>
      }
    `,
  })

  return material as ContourMaterial
}
