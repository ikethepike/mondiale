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
  // Dozens of countries share the language, so a named guess is colour rather
  // than a clue — and seeing it is what makes the multi-answer rule legible.
  'tongue-buzz': 'label',

  // ~195 candidates, free-typed: one wrong name is noise, not a clue.
  'flag-palette': 'label',
  'capital-guess': 'label',
  flashpoint: 'label',
  // ~195 capitals, free-typed with no suggestion list: a wrong city is noise
  // and worth seeing. The mode's HITS travel unlabelled anyway — the view
  // sends presence for a correct name (useCollectSetRound's rule), so a
  // player who lights a star hands the room tension, not the answer.
  'star-chart': 'label',
  // Benches are dragged, not named, so there is no guess to broadcast.
  government: 'none',
  // The room shares one failing atlas, but a NAMED guess here is always a
  // wrong one — the composable sends hits as bare presence — and a wrong name
  // says only "that country is still on the map", which is true of nearly two
  // hundred of them. Nothing to leak, and the misses are the round's comedy.
  'terra-incognita': 'label',

  // Unlike the other option rounds, composition's table IS the bar's own
  // origins — a handful, shared by the room — so a named wrong guess strikes a
  // slice off everyone's list.
  composition: 'presence',

  // One hidden target, shared by the room.
  'hot-cold': 'presence',
  silhouette: 'presence',
  'anthem-buzz': 'presence',
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

  // Five cards, one shared answer — naming a pick hands it out.
  'trend-race': 'presence',

  // Two beats, both hunting shared answers: the buzz names the one ghost,
  // the taps trace the one extent.
  empire: 'presence',

  // One hidden point per beat, shared by the room, like pin-landmark.
  'heritage-hunt': 'presence',

  // The first turn-based mode with a live secret: every detective hunts the
  // one hidden despot, so a named marker is a bearing on the hideout. The
  // room sees who has locked in, never where.
  manhunt: 'presence',

  // Everyone answers the same letter, and a duplicate cancels both holders —
  // naming a pick would let the table dodge the collision. The room sees who
  // has locked a slot, never the word.
  'unique-or-bust': 'presence',

  // The opposite of its blind siblings, on purpose. Claims are already public
  // (they ride the snapshot and paint the board), so the ticker carries only
  // what the board cannot: a wrong name — anti-information in a ~195-country
  // field, and the round's teaching beat — and a collision, which names a
  // country the room can already see is taken.
  'clean-sweep': 'label',

  // Presence, NOT label. Every country is on every screen from the start, so a
  // name leaks no identity — but with only four subjects there are just 24
  // possible arrangements, and watching a confident player seat one would hand
  // the room most of the puzzle. What travels is the RACE: someone has placed
  // their third, someone has taken one back. The round is otherwise a silent
  // minute, and it is the one mode with real intermediate state to broadcast.
  'pyramid-scheme': 'presence',

  // No guess stream to speak of: turn-based, every move is already public.
  'border-chain': 'none',
  atlas: 'none',
  timeline: 'none',
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
