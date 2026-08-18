import type { Player } from '~~/types/player.type'
import type { PlayerMove } from '~~/types/game.types'

/**
 * The tile a move actually parks the pawn on. A challenge move stops one tile
 * SHORT of its gate — the gate tile is entered only by answering it — so the
 * walk loop, the status label and the board all have to agree here. Single
 * source for that split; never re-derive `endTile.position - 1` inline.
 */
export const moveStopTile = (move: PlayerMove): number =>
  move.challenge ? move.endTile.position - 1 : move.endTile.position

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
  /** Finishing position, 1-based, once this seat has won. */
  place?: number
  /** Gauntlet progress while in the final challenge. */
  final?: { answered: number; total: number }
}

/** 1st / 2nd / 3rd — the podium reads better than "place 2". */
export const placeLabel = (place: number): string => {
  const tens = place % 100
  if (tens >= 11 && tens <= 13) return `${place}th`
  return `${place}${['th', 'st', 'nd', 'rd'][place % 10] ?? 'th'}`
}

/**
 * Where a finished seat placed: everyone who completed EARLIER outranks them.
 * Derived from the same `completedAtRound` the standings sort by, so the panel
 * and the final scoreboard can never disagree about who came second.
 */
const finishingPlace = (player: Player, table: readonly Player[]): number | undefined => {
  const finishedAt = player.completedAtRound
  if (finishedAt === undefined) return undefined
  const ahead = table.filter(
    other =>
      other.id !== player.id &&
      other.completedAtRound !== undefined &&
      other.completedAtRound < finishedAt
  ).length
  return ahead + 1
}

/**
 * Tiles left to walk: the last queued move's stop tile minus where the pawn
 * stands. Counting to `endTile` instead would bank a step the walk can never
 * spend when that move is a challenge gate.
 */
const stepsRemaining = (player: Player): number => {
  const lastMove = player.moves[player.moves.length - 1]
  return lastMove ? Math.max(0, moveStopTile(lastMove) - player.currentPosition) : 0
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
export const getPlayerStatus = (player: Player, table: readonly Player[] = []): PlayerStatus => {
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
    case 'final-challenge': {
      // The gauntlet is the tensest stretch of the game to watch someone else
      // play — "in the final challenge" for two minutes says nothing about
      // whether they are one question from winning.
      const gauntlet = player.moves[0]?.challenge
      const final =
        gauntlet?._type === 'final-challenge'
          ? { answered: gauntlet.answeredCorrect, total: gauntlet.totalCount }
          : undefined
      return {
        label: final
          ? `Final challenge · ${final.answered}/${final.total}`
          : 'In the final challenge',
        busy: true,
        done: false,
        gone: false,
        final,
      }
    }
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
    case 'victory': {
      // WHERE they finished, not just that they did — a four-player table ends
      // with three "Finished the race!" rows that say nothing about the podium.
      const place = finishingPlace(player, table)
      return {
        label: place ? `Finished ${placeLabel(place)}` : 'Finished the race!',
        busy: false,
        done: true,
        gone: false,
        place,
      }
    }
    case 'kicked':
      return { label: 'Knocked out', busy: false, done: false, gone: true }
    default:
      return { label: 'Waiting', ...idle }
  }
}
