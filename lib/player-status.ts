import type { Player } from '~~/types/player.type'

export interface PlayerStatus {
  /** Short human label, e.g. "Walking · tile 34". */
  label: string
  /** Actively doing something time-bound — drives the live "busy" pulse. */
  busy: boolean
  /** Finished the game. */
  done: boolean
  /** No longer in play (kicked); callers usually drop these. */
  gone: boolean
}

/**
 * Map a player's live phase (and position / current move) to a status shown in
 * the multiplayer waiting panel, so a player parked on the board can see the
 * others are still busy rather than assuming the game froze. Purely derived
 * from already-broadcast state — no server round-trip.
 */
export const getPlayerStatus = (player: Player): PlayerStatus => {
  const idle = { busy: false, done: false, gone: false }

  switch (player.phase) {
    case 'naming':
      return { label: 'Choosing a name', ...idle }
    case 'waiting-for-game':
      return { label: 'Waiting in the lobby', ...idle }
    case 'tutorial':
      return { label: 'Reading the rules', ...idle, busy: true }
    case 'group-challenge':
      return { label: 'Answering the round', busy: true, done: false, gone: false }
    case 'individual-challenge':
      return { label: 'At a challenge gate', busy: true, done: false, gone: false }
    case 'final-challenge':
      return { label: 'In the final challenge', busy: true, done: false, gone: false }
    case 'moving':
      return {
        label: `Walking · tile ${player.currentPosition}`,
        busy: true,
        done: false,
        gone: false,
      }
    case 'group-scores':
      return { label: 'Reviewing scores', ...idle }
    case 'movement-summary':
      return { label: 'Finished this turn', ...idle }
    case 'victory':
      return { label: 'Finished the race! 🏁', busy: false, done: true, gone: false }
    case 'kicked':
      return { label: 'Knocked out', busy: false, done: false, gone: true }
    default:
      return { label: 'Waiting', ...idle }
  }
}
