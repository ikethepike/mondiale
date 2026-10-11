import { DWELL } from '~~/lib/motion'
import { compareStandings, playerDisplayName } from '~~/lib/player'
import { getPlayerStatus, placeLabel } from '~~/lib/player-status'
import { latestRound } from '~~/lib/rounds'
import { isSettledStep } from '~~/lib/seat-transitions'
import { seatVerdictOn } from '~~/lib/seat-view'
import { listJoin } from '~~/lib/strings'
import { secondsOnDeadline } from '~~/lib/use-deadline-clock'
import type { Game } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'
import type { SeatCursor } from '~~/types/seat.types'

type Table = Pick<Game, 'players' | 'rounds' | 'tiles'>

const tiles = (count: number) => `${count} tile${count === 1 ? '' : 's'}`
const steps = (count: number) => `${count} step${count === 1 ? '' : 's'}`

const seats = (game: Pick<Game, 'players'>): Player[] =>
  Object.values(game.players).filter((player): player is Player => !!player)

/** Seats still playing out this turn, the one holding the table up longest first. */
export const tableWaitingOn = (game: Pick<Game, 'players'>, seatId: string): Player[] =>
  seats(game)
    .filter(player => player.id !== seatId && !isSettledStep(player.cursor.step))
    .sort((a, b) => (b.cursor.deadline ?? 0) - (a.cursor.deadline ?? 0))

export interface TableClock {
  player: Player
  seconds: number
  totalSeconds: number
}

/** The latest answer clock among the waiting seats — a gate or a final question, never a reading cap. */
export const tableClock = (waiting: readonly Player[], now: number): TableClock | undefined => {
  const timed = waiting
    .filter(player => ['gate', 'final'].includes(player.cursor.step))
    .filter(player => (player.cursor.deadline ?? 0) > now)
    .sort((a, b) => b.cursor.deadline! - a.cursor.deadline!)
  const player = timed[0]
  if (!player) return undefined
  const { deadline, enteredAt } = player.cursor
  return {
    player,
    seconds: secondsOnDeadline(deadline, now),
    totalSeconds: Math.max(1, Math.round((deadline! - enteredAt) / 1000)),
  }
}

export const waitingTitle = (waiting: readonly Player[]): string =>
  waiting.length > 3
    ? `Waiting on ${waiting.length} players`
    : `Waiting on ${listJoin(waiting.map(player => playerDisplayName(player)))}`

export const waitingTail = (waiting: readonly Player[]): string =>
  waiting.length === 1 ? 'the last one still playing' : 'next round once they finish'

export interface Setback {
  forfeitedSteps: number
  /** Server time the setback gives way to the wait. */
  until: number
}

/** A gate that held this turn, while its line still owns the caption. */
export const seatSetback = (game: Table, seatId: string): Setback | undefined => {
  const cursor = game.players[seatId]?.cursor
  const blocked = latestRound(game)?.playerTurns[seatId]?.blocked
  if (cursor?.step !== 'settled' || !blocked || blocked.forfeitedSteps <= 0) return undefined
  return { forfeitedSteps: blocked.forfeitedSteps, until: cursor.enteredAt + DWELL.setback }
}

export const setbackTail = (setback: Setback): string =>
  `${steps(setback.forfeitedSteps)} lost, you stay put this turn`

/** "+7 points · 3rd of 4 · 6 tiles behind Anna · 16 tiles to the finish" */
export const turnRecap = (game: Table, seatId: string): string | undefined => {
  const seat = game.players[seatId]
  if (!seat) return undefined
  const parts: string[] = []

  const scored = latestRound(game)?.playerTurns[seatId]?.points.scored
  if (scored !== undefined) {
    parts.push(scored ? `+${scored} point${scored === 1 ? '' : 's'}` : 'No points this round')
  }

  const racers = seats(game)
    .filter(player => player.cursor.step !== 'kicked')
    .sort(compareStandings)
  const place = racers.findIndex(player => player.id === seatId) + 1
  const leader = racers[0]
  if (racers.length > 1 && place > 0 && leader) {
    if (place === 1) {
      const lead = seat.currentPosition - (racers[1]?.currentPosition ?? seat.currentPosition)
      parts.push(lead > 0 ? `leading by ${tiles(lead)}` : 'level at the front')
    } else {
      parts.push(`${placeLabel(place)} of ${racers.length}`)
      const gap = leader.currentPosition - seat.currentPosition
      if (leader.completedAtRound !== undefined) {
        parts.push(`${playerDisplayName(leader)} has finished`)
      } else if (gap > 0) {
        parts.push(`${tiles(gap)} behind ${playerDisplayName(leader)}`)
      }
    }
  }

  const toGo = game.tiles.length - 1 - seat.currentPosition
  if (toGo > 0) parts.push(`${tiles(toGo)} to the finish`)

  return parts.length ? parts.join(' · ') : undefined
}

/** What changed for another seat between two cursors worth telling the table, if anything. */
export const tableNews = (
  previous: SeatCursor | undefined,
  player: Player,
  table: readonly Player[]
): string | undefined => {
  const cursor = player.cursor
  if (!previous || previous.seq === cursor.seq || previous.step === cursor.step) return undefined
  const name = playerDisplayName(player)

  switch (cursor.step) {
    case 'gate-verdict': {
      const verdict = seatVerdictOn(cursor, 'gate')
      if (!verdict) return undefined
      if (verdict.correct) {
        return verdict.steps > 0
          ? `${name} cleared a gate and leaps ${tiles(verdict.steps)}`
          : `${name} cleared a gate`
      }
      return verdict.timedOut
        ? `${name} ran out of time at a gate`
        : `${name} was stopped at a gate`
    }
    case 'final':
      return previous.step === 'final-verdict' ? undefined : `${name} reached the final challenge`
    case 'final-verdict':
      return seatVerdictOn(cursor, 'final')?.knockedOut
        ? `${name} was knocked out of the final challenge`
        : undefined
    case 'victory': {
      const place = getPlayerStatus(player, table).place
      return place ? `${name} finished ${placeLabel(place)}!` : `${name} finished the race!`
    }
    default:
      return undefined
  }
}

/** The one seat left: what it is doing, so the wait has a story. */
export const lastOneNews = (player: Player): string => {
  const name = playerDisplayName(player)
  const status = getPlayerStatus(player)
  switch (player.cursor.step) {
    case 'gate':
    case 'gate-verdict':
      return status.steps
        ? `${name} is the last one playing, at a gate with ${steps(status.steps)} banked`
        : `${name} is the last one playing, at a gate`
    case 'final':
    case 'final-verdict':
      return status.final
        ? `${name} is the last one playing, ${status.final.answered} of ${status.final.total} into the final challenge`
        : `${name} is the last one playing, in the final challenge`
    case 'walk':
    case 'arrive':
      return `${name} is the last one playing, still on the move`
    default:
      return `${name} is the last one still playing`
  }
}
