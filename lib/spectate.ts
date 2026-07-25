import { HERITAGE } from '~~/data/heritage.gen'
import { LANDMARKS } from '~~/data/landmarks.gen'
import { RECOGNITION_TERRITORIES } from '~~/data/recognition.gen'
import { accessorTopicLabel, getChallengeDetails } from '~~/lib/challenges'
import { countryName } from '~~/lib/country'
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
      if (!('state' in challenge)) break
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
    case 'silhouette': {
      if (!('country' in challenge)) break
      return {
        kicker: 'Silhouette',
        prompt: 'First to name the mystery country from its silhouette takes the round',
        secret: `It's ${countryName(challenge.country as ISOCountryCode)} — will anyone see it?`,
        focus: [challenge.country as ISOCountryCode],
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
      if (!('country' in challenge)) break
      return {
        kicker: 'Stat detective',
        prompt: 'A dossier of numbers, one country — whose are they?',
        secret: `The dossier belongs to ${countryName(challenge.country as ISOCountryCode)}`,
        focus: [challenge.country as ISOCountryCode],
      }
    }
    case 'two-truths': {
      if (!('lieSource' in challenge)) break
      return {
        kicker: 'Two truths and a lie',
        prompt: `Three claims about ${countryName(challenge.country)} — spot the lie`,
        secret: `The lie was borrowed from ${countryName(challenge.lieSource)}`,
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
        prompt: 'Name the mystery sea, lake or river tracing itself onto the map',
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
        prompt: "Name the country from its flag's colour palette",
        secret: `Those colours fly for ${countryName(challenge.country as ISOCountryCode)}`,
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
        prompt: 'A century of conflict draws itself in — whose history is this?',
        secret: `${countryName(challenge.country as ISOCountryCode)}'s`,
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
        focus: challenge.options,
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
      return {
        kicker,
        prompt: 'Name the country as its border draws itself in',
        secret: `It's ${answer}`,
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
        prompt: `Find the ${item._type === 'max-challenge' ? 'highest' : 'lowest'} ${accessorTopicLabel(
          item.accessorId
        )} among the marked countries`,
        secret: `It's ${countryName(item.country)}`,
        focus: [...item.hints, item.country],
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
        prompt: `Every marked country is in the ${OrganizationVector[item.organization]} — except one`,
        secret: `The exception is ${countryName(item.exception)}`,
        focus: [item.exception],
      }
    case 'sunset-blitz-challenge':
      return {
        kicker,
        prompt: `Night sweeps east to west — name ${Math.round(item.quotaRatio * 100)}% of the window before dark`,
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
      return { kicker, prompt: `Find a country whose top exports include ${item.commodity}` }
    case 'city-nocturne-challenge':
      return {
        kicker,
        prompt: `Light up ${item.quota} of ${countryName(item.country)}'s biggest cities before the clock dies`,
        focus: [item.country],
      }
  }
}
