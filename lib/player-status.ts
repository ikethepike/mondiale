import type { Player } from '~~/types/player.type'

export interface PlayerStatus {
  /** Short human label, e.g. "Walking · 4 steps left". */
  label: string
  /** Actively doing something time-bound — drives the live "busy" pulse. */
  busy: boolean
  /** Finished the game. */
  done: boolean
  /** No longer in play (kicked); callers usually drop these. */
  gone: boolean
  /** Board steps still to walk (including beyond a pending gate), when relevant. */
  steps?: number
}

/** Tiles left to walk: end of the final queued move minus where the pawn stands. */
export const stepsRemaining = (player: Player): number => {
  const lastMove = player.moves[player.moves.length - 1]
  return lastMove ? Math.max(0, lastMove.endTile.position - player.currentPosition) : 0
}

// Non-breaking spaces keep the steps phrase whole — the label wraps at the
// "·" separator instead of mid-phrase.
const plural = (count: number, noun: string) => `${count}\u00A0${noun}${count === 1 ? '' : 's'}`

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
    case 'individual-challenge': {
      const steps = stepsRemaining(player)
      return {
        label:
          steps > 0
            ? `At a challenge gate · ${plural(steps, 'step')}\u00A0banked`
            : 'At a challenge gate',
        busy: true,
        done: false,
        gone: false,
        steps,
      }
    }
    case 'final-challenge':
      return { label: 'In the final challenge', busy: true, done: false, gone: false }
    case 'moving': {
      const steps = stepsRemaining(player)
      return {
        label:
          steps > 0
            ? `Walking · ${plural(steps, 'step')}\u00A0left`
            : `Walking · tile ${player.currentPosition}`,
        busy: true,
        done: false,
        gone: false,
        steps,
      }
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
