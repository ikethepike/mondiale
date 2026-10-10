import { bufferDeal } from './seat-journal'

/**
 * Every random draw the server makes mid-game — a dealt round, a moveset, a
 * gauntlet replacement, an engine's reseed, a despot's idle hop — goes
 * through here, labelled, so it is recorded for replay and a replay can hand
 * the recorded value back. Production never sets a source.
 */
export type DrawSource = (label: string) => { value: unknown } | undefined

let source: DrawSource | undefined
export const setDrawSource = (next: DrawSource | undefined) => {
  source = next
}

export const recordedDraw = <T>(game: object, label: string, draw: () => T): T => {
  const replayed = source?.(label)
  const value = replayed ? (replayed.value as T) : draw()
  bufferDeal(game, { label, value })
  return value
}

export const recordedDrawAsync = async <T>(
  game: object,
  label: string,
  draw: () => Promise<T>
): Promise<T> => {
  const replayed = source?.(label)
  const value = replayed ? (replayed.value as T) : await draw()
  bufferDeal(game, { label, value })
  return value
}

/** The labels a draw is recorded under — one spelling per kind of draw. */
export const drawLabel = {
  moves: (seatId: string) => `moves:${seatId}`,
  round: () => 'round',
  finalReplacement: () => 'final-replacement',
  chainSeed: () => 'chain-seed',
  manhuntSeed: () => 'manhunt-seed',
  manhuntCandidates: () => 'manhunt-candidates',
  manhuntMove: () => 'manhunt-move',
  manhuntClue: () => 'manhunt-clue',
}
