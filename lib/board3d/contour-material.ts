import { Color, ShaderMaterial, Vector2 } from 'three'
import { BOARD_COLORS } from './colors'
import { MAX_ELEVATION } from './terrain'

export interface ContourMaterial extends ShaderMaterial {
  uniforms: ShaderMaterial['uniforms'] & {
    uRippleCenter: { value: Vector2 }
    uRippleProgress: { value: number }
    uRippleColor: { value: Color }
  }
}

/**
 * Unlit topographic material: fwidth-antialiased iso-lines over a cream base.
 * Minor contours in soft blue, every 5th in dark blue — the clean-lined
 * editorial look, no lighting at all.
 *
 * Success feedback lives in the same language: `uRippleCenter` +
 * `uRippleProgress` (0→1) drive an expanding annulus that briefly tints the
 * contour lines mint around a landing tile.
 */
export const createContourMaterial = (rippleRadius: number): ContourMaterial => {
  const material = new ShaderMaterial({
    uniforms: {
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
      uFadeStart: { value: 85 },
      uFadeEnd: { value: 130 },
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
        return 1.0 - smoothstep(width, width + 1.0, distance);
      }

      void main() {
        // Fade lines out only on genuinely flat ground (the path shelf).
        // World-space slope keeps line strength constant along a contour —
        // screen-space derivatives vary with zoom/angle and looked patchy.
        float flatness = smoothstep(0.012, 0.045, vSlope);
        // Contours dissolve toward the horizon instead of ending at a hard edge
        float edgeFade = 1.0 - smoothstep(uFadeStart, uFadeEnd, length(vXZ));
        float strength = flatness * edgeFade;
        float minor = lineMask(vElevation, uStep, uLineWidth) * strength;
        float major = lineMask(vElevation, uStep * uMajorEvery, uLineWidth * 1.6) * strength;

        // Near-imperceptible warm tint toward peaks for depth without shading
        vec3 color = mix(uBase, uSand, (vElevation / uMaxElevation) * 0.08);
        color = mix(color, uMinor, minor * 0.95);
        color = mix(color, uMajor, major);

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
      }
    `,
  })

  return material as ContourMaterial
}
