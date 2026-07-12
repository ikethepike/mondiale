import {
  type RoundChallenge,
  type RoundChallengeKind,
  roundChallengeKind,
} from '~~/types/challenges/traversal-challenge.type'
import type { Game } from '~~/types/game.types'

/**
 * How much of a guess the room may see.
 *
 * `label` names the country. `presence` says only that someone guessed.
 * `none` broadcasts nothing.
 */
export type GuessPolicy = 'label' | 'presence' | 'none'

/**
 * Naming a wrong guess is safe only where each player holds an independent
 * answer set. Where everyone hunts one hidden target, the guess itself carries
 * information toward it — a hot/cold probe is a distance-and-bearing fix, a
 * wrong buzz names a candidate — so those modes reveal presence alone.
 */
const BASE_POLICY: Record<RoundChallengeKind, GuessPolicy> = {
  // Independent per-player answer sets: nothing shared to leak.
  'neighbour-blitz': 'label',
  'river-run': 'label',
  'shared-shores': 'label',
  highlands: 'label',
  'mother-tongue': 'label',
  traversal: 'label',

  // ~195 candidates, free-typed: one wrong name is noise, not a clue.
  'flag-palette': 'label',
  'capital-guess': 'label',
  flashpoint: 'label',

  // One hidden target, shared by the room.
  'hot-cold': 'presence',
  silhouette: 'presence',
  'stat-detective': 'presence',
  'two-truths': 'presence',
  'name-that-water': 'presence',
  // Both recognition modes hunt one shared answer: the state that claims
  // Transnistria, or the countries that want Hans Island. Naming one IS the
  // answer, so the room sees only that somebody guessed.
  'ghost-state': 'presence',
  'no-mans-land': 'presence',

  // One hidden point, shared by the room: a pin's position IS the answer, so
  // the room learns only that somebody has committed one.
  'pin-landmark': 'presence',

  // One hidden point per beat, shared by the room, like pin-landmark.
  'heritage-hunt': 'presence',

  // No guess stream to speak of: turn-based, every move is already public.
  'border-chain': 'none',
  sketch: 'none',
  ranking: 'none',
}

/**
 * The single source for both the client's emit and the server's redaction, so
 * the two cannot drift. Reads the setting as `!== false`: games created before
 * it existed carry no such key and default to on.
 */
export const guessPolicyFor = (
  game: Pick<Game, 'liveGuesses'> | undefined,
  challenge: RoundChallenge | undefined
): GuessPolicy => {
  if (!game || game.liveGuesses === false) return 'none'
  if (!challenge) return 'none'

  // Outside hard mode the option variants (capital-guess, flashpoint) offer a
  // small flag table, so naming a wrong pick eliminates a share of the field.
  // Hard mode free-types the whole world.
  if ('_type' in challenge && 'options' in challenge && challenge.options) {
    return 'presence'
  }

  return BASE_POLICY[roundChallengeKind(challenge)]
}
