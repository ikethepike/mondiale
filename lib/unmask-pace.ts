import { clamp01 } from './number'
import type { UnmaskChallenge, UnmaskRungKind } from '~~/types/challenges/group-modes.type'
import type { GameDifficulty } from '~~/types/game.types'

/**
 * Unmask's ladder, clock and pay — no data, so the server's round clocks
 * import it statically. What a rung SAYS lives in `unmask.ts`.
 */

export const UNMASK_TUNING: {
  [difficulty in GameDifficulty]: {
    /** The rungs in order. A rung the subject has no data for is dropped. */
    ladder: UnmaskRungKind[]
    /** Each `portrait` rung's resolution, in ladder order — powers of two, so
     *  every tile splits into four on the next one. */
    tiers: number[]
    secondsPerRung: number
    /** A narrowing clue only dims the map while it leaves this many suspects
     *  lit — below it the map would be answering for the player. */
    floor: number
    /** Subjects come from the board's most populous countries with a file. */
    reach: number
  }
} = {
  easy: {
    ladder: [
      'portrait',
      'region',
      'born',
      'office',
      'portrait',
      'party',
      'logo',
      'portrait',
      'initials',
      'name',
    ],
    tiers: [8, 16, 32],
    secondsPerRung: 6,
    floor: 3,
    reach: 40,
  },
  normal: {
    ladder: [
      'portrait',
      'born',
      'office',
      'portrait',
      'tenure',
      'party',
      'portrait',
      'logo',
      'portrait',
      'initials',
      'name',
    ],
    tiers: [4, 8, 16, 32],
    secondsPerRung: 5,
    floor: 5,
    reach: 100,
  },
  hard: {
    ladder: ['portrait', 'born', 'tenure', 'portrait', 'office', 'party', 'portrait', 'name'],
    tiers: [4, 8, 16],
    secondsPerRung: 5,
    floor: 6,
    reach: Infinity,
  },
}

/** The largest portrait tier any ladder deals — the generator's source size. */
export const UNMASK_SOURCE_SIZE = 32

export const unmaskKey = (gameId: string, roundIndex: number) => `${gameId}:unmask:${roundIndex}`

/** Where the client store files a seat's dossier for one round. */
export const unmaskDossierKey = (gameId: string, round: number) => `${gameId}:${round}`

/** The round's play length: the last rung's interval is the tail. */
export const unmaskSeconds = (challenge: Pick<UnmaskChallenge, 'rungs' | 'secondsPerRung'>) =>
  challenge.rungs.length * challenge.secondsPerRung

/** Rungs open `elapsedMs` into the play window — the first lands at once. */
export const unmaskRungsShown = (
  challenge: Pick<UnmaskChallenge, 'rungs' | 'secondsPerRung'>,
  elapsedMs: number
): number =>
  Math.min(
    challenge.rungs.length,
    1 + Math.floor(Math.max(0, elapsedMs) / 1000 / challenge.secondsPerRung)
  )

/** What an accusation is still worth, 0..1: full on the first rung, nothing
 *  past the buzz floor once the name is out. */
export const unmaskRemainingFraction = (
  challenge: Pick<UnmaskChallenge, 'rungs'>,
  shown: number
): number => {
  const total = challenge.rungs.length
  return total > 1 ? clamp01((total - shown) / (total - 1)) : 1
}
