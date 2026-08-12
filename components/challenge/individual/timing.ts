/**
 * How long each timed gate gives you. One home for the clocks so a mode's
 * length is readable next to its siblings rather than buried in a component —
 * and so the dev harness and any future tuning read the same numbers.
 *
 * The ceiling is the round barrier: the whole table waits for the slowest
 * walker, so a gate that outlives Border Detective's 40s stalls everyone.
 */
export const BORDER_DETECTIVE_SECONDS = 40
export const TRAJECTORY_MATCH_SECONDS = 40
export const OUTLINE_REVEAL_SECONDS = 25
export const ZOOM_OUT_SECONDS = 20
export const ERRATA_SECONDS = 30
/** Rulers: five logos to read on a framed map. Longer than errata's name check
 *  — recognising a party's mark is slower than reading a country's name. */
export const RULERS_SECONDS = 35
export const ROSETTA_SECONDS = 30
// Several full names typed with no autocomplete — long, but under the ceiling.
export const ATLAS_SECONDS = 35
export const SCRIPTORIUM_SECONDS = 25
// Four cards dragged into place — reading time, not typing time.
export const CHRONICLE_SECONDS = 35
export const FAR_FLUNG_SECONDS = 25
