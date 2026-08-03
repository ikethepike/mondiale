import { EMPIRES } from '~~/data/empires.gen'
import { empireDisplayName } from '~~/lib/empires'
import { HERITAGE } from '~~/data/heritage.gen'
import { LANDMARKS } from '~~/data/landmarks.gen'
import { RECOGNITION_TERRITORIES } from '~~/data/recognition.gen'
import { accessorTopicLabel, getChallengeDetails } from '~~/lib/challenges'
import { yearbookYear } from '~~/lib/challenges/final-challenge'
import { countryName } from '~~/lib/country'
import { formatAmount } from '~~/lib/number'
import { formatEventYear, timelineEvent } from '~~/lib/timeline'
import { politicalLeader } from '~~/lib/leaders'
import { processReplacements } from '~~/lib/values'
import { TREND_METRICS } from '~~/lib/trends'
import { REGION_LABELS } from '~~/lib/variant'
import { COUNTRIES } from '~~/data/countries.gen'
import type { FinalChallengeItem } from '~~/types/challenges/final-challenge.type'
import type {
  IndividualChallenge,
  IndividualChallengeVariant,
} from '~~/types/challenges/individual-challenge.type'
import {
  isGroupChallenge,
  isTraversalChallenge,
  roundChallengeKind,
  type RoundChallenge,
  type RoundChallengeKind,
} from '~~/types/challenges/traversal-challenge.type'
import { OrganizationVector } from '~~/types/organization.type'
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
 * Round kinds the booth mounts as REAL views (read-only) instead of story
 * cards — an allowlist, so an unverified new kind falls back to its
 * SpectateStage card rather than mounting untested. The three absentees are
 * honest impossibilities: the audio rounds need a local play tap (inert
 * blocks it) and sketch's canvas is local-only.
 */
export const MOUNTABLE_KINDS: RoundChallengeKind[] = [
  'ranking',
  'traversal',
  'border-chain',
  'heritage-hunt',
  'neighbour-blitz',
  'silhouette',
  'hot-cold',
  'stat-detective',
  'two-truths',
  'river-run',
  'shared-shores',
  'highlands',
  'name-that-water',
  'mother-tongue',
  'flag-palette',
  'capital-guess',
  'flashpoint',
  'ghost-state',
  'no-mans-land',
  'pin-landmark',
  'trend-race',
  'timeline',
  'empire',
  'manhunt',
  'unique-or-bust',
]

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

export const roundStory = (challenge: RoundChallenge | undefined): SpectateStory => {
  if (!challenge) return { kicker: 'Between rounds', prompt: 'The next round is being dealt…' }

  switch (roundChallengeKind(challenge)) {
    case 'ranking':
      return {
        kicker: 'Ranking round',
        prompt: isGroupChallenge(challenge)
          ? (getChallengeDetails(challenge.id)?.phrasing ?? 'Rank the dealt countries')
          : 'Rank the dealt countries',
      }
    case 'traversal': {
      if (!isTraversalChallenge(challenge)) break
      return {
        kicker: 'Border run',
        prompt: `Link ${countryName(challenge.start)} to ${countryName(challenge.target)} by land${
          challenge.corridor ? ` — ${challenge.corridor.name} members only` : ''
        }`,
        secret: `A shortest route: ${challenge.optimalPath.map(countryName).join(' → ')}`,
        focus: challenge.optimalPath,
      }
    }
    case 'border-chain': {
      if (!('state' in challenge) || !('chains' in challenge.state)) break
      const liveChain = challenge.state.chains[challenge.state.chains.length - 1] ?? []
      const head = liveChain[liveChain.length - 1]
      return {
        kicker: 'Border chain · sudden death',
        prompt: head
          ? `Extend the chain from ${countryName(head)} — ${liveChain.length} links and counting`
          : 'Chain unbroken borders, one country per turn',
        focus: liveChain,
      }
    }
    case 'unique-or-bust': {
      if (!('_type' in challenge) || challenge._type !== 'unique-or-bust-challenge') break
      const { state } = challenge
      const slots = challenge.categories.length * state.order.length
      const locked = Object.values(state.locked).reduce((sum, list) => sum + list.length, 0)
      // No `secret` here: like manhunt, the live answers never ride the
      // broadcast this story derives from — the booth's tension is watching
      // the blanks lock, not knowing who doomed whom.
      return {
        kicker: `Unique or Bust · letter ${challenge.letter}`,
        prompt: state.briefing
          ? 'The table is reading the rules — shared answers will cancel to zero'
          : `Fill the board with ${challenge.letter}-answers nobody else picks — ${locked} of ${slots} blanks locked`,
      }
    }
    case 'manhunt': {
      if (!('_type' in challenge) || challenge._type !== 'manhunt-challenge') break
      const { state } = challenge
      // Unlike every other mode, the true answer (the despot's position) is
      // NOT in the broadcast this story derives from — the trail lives in a
      // server-side blob until the round's outcome. The booth's dramatic irony
      // here is the shrinking candidate set, not the hideout itself.
      return {
        kicker: `The Despot · turn ${state.hop} of ${challenge.turnCount}`,
        prompt:
          state.beat === 'move'
            ? 'The despot is choosing their next hideout'
            : `The dragnet is closing — ${state.committed.length} of ${state.detectives.length} markers locked`,
        secret: state.candidates.length
          ? `The trail points to ${state.candidates.length} possible hideouts`
          : undefined,
        facts: state.clues.slice(-4).map(clue => ({ label: `Turn ${clue.hop}`, value: clue.text })),
        focus: state.candidates.length ? state.candidates : undefined,
      }
    }
    case 'timeline': {
      if (!('state' in challenge) || !('deck' in challenge.state)) break
      const { state } = challenge
      const drawn = state.deck[state.card]
      const event = drawn ? timelineEvent(drawn) : undefined
      return {
        kicker: `Timeline · card ${Math.min(state.card, state.deck.length - 1)} of ${
          state.deck.length - 1
        }`,
        prompt: event
          ? `Slot "${event.name}" into the growing timeline — ${state.placed.length} cards locked in`
          : 'Slot each event into the shared timeline, before-or-after only',
        secret: event ? `It belongs in ${formatEventYear(event.year)}` : undefined,
        image: event?.image,
        facts: state.placed.map(slug => ({
          label: timelineEvent(slug)?.name ?? slug,
          value: formatEventYear(timelineEvent(slug)?.year ?? 0),
        })),
        focus: event ? [event.country] : undefined,
      }
    }
    case 'heritage-hunt': {
      if (!('slugs' in challenge)) break
      const beat = challenge.state.beat
      const site = HERITAGE[challenge.slugs[beat] as keyof typeof HERITAGE]
      return {
        kicker: `Heritage hunt · ${beat + 1} of ${challenge.slugs.length}`,
        prompt: 'Pin the world heritage site from its photo',
        secret: site ? `It's ${site.name} (${countryName(site.country)})` : undefined,
        image: site?.image,
        focus: site ? [site.country] : undefined,
      }
    }
    case 'neighbour-blitz': {
      if (!('country' in challenge) || !('neighbours' in challenge)) break
      return {
        kicker: 'Neighbour blitz',
        prompt: `Name every neighbour of ${countryName(challenge.country)}`,
        secret: `${challenge.neighbours.length} to find: ${listNames(challenge.neighbours)}`,
        focus: [challenge.country, ...challenge.neighbours],
      }
    }
    case 'empire': {
      if (!('empireId' in challenge)) break
      const empire = EMPIRES[challenge.empireId]
      return {
        kicker: 'Ghosts of empires',
        prompt: 'A vanished power sweeps the map, year by year — name it, then trace what it held',
        ...(empire
          ? {
              secret: `It's ${empireDisplayName(empire.name)}, at its greatest extent in ${formatEventYear(challenge.peakYear)}`,
            }
          : {}),
        focus: challenge.members,
      }
    }
    case 'silhouette': {
      if (!('country' in challenge)) break
      return {
        kicker: 'Silhouette',
        prompt: 'First to name the mystery country from its silhouette takes the round',
        secret: `It's ${countryName(challenge.country as ISOCountryCode)} — will anyone see it?`,
        outline: challenge.country as ISOCountryCode,
        focus: [challenge.country as ISOCountryCode],
      }
    }
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
    case 'hot-cold': {
      if (!('country' in challenge)) break
      return {
        kicker: 'Hot & cold',
        prompt: 'Hunt the mystery country — every probe answers warmer or colder',
        secret: `The target is ${countryName(challenge.country as ISOCountryCode)}`,
        focus: [challenge.country as ISOCountryCode],
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
    case 'stat-detective': {
      if (!('clues' in challenge)) break
      return {
        kicker: 'Stat detective',
        prompt: 'One country fits this whole dossier — whose is it?',
        secret: `The dossier belongs to ${countryName(challenge.country)}`,
        facts: challenge.clues.map(clue => ({ label: accessorTopicLabel(clue) })),
        focus: [challenge.country],
      }
    }
    case 'two-truths': {
      if (!('statements' in challenge)) break
      return {
        kicker: 'Two truths and a lie',
        prompt: `Three claims about ${countryName(challenge.country)} — one is false`,
        secret: `The lie is the ${accessorTopicLabel(
          challenge.statements[challenge.lieIndex]?.accessorId ?? challenge.statements[0].accessorId
        )} claim — really ${countryName(challenge.lieSource)}'s`,
        facts: challenge.statements.map(statement => ({
          label: accessorTopicLabel(statement.accessorId),
          value: formatAmount(statement),
        })),
        focus: [challenge.country],
      }
    }
    case 'river-run':
    case 'shared-shores':
    case 'highlands': {
      if (!('featureName' in challenge) || !('countries' in challenge)) break
      return {
        kicker: 'Water & terrain blitz',
        prompt: `Name the countries touching the ${challenge.featureName}`,
        secret: `${challenge.countries.length} qualify: ${listNames(challenge.countries)}`,
        focus: challenge.countries,
      }
    }
    case 'name-that-water': {
      if (!('featureName' in challenge)) break
      return {
        kicker: 'Name that water',
        prompt: 'Name the mystery body of water',
        secret: `It's the ${challenge.featureName}`,
      }
    }
    case 'mother-tongue': {
      if (!('language' in challenge) || !('countries' in challenge)) break
      return {
        kicker: 'Mother tongue',
        prompt: `Where is ${challenge.language} an official language?`,
        secret: `${challenge.countries.length} countries: ${listNames(challenge.countries)}`,
        focus: challenge.countries,
      }
    }
    case 'flag-palette': {
      if (!('country' in challenge)) break
      return {
        kicker: 'Flag palette',
        prompt: "Name the country from its flag's colours",
        secret: `Those colours fly for ${countryName(challenge.country as ISOCountryCode)}`,
        swatches: 'swatches' in challenge ? challenge.swatches : undefined,
        focus: [challenge.country as ISOCountryCode],
      }
    }
    case 'capital-guess': {
      if (!('country' in challenge)) break
      return {
        kicker: 'Capital skyline',
        prompt: 'Name the country from its capital skyline',
        secret: `That skyline is ${countryName(challenge.country as ISOCountryCode)}'s capital`,
        image: 'image' in challenge ? challenge.image : undefined,
        focus: [challenge.country as ISOCountryCode],
      }
    }
    case 'flashpoint': {
      if (!('country' in challenge)) break
      return {
        kicker: 'Flashpoint',
        prompt: 'Name the country from a century of its conflict history',
        secret: `It's ${countryName(challenge.country as ISOCountryCode)}'s`,
        focus: [challenge.country as ISOCountryCode],
      }
    }
    case 'ghost-state': {
      if (!('territoryId' in challenge) || !('parent' in challenge)) break
      const territory = RECOGNITION_TERRITORIES[challenge.territoryId]?.name ?? 'A ghost state'
      return {
        kicker: 'Ghost state',
        prompt: `${territory} — place it on the map`,
        secret: `Claimed by ${countryName(challenge.parent)}`,
        focus: [challenge.parent],
      }
    }
    case 'no-mans-land': {
      if (!('claimants' in challenge)) break
      const territory = RECOGNITION_TERRITORIES[challenge.territoryId]?.name ?? "A no man's land"
      return {
        kicker: "No man's land",
        prompt: `${territory} — tap every country that claims it`,
        secret: challenge.claimants.length
          ? `${challenge.claimants.length} claimants: ${listNames(challenge.claimants)}`
          : 'Nobody claims it — the winning move is to tap nothing',
        focus: challenge.claimants,
      }
    }
    case 'pin-landmark': {
      if (!('slug' in challenge)) break
      const landmark = LANDMARKS[challenge.slug]
      return {
        kicker: 'Drop a pin',
        prompt: 'Pin the landmark from its photo — closest pin takes the points',
        secret: landmark
          ? `It's the ${landmark.name} (${countryName(landmark.country)})`
          : undefined,
        image: 'image' in challenge ? challenge.image : undefined,
        focus: landmark ? [landmark.country] : undefined,
      }
    }
    case 'trend-race': {
      if (!('standings' in challenge)) break
      return {
        kicker: 'Trend race',
        prompt: `Which has ${challenge.direction} the most since ${challenge.windowStartYear}: ${
          TREND_METRICS[challenge.metric]?.label ?? challenge.metric
        }?`,
        secret: `The steepest curve is ${countryName(challenge.standings[0])}`,
        options: challenge.options,
        answer: challenge.standings[0],
      }
    }
  }

  return { kicker: 'Group round', prompt: 'The racers are answering…' }
}

const GATE_VARIANT_LABELS: { [variant in IndividualChallengeVariant]: string } = {
  find: 'Find-the-country',
  'flag-pick': 'Flag',
  'flag-twins': 'Flag twins',
  'border-detective': 'Border detective',
  'money-match': 'Currency',
  'zoom-out': 'Zoom-out',
  'capital-match': 'Capital',
  'landmark-quiz': 'Landmark',
  'odd-one-out': 'Odd one out',
  'higher-lower': 'Higher-lower',
  'trend-duel': 'Trend duel',
  'trajectory-match': 'Trajectory',
  'leader-pick': 'Leader',
  'outline-reveal': 'Outline',
  'leader-portrait': 'Portrait',
}

export const gateStory = (challenge: IndividualChallenge): SpectateStory => {
  const variant = challenge.variant ?? 'find'
  const kicker = `${GATE_VARIANT_LABELS[variant] ?? 'Challenge'} gate`
  const answer = countryName(challenge.country)

  switch (variant) {
    // Flag gates name the country openly and ask the racer to pick its flag —
    // so the country is NOT a secret; the correct flag is. Render the choices
    // and mark the right one only when spoilers are shown.
    case 'flag-pick':
      return {
        kicker,
        prompt: `Which flag belongs to ${answer}?`,
        options: challenge.options,
        answer: challenge.country,
      }
    case 'flag-twins':
      return {
        kicker,
        prompt: `These look-alikes share the same colours — which is ${answer}?`,
        options: challenge.options,
        answer: challenge.country,
      }
    case 'leader-pick':
      return {
        kicker,
        prompt: 'Whose leader is named? Pick the country.',
        secret: `The answer is ${answer}`,
        options: challenge.options,
        answer: challenge.country,
      }
    case 'odd-one-out':
      return {
        kicker,
        prompt: `One of these doesn't belong — ${challenge.oddOneOut?.propertyLabel ?? 'find the impostor'}`,
        secret: `The odd one out is ${answer}`,
        options: challenge.oddOneOut?.countries,
        answer: challenge.country,
      }
    case 'higher-lower':
      return {
        kicker,
        prompt: `A streak of stat duels on ${accessorTopicLabel(
          challenge.higherLower?.accessorId ?? 'people.population'
        )} — one miss fails the gate`,
        focus: challenge.higherLower?.pairs.flatMap(pair => [pair.a, pair.b]),
      }
    case 'trend-duel':
      return {
        kicker,
        prompt: 'Which of the pair is trending the called way? A clean streak opens the gate.',
        focus: challenge.trendDuels?.flatMap(duel => [duel.a, duel.b]),
      }
    case 'border-detective':
      return {
        kicker,
        prompt: 'A ring of neighbours, an empty centre — name the country they surround',
        secret: `They surround ${answer}`,
        options: challenge.neighbours,
        focus: challenge.neighbours,
      }
    // Photo gates: the racer sees an image and picks a country — mirror the
    // photo, not the accessor phrasing (which would name the subject).
    case 'capital-match':
      return {
        kicker,
        prompt: "Name the country from its capital's skyline",
        secret: `That skyline is ${answer}'s capital`,
        image: challenge.image,
        options: challenge.options,
        answer: challenge.country,
      }
    case 'landmark-quiz':
      return {
        kicker,
        prompt: 'Which country is this landmark in?',
        secret: `It's in ${answer}`,
        image: challenge.image,
        options: challenge.options,
        answer: challenge.country,
      }
    case 'leader-portrait':
      return {
        kicker,
        prompt: 'Which country does this leader govern?',
        secret: `They govern ${answer}`,
        image: challenge.portrait?.image,
        options: challenge.options,
        answer: challenge.country,
      }
    case 'money-match':
      return {
        kicker,
        prompt: 'Match the currency to the country that spends it',
        secret: `It's ${answer}'s`,
        options: challenge.options,
        answer: challenge.country,
      }
    case 'trajectory-match':
      return {
        kicker,
        prompt: 'Whose trend line is this?',
        secret: `The chart is ${answer}'s`,
        options: challenge.trajectory?.options,
        answer: challenge.country,
      }
    // "Name the hidden country" gates: the country is NOT named to the racer —
    // it's the whole puzzle — so keep it in the (spoiler-gated) secret.
    case 'zoom-out':
      return {
        kicker,
        prompt: 'Name the country as the map eases out from a tight crop',
        secret: `It's ${answer}`,
        focus: [challenge.country],
      }
    case 'outline-reveal':
      // The racer names the country as its border draws in — mirror the shape
      // (the outline is the puzzle; the name stays the spoiler-gated secret).
      return {
        kicker,
        prompt: 'Name the country from its outline',
        secret: `It's ${answer}`,
        outline: challenge.country,
        focus: [challenge.country],
      }
    case 'find':
      // 'find' names the target openly; the answer is WHERE it is (the map
      // focus, spoiler-gated), so no separate secret line is needed.
      return {
        kicker,
        prompt: `Find ${answer} on the map`,
        focus: [challenge.country],
      }
    default: {
      // Accessor phrasings carry {leader}/{currency}-style tokens — fill them
      // from the answer country, exactly as the racer's own gate view does.
      const phrasing = getChallengeDetails(challenge.id)?.phrasing
      return {
        kicker,
        prompt: phrasing
          ? processReplacements(phrasing, challenge.country)
          : 'Beat the gate to pass',
        secret: `The answer is ${answer}`,
        focus: [challenge.country],
        image: challenge.image ?? challenge.portrait?.image,
      }
    }
  }
}

export const finalStory = (item: FinalChallengeItem | undefined): SpectateStory => {
  const kicker = 'Final gauntlet'
  if (!item) return { kicker, prompt: 'The next question is being dealt…' }

  switch (item._type) {
    case 'region-challenge':
      return {
        kicker,
        prompt: `Which region is ${countryName(item.country)} in?`,
        secret: REGION_LABELS[COUNTRIES[item.country].region],
        focus: [item.country],
      }
    case 'max-challenge':
    case 'min-challenge':
      return {
        kicker,
        prompt: `Which of these has the ${
          item._type === 'max-challenge' ? 'highest' : 'lowest'
        } ${accessorTopicLabel(item.accessorId)}?`,
        secret: `It's ${countryName(item.country)}`,
        options: [...item.hints, item.country],
        answer: item.country,
      }
    case 'leadership-challenge': {
      const leader = politicalLeader(item.country)
      return {
        kicker,
        prompt: leader ? `Which country does ${leader.name} lead?` : 'Name the leader’s country',
        secret: countryName(item.country),
        focus: [item.country],
      }
    }
    case 'language-challenge':
      return { kicker, prompt: `Find a country where ${item.language} is official` }
    case 'membership-challenge':
      return {
        kicker,
        prompt: `Spot the one country that is NOT in the ${OrganizationVector[item.organization]}`,
        secret: `The exception is ${countryName(item.exception)}`,
        focus: [item.exception],
      }
    case 'sunset-blitz-challenge':
      return {
        kicker,
        prompt: `Name ${Math.round(item.quotaRatio * 100)}% of the countries as night sweeps east to west`,
        focus: item.countries,
      }
    case 'scales-challenge':
      return {
        kicker,
        prompt: `Balance the scales against ${countryName(item.target)} on ${accessorTopicLabel(
          item.accessorId
        )} — ${item.maxPicks} picks, ±${Math.round(item.tolerance * 100)}%`,
        focus: [item.target],
      }
    case 'born-challenge':
      return {
        kicker,
        prompt: `Click ${item.quota} countries that gained independence after ${item.year} — one wrong pick ends the run`,
      }
    case 'made-challenge':
      return { kicker, prompt: `Find a top exporter of ${item.commodity}` }
    case 'city-nocturne-challenge':
      return {
        kicker,
        prompt: `Light up ${item.quota} of ${countryName(item.country)}'s biggest cities before the clock dies`,
        focus: [item.country],
      }
    case 'boundary-challenge':
      return {
        kicker,
        prompt: `Draw the erased ${countryName(item.countries[0])}–${countryName(item.countries[1])} border where it really runs`,
        focus: [...item.countries],
      }
    case 'endonym-challenge':
      return {
        kicker,
        prompt: `Countries by their own names — ${item.quota} of ${item.countries.length} endonyms must land`,
        focus: item.countries,
      }
    case 'yearbook-challenge': {
      const year = yearbookYear(item)
      return {
        kicker,
        prompt: `Headlines from one year assemble — dial it in, ±${item.tolerance} counts`,
        ...(year === undefined ? {} : { secret: `The year is ${formatEventYear(year)}` }),
      }
    }
  }
}
