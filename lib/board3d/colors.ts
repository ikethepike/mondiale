import type { IndividualChallengeAccessorId } from '~~/types/challenges/individual-challenge.type'

// Hex mirrors of assets/scss/rules/_palette.scss for the WebGL scene —
// three.js needs concrete color values, CSS custom properties can't reach it.
export const BOARD_COLORS = {
  sourMilk: '#fffaf5',
  darkBlue: '#0d2f61',
  softBlue: '#3481a1',
  softMint: '#90bcb5',
  warmSand: '#f1b982',
  hiorAnge: '#ec6247',
  ink: '#131313',
  // Scene-only, no SCSS counterpart: the runner-up crown metal
  silver: '#c9ccd1',
} as const

// Scene-only gate-top washes: each brand hue mixed toward sourMilk so a
// gate's theme reads from the tile itself, not just its marker. Landmarks
// keeps the historical full-strength mint — the "gate color" anchor.
export const TILE_TOP_TINTS: Record<IndividualChallengeAccessorId, string> = {
  flag: '#f6b6a7', // hiorAnge wash
  isoCode: '#a4c4cf', // softBlue wash
  'capital.name': '#f7d6b6', // warmSand wash
  'government.leader': '#b6bdc9', // darkBlue wash
  currency: '#d9a675', // deeper sand — gold at board scale
  landmarks: '#90bcb5', // softMint
}
