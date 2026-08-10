import type { EmpireChallenge } from '~~/types/challenges/group-modes.type'
import { isFameDealable, type Fame } from '~~/types/fame.types'
import type { GameDifficulty } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'
import { clampScore, jaccardFraction } from './scoring'
import { editDistance, normalizeAnswer } from './strings'

/**
 * Ghosts of Empires — tuning and pure scoring, shared by the dealer, the
 * server scorer and the view so the pot split can never drift between ends
 * of the wire. Nothing here imports the generated geometry.
 */

export const EMPIRE_TUNING: {
  [difficulty in GameDifficulty]: {
    /** Beat 1: the animated sweep plus the buzz window. */
    nameSeconds: number
    /** Beat 2: tapping the modern countries inside the peak extent. */
    tapSeconds: number
    /** Keyframes the sweep animates through (endpoints and peak always kept)
     *  — fewer frames tell less of the shape's story. */
    keyframes: number
    /** Name options offered in beat 1; 0 = free pick from the full register. */
    optionCount: number
    /**
     * Deal weight per recognisability tier — the mode's difficulty dial. A 0
     * benches the tier entirely, and the zeroes MUST agree with the shared
     * `FAME_BY_DIFFICULTY` gate (pinned in empires.test) so "dealable at
     * normal" means the same thing here as it does for a Timeline card.
     * Above zero the weights only LEAN: hard tips toward the deep cuts while
     * keeping an icon floor, so Rome still turns up at a hard table.
     */
    fameWeights: { [fame in Fame]: number }
  }
} = {
  easy: {
    nameSeconds: 32,
    tapSeconds: 40,
    keyframes: 7,
    optionCount: 3,
    fameWeights: { major: 1, minor: 0, obscure: 0 },
  },
  normal: {
    nameSeconds: 28,
    tapSeconds: 35,
    keyframes: 6,
    optionCount: 3,
    fameWeights: { major: 1, minor: 0.5, obscure: 0 },
  },
  hard: {
    nameSeconds: 24,
    tapSeconds: 30,
    keyframes: 5,
    optionCount: 0,
    fameWeights: { major: 0.25, minor: 0.6, obscure: 1 },
  },
}

/** The one weight lookup — a tier the difficulty may not deal weighs nothing,
 *  whatever the table says. Dealer and linter both rank through it. */
export const empireFameWeight = (fame: Fame, difficulty: GameDifficulty): number =>
  isFameDealable(fame, difficulty) ? EMPIRE_TUNING[difficulty].fameWeights[fame] : 0

/**
 * The round's pot, split across the beats. Naming the ghost pays the smaller
 * share: one fact, all-or-nothing behind the buzz curve. Knowing what it held
 * is where the teaching lives, and the Jaccard's granularity rewards partial
 * knowledge — it takes the larger share.
 */
export const empirePots = (maximumPoints: number): { name: number; extent: number } => {
  const name = Math.round(maximumPoints * 0.4)
  return { name, extent: maximumPoints - name }
}

/**
 * Evenly subsample `years` down to `count`, always keeping the first frame,
 * the last frame and the peak — drop either end and the story loses its rise
 * or its dissolution; drop the peak and beat 2 has no frame to freeze on.
 */
export const subsampleKeyframes = (years: number[], count: number, peakYear: number): number[] => {
  if (years.length <= count) return [...years]
  const keep = new Set<number>([0, years.length - 1, Math.max(0, years.indexOf(peakYear))])
  // Fill remaining slots at even spacing, skipping indices already kept.
  const step = (years.length - 1) / (count - 1)
  for (let slot = 1; slot < count - 1 && keep.size < count; slot++) {
    let index = Math.round(slot * step)
    while (keep.has(index) && index < years.length - 1) index++
    keep.add(index)
  }
  return [...keep].sort((a, b) => a - b).map(index => years[index])
}

/**
 * Beat 2: Jaccard overlap of taps against the core members — the
 * scoreNoMansLand shape. Partial holdings are forgiven before the math:
 * tapping one neither pays nor costs (they were excluded from play and are
 * confessed only at the reveal).
 */
export const scoreEmpireExtent = ({
  challenge,
  taps,
  maximumPoints,
}: {
  challenge: Pick<EmpireChallenge, 'members' | 'partialMembers'>
  taps: ISOCountryCode[]
  maximumPoints: number
}): { scored: number; maximum: number } => {
  const truth = new Set(challenge.members)
  const partial = new Set(challenge.partialMembers)
  const guess = new Set(taps.filter(tap => !partial.has(tap)))
  return {
    scored: clampScore(maximumPoints * jaccardFraction(guess, truth), maximumPoints),
    maximum: maximumPoints,
  }
}

/**
 * "the Ottoman Empire" but plain "Gran Colombia" — the definite article
 * belongs on generic-noun names (Empire, Union, Caliphate…), not on proper
 * names. One place, so headlines, verdicts and spectate copy agree.
 */
export const empireDisplayName = (name: string): string =>
  /(empire|caliphate|union|kingdom|dynasty|commonwealth|reich|horde|sultanate|monarchy|republic|alliance|state|caliphates)$/i.test(
    name
  )
    ? `the ${name}`
    : name

/** Normalize a typed answer for the name match: case-, diacritic- and
 *  punctuation-insensitive, leading article dropped. */
export const normalizeEmpireAnswer = (value: string): string => normalizeAnswer(value)

/** Polity-type words that carry no identity — "Abbasid" IS the Abbasid
 *  Caliphate; "Union of Soviet Socialist Republics" is the Soviet Union. */
const GENERIC_WORDS = new Set([
  'empire',
  'caliphate',
  'dynasty',
  'kingdom',
  'union',
  'sultanate',
  'khanate',
  'republic',
  'republics',
  'state',
  'states',
  'commonwealth',
  'monarchy',
  'of',
  'the',
])

const coreWords = (value: string): string =>
  value
    .split(' ')
    .filter(word => !GENERIC_WORDS.has(word))
    .join(' ')

/** Small-typo equality: exact for short strings, 1 edit from 5 chars, 2 from 10. */
const closeEnough = (a: string, b: string): boolean => {
  if (a === b) return true
  const shortest = Math.min(a.length, b.length)
  if (shortest < 5) return false
  return editDistance(a, b) <= (shortest >= 10 ? 2 : 1)
}

/**
 * The forgiving name match: "USSR", "CCCP", "the soviet union", "Union of
 * Soviet Socialist Republics" and a one-letter typo all land. Checks the
 * name and every alias, verbatim and with polity-type words stripped —
 * strict enough that "Mughal" never buys "Mongol".
 */
export const empireAnswerMatches = (
  guess: string,
  empire: { name: string; answerAliases?: string[] }
): boolean => {
  const typed = normalizeEmpireAnswer(guess)
  if (!typed) return false
  const candidates = [empire.name, ...(empire.answerAliases ?? [])].map(normalizeEmpireAnswer)
  if (candidates.some(candidate => closeEnough(typed, candidate))) return true
  const typedCore = coreWords(typed)
  if (!typedCore) return false
  return candidates.some(candidate => {
    const core = coreWords(candidate)
    return Boolean(core) && closeEnough(typedCore, core)
  })
}
