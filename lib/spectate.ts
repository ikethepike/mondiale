import { countryName } from '~~/lib/country'
import {
  roundChallengeKind,
  type RoundChallenge,
  type RoundChallengeKind,
} from '~~/types/challenges/traversal-challenge.type'
import type { ISOCountryCode } from '~~/types/geography.types'
import type { Player, PlayerPhase } from '~~/types/player.type'

/**
 * The spectator booth's centre stage: what the followed player is doing,
 * rendered live. `board` mounts the 3D scene; the rest are story cards.
 */
export type SpectateStageKind = 'question' | 'scores' | 'board' | 'gate' | 'final' | 'idle'

export const stageForPhase = (phase: PlayerPhase): SpectateStageKind => {
  switch (phase) {
    case 'group-challenge':
      return 'question'
    case 'group-scores':
      return 'scores'
    case 'moving':
    case 'movement-summary':
      return 'board'
    case 'individual-challenge':
      return 'gate'
    case 'final-challenge':
      return 'final'
    default:
      return 'idle'
  }
}

/**
 * Watchability order for the auto-director: pawns walking are the payoff
 * moment, the final gauntlet is the drama, gates are stakes, thinking is
 * quieter, and post-race states trail. Ties go to whoever is furthest along
 * the board — the race leader is the story.
 */
const DIRECTOR_PRIORITY: PlayerPhase[] = [
  'moving',
  'final-challenge',
  'individual-challenge',
  'group-challenge',
  'group-scores',
  'movement-summary',
  'tutorial',
  'victory',
]

export const pickDirectorTarget = (players: Player[]): Player | undefined => {
  const rank = (player: Player) => {
    const index = DIRECTOR_PRIORITY.indexOf(player.phase)
    return index === -1 ? DIRECTOR_PRIORITY.length : index
  }

  return players
    .filter(player => player.phase !== 'kicked')
    .sort((a, b) => rank(a) - rank(b) || b.currentPosition - a.currentPosition)[0]
}

/**
 * Shot classes for the director's cut decisions: phases in one class are the
 * SAME shot (a walk and its movement summary are one continuous board beat),
 * so the camera never re-cuts inside a class. Order is watchability, mirroring
 * DIRECTOR_PRIORITY's story logic.
 */
export const SHOT_CLASSES: PlayerPhase[][] = [
  ['moving', 'movement-summary'],
  ['final-challenge'],
  ['individual-challenge'],
  ['group-challenge'],
  ['group-scores'],
]

/** The dwell floor: even a better story waits this long before a cut. */
export const MIN_SHOT_MS = 8000
/** A subject who fell idle keeps the camera briefly so their moment lands. */
export const IDLE_CUT_GRACE_MS = 1500
/** How long a spectator's manual 3D-camera grab suppresses the follow-cam. */
export const GRAB_HOLD_MS = 8000

export interface DirectorShot {
  targetId: string
  classIndex: number
  /** When the camera cut to this subject — NOT when their phase changed. */
  at: number
}

const shotClassIndex = (phase: PlayerPhase): number => {
  const index = SHOT_CLASSES.findIndex(shotClass => shotClass.includes(phase))
  return index === -1 ? SHOT_CLASSES.length : index
}

/**
 * The shot-memory layer over pickDirectorTarget. Pure so the cut rules are
 * testable: snapshots land every ~500ms during walks, and a memoryless
 * re-sort re-cut the camera on every one — the booth's flicker. Rules:
 * a vanished subject cuts immediately; the same subject never cuts (phase
 * changes swap the stage under a held camera); a candidate in the SAME class
 * never steals the shot; a strictly better class waits out the dwell floor;
 * an idle subject is abandoned after a short grace.
 */
export const nextDirectorShot = (
  previous: DirectorShot | undefined,
  players: Player[],
  now: number
): DirectorShot | undefined => {
  const best = pickDirectorTarget(players)
  if (!best) return undefined
  const cut: DirectorShot = { targetId: best.id, classIndex: shotClassIndex(best.phase), at: now }

  const current = previous
    ? players.find(player => player.id === previous.targetId && player.phase !== 'kicked')
    : undefined
  if (!previous || !current) return cut

  const currentClass = shotClassIndex(current.phase)
  const held: DirectorShot = { targetId: current.id, classIndex: currentClass, at: previous.at }

  if (best.id === current.id) return held
  if (cut.classIndex === currentClass) return held
  if (currentClass === SHOT_CLASSES.length) {
    return now - previous.at >= IDLE_CUT_GRACE_MS ? cut : held
  }
  if (cut.classIndex < currentClass && now - previous.at >= MIN_SHOT_MS) return cut
  return held
}

/**
 * Whether the booth mounts each round kind as a REAL view (read-only) or
 * falls back to its SpectateStage card. Typed exhaustively over
 * RoundChallengeKind for the same reason as the dispatch's GROUP_VIEWS: a
 * new kind that forgets its entry here is a COMPILE error, not a booth that
 * silently degrades to a card. The three `false` entries are honest
 * impossibilities: the audio rounds need a local play tap (inert blocks it)
 * and sketch's canvas is local-only.
 */
const KIND_MOUNTABLE: Record<RoundChallengeKind, boolean> = {
  ranking: true,
  traversal: true,
  'border-chain': true,
  atlas: true,
  'heritage-hunt': true,
  'neighbour-blitz': true,
  silhouette: true,
  'anthem-buzz': false,
  'tongue-buzz': false,
  'hot-cold': true,
  sketch: false,
  'stat-detective': true,
  'two-truths': true,
  'river-run': true,
  'shared-shores': true,
  highlands: true,
  'name-that-water': true,
  'mother-tongue': true,
  'flag-palette': true,
  'capital-guess': true,
  'star-chart': true,
  parliament: true,
  flashpoint: true,
  composition: true,
  'ghost-state': true,
  'no-mans-land': true,
  'pin-landmark': true,
  'trend-race': true,
  timeline: true,
  empire: true,
  manhunt: true,
  'unique-or-bust': true,
  // Nothing local gates the board: the claims ride the snapshot, so the booth
  // watches the pool drain exactly as the racers do.
  'clean-sweep': true,
}

export const MOUNTABLE_KINDS: RoundChallengeKind[] = (
  Object.keys(KIND_MOUNTABLE) as RoundChallengeKind[]
).filter(kind => KIND_MOUNTABLE[kind])

/**
 * Every active racer is out of the answering window — the round's outcome is
 * public. The SpoilerVeil drops once this is true: before it, a followed
 * racer's early reveal would spoil the table for a glanced-at screen.
 */
export const roundSettled = (
  players: Player[],
  groupAnswers: Partial<Record<string, unknown>>
): boolean =>
  players
    .filter(player => player.phase !== 'kicked' && !player.completedAtRound)
    .every(player => player.phase !== 'group-challenge' || !!groupAnswers[player.id])

/**
 * A stage card's copy. `secret` is the spectator's dramatic irony — the
 * answer the racers are sweating over, safe to show because watchers hold no
 * pawn (and room snapshots carry the data regardless).
 */
export interface SpectateStory {
  /** Card eyebrow, e.g. "Silhouette round" / "Flag gate". */
  kicker: string
  /** The task as the racers see it, present tense. */
  prompt: string
  /** What the racers can't see — the answer, told to the audience. */
  secret?: string
  /** Choice flags the racer reasons over (flag options, a neighbour ring). The
   *  question itself, so rendered as a flag row even under spoiler-protection. */
  options?: ISOCountryCode[]
  /** Which option is the correct pick — marked only when spoilers are shown.
   *  May sit outside `options` (e.g. the country a border ring surrounds). */
  answer?: ISOCountryCode
  /** Countries the stage paints on the shared map. */
  focus?: ISOCountryCode[]
  /** Photo prompt when the round is image-driven. */
  image?: string
  /** Flag-palette hex swatches — the colours the racer names the flag from.
   *  The question, so shown regardless of spoiler state. */
  swatches?: string[]
  /** A short fact list shown verbatim (two-truths claims, the stat-detective
   *  dossier). The question, so shown regardless of spoiler state. */
  facts?: { label: string; value?: string }[]
  /** Draw this country's silhouette — the outline IS the question (the name is
   *  the answer), so it shows regardless of spoiler state. */
  outline?: ISOCountryCode
}

const listNames = (isoCodes: ISOCountryCode[], limit = 6): string => {
  const names = isoCodes.map(countryName)
  if (names.length <= limit) return names.join(', ')
  return `${names.slice(0, limit).join(', ')} +${names.length - limit} more`
}

/**
 * The surviving story cards: the three kinds the booth cannot mount honestly
 * (audio rounds need a local play tap, sketch's canvas is local-only) plus
 * the between-rounds beat. Every other kind mounts its REAL view read-only —
 * see MOUNTABLE_KINDS and the booth's dispatch.
 */
export const roundStory = (challenge: RoundChallenge | undefined): SpectateStory => {
  if (!challenge) return { kicker: 'Between rounds', prompt: 'The next round is being dealt…' }

  switch (roundChallengeKind(challenge)) {
    case 'anthem-buzz': {
      if (!('country' in challenge)) break
      return {
        kicker: 'Opening ceremony',
        prompt: 'An anthem is playing — first to name the country takes the round',
        secret: `It's ${countryName(challenge.country as ISOCountryCode)} — who knows the tune?`,
        focus: [challenge.country as ISOCountryCode],
      }
    }
    case 'tongue-buzz': {
      if (!('language' in challenge) || !('countries' in challenge)) break
      return {
        kicker: 'Mother tongue',
        prompt: 'Someone is speaking — name a country where that language is official',
        secret: `${challenge.language} — any of ${challenge.countries.length} countries counts: ${listNames(challenge.countries)}`,
        focus: challenge.countries,
      }
    }
    case 'sketch': {
      if (!('country' in challenge)) break
      return {
        kicker: 'Sketch',
        prompt: `Draw ${countryName(challenge.country as ISOCountryCode)} from memory`,
        focus: [challenge.country as ISOCountryCode],
      }
    }
  }

  return { kicker: 'Group round', prompt: 'The racers are answering…' }
}
