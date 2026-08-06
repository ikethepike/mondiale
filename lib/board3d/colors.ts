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
  // Scene-only: still water in the decorative ponds
  pondBlue: '#4d92b3',
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
  // The only near-neutral top on the board — foxed paper, so the misprint gate
  // reads as a page rather than a place. A lighter grey was tried and measured
  // badly: at ΔE 14.3 from a plain sourMilk tile it barely announced itself as
  // a gate at all, where every other top sits 21+ away. This one sits at 27.
  errata: '#bfada7',
  // Limestone, echoing the stele's sand slab. A mint was tried first and
  // measured badly too: ΔE 7.9 from the errata top, tighter than the palette's
  // own worst pair (isoCode vs leader, 8.6).
  lexicon: '#cfc6a8',
}
