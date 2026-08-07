/**
 * Shared pacing for the clocked round engines (chain-turns, heritage-beats,
 * timeline-turns, manhunt-beats). One source so the table's rhythm never
 * drifts between modes.
 */

/** Post-round basking time before scores, matching the challenge handlers' 5s. */
export const REVEAL_HOLD_MS = 6000
/** Buzzer grace so an on-the-wire submit beats its own turn's timeout. */
export const TIMEOUT_SLACK_MS = 350
/** Extra opening-turn time — the first clock starts behind the round
 *  interstitial, which everyone watches for a few seconds. */
export const FIRST_TURN_GRACE_MS = 4000
/** How long a briefing (the click-away rules cards manhunt and unique-or-bust
 *  open on) may hold before the round starts regardless. */
export const BRIEFING_CAP_MS = 30000
/** Border Chain's dead-end hold: long enough for the table to read the closed
 *  doors and see that the trapped player truly had no move. The client's
 *  overlay reads this too — one beat, one constant. */
export const TRAP_HOLD_MS = 5500
/** A gate's result beat: how long the seat basks in its verdict before the
 *  walk resumes. The gate shell reads it too — the beat normally ends by the
 *  view unmounting (the seat walks on), but a leap that lands the pawn at the
 *  NEXT gate's stop tile re-enters the same phase with nothing to walk, so the
 *  shell has to time the beat's end itself. One beat, one constant. */
export const GATE_RESULT_HOLD_MS = 5000
/** Wire grace on the shell's copy of the beat, so the server's own resume —
 *  which unmounts the view in the ordinary walked case — lands first and the
 *  shell's fallback stays a fallback. */
export const GATE_RESULT_WIRE_GRACE_MS = 750
