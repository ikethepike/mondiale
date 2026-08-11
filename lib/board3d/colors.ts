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
  // Clay. The parties gate SHARES the leader gate's lectern — one political
  // register, the way errata shares the ISO signpost — so the top carries the
  // whole distinction and had to be picked for distance rather than theme.
  // Against the leader wash it measures ΔE 35.1, far wider than the pair doing
  // the same job today (errata vs isoCode, 20.6); its tightest neighbour
  // anywhere is flag at 15.4, and flag shares no silhouette with it. The
  // obvious teal was measured first and rejected — 6.3 from landmarks.
  'government.parties': '#c98f7a',
  currency: '#d9a675', // deeper sand — gold at board scale
  landmarks: '#90bcb5', // softMint
  // The only near-neutral top on the board — foxed paper, so the misprint gate
  // reads as a page rather than a place. A lighter grey was tried and measured
  // badly: at ΔE 14.3 from a plain sourMilk tile it barely announced itself as
  // a gate at all, where every other top sits 21+ away. This one sits at 27.
  errata: '#bfada7',
  // Limestone — vellum under the quill. A mint was tried first and measured
  // badly: ΔE 7.9 from the errata top, tighter than the palette's own worst
  // pair (isoCode vs leader, 8.6). Limestone's tightest neighbour is not
  // errata (15.1) but capital.name, at 12.2 — clear of the floor, and the
  // closest any pair involving a new tint gets.
  lexicon: '#cfc6a8',
  // Faded wisteria — old ink over vellum, the history gate. Violet is new to
  // the board on purpose: its closest neighbour is the leader top at ΔE 15.5
  // (above the 12.2 floor the lexicon pick established), and it sits far from
  // the paper pair (errata 21.2, lexicon 24+), so the two page-like tops stay
  // unmistakably themselves.
  history: '#b9a8c9',
}
