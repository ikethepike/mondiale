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
