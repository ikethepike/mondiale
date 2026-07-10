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
