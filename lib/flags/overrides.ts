import type { Family, OverrideTable, Placement } from './types'

/**
 * Default placement per family — the heuristic anchor/scale that seats an
 * emblem when no per-flag override applies. Families with no emblem (plain,
 * nordic) still carry an entry but it's unused. Tuned by eye in the review
 * harness (`pages/flags-review.vue`); see the plan's per-family notes.
 */
export const FAMILY_DEFAULTS: Record<Family, Placement> = {
  plain: { anchor: { region: 'field', at: 'center' }, scaleMode: 'fitHeight', k: 1 },
  nordic: { anchor: { region: 'field', at: 'center' }, scaleMode: 'fitHeight', k: 1 },
  'hoist-triangle': {
    anchor: { region: 'triangle', at: 'center' },
    scaleMode: 'fitHeight',
    k: 0.5,
  },
  // Preserve where the arms/emblem sit AND their real size (k:0). Recomposition
  // only widens the field, so an emblem keeps its exact source proportions —
  // centred stays centred, hoist stays hoist, and a device that was a third of
  // the flag height stays a third. A per-flag `k` override forces a resize.
  'vertical-triband': { anchor: { preserve: true }, scaleMode: 'fitHeight', k: 0 },
  'horizontal-band': { anchor: { preserve: true }, scaleMode: 'fitHeight', k: 0 },
  'single-device': { anchor: { preserve: true }, scaleMode: 'fitHeight', k: 0 },
  canton: { anchor: { region: 'canton', at: 'center' }, scaleMode: 'fitHeight', k: 0.8 },
  ensign: { anchor: { region: 'field', at: 'center' }, scaleMode: 'fitHeight', k: 0.5 },
  oneoff: { anchor: { region: 'field', at: 'center' }, scaleMode: 'fitHeight', k: 0.5 },
}

/**
 * Per-flag overrides, merged over the family default. Use `family` to force a
 * reclassification and `exclude: true` to route a flag to the contain-fallback.
 * Populated during the harness review sweep.
 */
export const OVERRIDES: OverrideTable = {
  // KI's frigatebird + wave bands are designed to reach the edges — stretch it.
  KI: { stretch: true },

  // Per-flag emblem tuning.
  DZ: { k: 0.3, dx: -25 }, // Algeria crescent+star: smaller, nudged toward hoist
  BA: { k: 0.9 }, // Bosnia star-diagonal reads a touch large at full size

  // Genuinely-hard flags are handled by hand-authored WIDE_SVGS (wide-svgs.ts) —
  // the WIDE_SVGS lookup in recompose() takes precedence, so they never reach
  // the engine and need no entry here (CA IL GY MG OM NZ BJ HR TM ZA MK NA MY
  // JM GM BR AU BT LA SS KN CL DO FJ TG LR PW PA SC …).

  // Still falling to the contain-fallback (awkward mixed-field layouts):
  GW: { exclude: true }, // hoist-bar + two blocks on negative viewBox
  UY: { exclude: true }, // sun + mixed stripes on negative viewBox
}
