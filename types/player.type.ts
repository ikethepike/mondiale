import type { PlayerColor, PlayerMove } from './game.types'
import type { SeatCursor } from './seat.types'

export interface Player {
  id: string
  name?: string
  ready: boolean
  color: PlayerColor
  /** What this seat should be looking at. Written ONLY by `advanceSeat`. */
  cursor: SeatCursor
  moves: PlayerMove[]
  currentPosition: number
  completedAtRound?: number
  /** A computer-controlled seat, added by the host in the lobby. Rides the
   *  snapshot on purpose (clients render the bot badge); the seat has no
   *  bearer secret and the join door refuses its id, so no socket can ever
   *  bind to it. The bot brain (bot-brain.ts) plays it server-side. */
  bot?: true
  /** Host asked this bot to leave mid-race. The brain retires the seat (to
   *  'kicked') at the next moment it owes the table nothing — a round it is
   *  mid-way through gets played out first. Bot-only, cleared on retirement. */
  retiring?: true
  /** The bot brain is covering this HUMAN seat while its player is away.
   *  Set by the AFK takeover (socket gone past the grace window mid-race),
   *  cleared by the player's rejoin. `sinceRound` bounds the catch-up
   *  summary the returning player is shown. */
  autopilot?: { sinceRound: number }
}
