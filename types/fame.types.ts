import type { GameDifficulty } from './game.types'

/**
 * How recognisable a curated subject is — the difficulty lever the subject's
 * own facts cannot provide. 1969 is 1969 whether the card is the Moon landing
 * or the Kunming–Hanoi railway; an extent sweep is an extent sweep whether the
 * ghost is Rome or Kanem–Bornu. Only fame tells the two apart.
 *
 * `major` is the shared canon a pub quiz would use; `minor` rewards a reader of
 * history; `obscure` is fair but genuinely hard, and should never crowd a
 * beginner's table.
 *
 * ONE classification for every mode that deals a curated roster — Timeline and
 * Chronicle's events (`EventSeed.fame`), Ghosts of Empires' polities
 * (`EmpireSeed.fame`) and the photographed places behind pin-landmark and
 * Heritage Hunt (`PlaceEntry.fame`) — so a tier means the same thing wherever
 * it is read.
 *
 * A roster's generator STAMPS the tier; nothing re-derives it at deal time. The
 * place rosters used to gate on position within the country as the pool was
 * filtered, which made the difficulty an implicit property of array order that
 * the generators' resurrection merge could scramble.
 */
export type Fame = 'major' | 'minor' | 'obscure'

/** Ascending by obscurity — iteration order for reports and linters. */
export const FAME_TIERS = ['major', 'minor', 'obscure'] as const

/**
 * Which tiers a difficulty may deal. Cumulative on purpose — hard still wants
 * the Moon landing among its deep cuts, and Rome among its ghosts, or the deck
 * stops feeling like history and starts feeling like a specialist exam.
 *
 * The gate only says what is ALLOWED; a mode may still lean within it (see
 * `EMPIRE_TUNING.fameWeights`, which ranks the allowed tiers rather than
 * re-deciding them).
 */
export const FAME_BY_DIFFICULTY: { [difficulty in GameDifficulty]: Set<Fame> } = {
  easy: new Set<Fame>(['major']),
  normal: new Set<Fame>(['major', 'minor']),
  hard: new Set<Fame>(['major', 'minor', 'obscure']),
}

/** Is a subject of this tier dealable at this difficulty? */
export const isFameDealable = (fame: Fame, difficulty: GameDifficulty): boolean =>
  FAME_BY_DIFFICULTY[difficulty].has(fame)
