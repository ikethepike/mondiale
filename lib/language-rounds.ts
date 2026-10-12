/**
 * The board scope of the two language rounds — the one place they work out
 * which board they are asking about, and what that means for a guess.
 *
 * A regional board deals only the speakers standing on it, so "Who speaks
 * French?" on a Europe board means five countries, not thirty. The dealer
 * stamps that scope onto the challenge; everything a player reads (the
 * interstitial, the prompt, the scorecard) and the off-board veto resolve it
 * through here, so the question asked and the recap printed can never drift.
 *
 * Mother Tongue (type the whole set) and Tongue Buzz (buzz any one of it) sit
 * here together because they ask the SAME question of the same data and got
 * different answers for a while: Mother Tongue graded official languages while
 * Tongues graded spoken ones, under copy that promised "official" in both.
 * Both now deal and grade `boardSpeakers`, so the two rounds can only ever
 * mean the same thing by "speaks".
 */
import { COUNTRIES } from '~~/data/countries.gen'
import { ISOCountryCodes } from '~~/data/iso-codes.gen'
import { SPEAKERS } from '~~/data/speakers.gen'
import type {
  MotherTongueChallenge,
  TongueBuzzChallenge,
} from '~~/types/challenges/group-modes.type'
import type { Game } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'
import type { SpeakerRow } from '~~/types/speakers.types'
import { countryName } from './country'
import { formatProseNumber } from './number'
import { isChallengeOfType } from './rounds'
import { boardLabel } from './variant'

/** Either language round: both name a language and carry a board-scoped set. */
type LanguageRound = Pick<
  MotherTongueChallenge | TongueBuzzChallenge,
  '_type' | 'language' | 'scope'
> & {
  countries: ISOCountryCode[]
}

/** Signed, not spoken — no "Who speaks X?" question may name one. */
export const isSignLanguage = (language: string): boolean => /\bsign language$/i.test(language)

/** The share of a country a language needs before a round may require it there. */
export const SPEAKER_SHARE_THRESHOLD = 10

/** Or the head count, where a share undersells a huge country: India's 2.8%
 *  Punjabi is more speakers than most countries have people. */
export const SPEAKER_HEADCOUNT_FLOOR = 20_000_000

/** What the sourced table holds on this language in this country, if anything. */
export const speakerRow = (isoCode: ISOCountryCode, language: string): SpeakerRow | undefined =>
  isSignLanguage(language) ? undefined : SPEAKERS[isoCode]?.[language]

/**
 * Does the row put the language past the threshold as one of the country's own?
 * A usage figure alone (Sweden's English) never qualifies — the round asks for
 * a mother tongue, not a school subject. A national statute no source sizes
 * still counts: the source not measuring it is not nobody speaking it.
 */
const qualifies = (isoCode: ISOCountryCode, row: SpeakerRow): boolean => {
  if (!row.named) return false
  if (row.share === undefined) return row.official === 'national'
  const population = COUNTRIES[isoCode]?.people.population?.amount ?? 0
  return (
    row.share >= SPEAKER_SHARE_THRESHOLD ||
    (row.share / 100) * population >= SPEAKER_HEADCOUNT_FLOOR
  )
}

const spokenCache = new Map<ISOCountryCode, Set<string>>()

/**
 * Every language a country speaks, national statutes first and then by share —
 * the one derivation everything else here is built from.
 *
 * Read from `SPEAKERS` (`data/speakers.gen.ts`), so Ukraine's Russian and
 * Switzerland's Italian count while Burundi's English (official, 0.05% speak
 * it), Austria's Burgenland Croatian and Sweden's second-language English do not.
 */
export const spokenLanguages = (isoCode: ISOCountryCode): Set<string> => {
  const cached = spokenCache.get(isoCode)
  if (cached) return cached
  const rank = (row: SpeakerRow) => (row.official === 'national' ? 1000 : 0) + (row.share ?? 0)
  const spoken = new Set(
    Object.entries(SPEAKERS[isoCode] ?? {})
      .filter(([language, row]) => !isSignLanguage(language) && qualifies(isoCode, row))
      .sort(([, a], [, b]) => rank(b) - rank(a))
      .map(([language]) => language)
  )
  spokenCache.set(isoCode, spoken)
  return spoken
}

/** Does this country speak the language at all? The rounds ask "Who speaks
 *  Russian?", so this is the whole question they grade. */
export const speaksLanguage = (isoCode: ISOCountryCode, language: string): boolean =>
  spokenLanguages(isoCode).has(language)

/** The languages a country makes official nationwide, in the order its source
 *  lists them (Burundi leads with Kirundi). What a clue claiming officiality reads. */
export const officialLanguages = (isoCode: ISOCountryCode): string[] =>
  Object.entries(SPEAKERS[isoCode] ?? {})
    .filter(([language, row]) => !isSignLanguage(language) && row.official === 'national')
    .map(([language]) => language)

/** Over half a country speaks it: the share past which a language is that
 *  country's language, not merely one of them. */
export const MAJORITY_SHARE = 50

/**
 * A language a question may name on its own: spoken in two or more countries,
 * or by most of one. Fiji Hindi, Sindhi and Oromo are real, but "Name a
 * country that speaks Oromo" tests nothing a player could have learned.
 */
export const isHeadlineLanguage = (
  language: string,
  speakers: readonly ISOCountryCode[]
): boolean =>
  speakers.length >= 2 ||
  speakers.some(isoCode => (speakerRow(isoCode, language)?.share ?? 0) > MAJORITY_SHARE)

/**
 * The board's languages, each with the countries standing on it that speak
 * them — the ONE index both dealers deal from. A round's answer set, the copy
 * that counts it and the off-board veto all resolve through `spokenLanguages`,
 * so a country can never be dealt by one rule and graded by another.
 */
export const boardSpeakers = (pool: readonly ISOCountryCode[]): Map<string, ISOCountryCode[]> => {
  const speakers = new Map<string, ISOCountryCode[]>()
  for (const isoCode of pool) {
    for (const language of spokenLanguages(isoCode)) {
      speakers.set(language, [...(speakers.get(language) ?? []), isoCode])
    }
  }
  return speakers
}

let worldIndex: Map<string, ISOCountryCode[]> | undefined

/** `boardSpeakers` over every country, built once. */
export const worldSpeakers = (): Map<string, ISOCountryCode[]> =>
  (worldIndex ??= boardSpeakers(ISOCountryCodes))

/** How many board countries a Mother Tongue answer set may hold: one is a
 *  lookup, and past 32 (English on a world board) the round is a typing test. */
export const MOTHER_TONGUE_SPEAKERS = { min: 2, max: 32 } as const

/** The round's clock: four seconds an answer on a base, capped where typing tires. */
export const motherTongueSeconds = (count: number): number => Math.min(90, 20 + 4 * count)

/**
 * The languages Mother Tongue may ask on this pool, each with its answer set —
 * the ones this game hasn't asked yet, unless it has asked them all.
 */
export const motherTongueDeck = (
  pool: readonly ISOCountryCode[],
  asked: ReadonlySet<string>
): [string, ISOCountryCode[]][] => {
  const viable = [...boardSpeakers(pool)].filter(
    ([, countries]) =>
      countries.length >= MOTHER_TONGUE_SPEAKERS.min &&
      countries.length <= MOTHER_TONGUE_SPEAKERS.max
  )
  const fresh = viable.filter(([language]) => !asked.has(language))
  return fresh.length ? fresh : viable
}

/** The board in words, ready to follow a question: "in Europe and Africa", "in the world". */
export const motherTongueScope = (challenge: Pick<LanguageRound, 'scope'>): string =>
  `in ${boardLabel(challenge.scope ?? [])}`

/**
 * "Who speaks French in Europe?" — the prompt and the interstitial title.
 * A world board keeps the plain question: it was never scoped, and saying so
 * would only add words to the one case that never needed them.
 */
export const motherTongueQuestion = (
  challenge: Pick<MotherTongueChallenge, 'language' | 'scope'>
): string =>
  challenge.scope
    ? `Who speaks ${challenge.language} ${motherTongueScope(challenge)}?`
    : `Who speaks ${challenge.language}?`

/** The interstitial's stakes line — the count is only ever the board's. */
export const motherTongueStakes = (
  challenge: Pick<MotherTongueChallenge, 'language' | 'scope' | 'countries' | 'durationSeconds'>
): string => {
  // Only a regional board needs its bounds spelled out — on a world board the
  // count already means every country there is.
  const where = challenge.scope ? ` ${motherTongueScope(challenge)}` : ''
  return `${challenge.countries.length} countries${where} speak ${challenge.language} — name as many as you can in ${challenge.durationSeconds} seconds. Wrong guesses cost points.`
}

/**
 * Tongue Buzz's sub-line: what counts as a right answer, bounded by the board.
 * "Any country where it's spoken counts" is a promise the round can only keep
 * on a world board.
 */
export const tongueBuzzRule = (challenge: Pick<LanguageRound, 'scope'>): string =>
  challenge.scope
    ? `Any country ${motherTongueScope(challenge)} where it's spoken counts`
    : "Any country where it's spoken counts"

/** Tongue Buzz's reveal line: "Spoken in 5 countries in Europe". */
export const tongueBuzzTally = (challenge: Pick<LanguageRound, 'scope' | 'countries'>): string => {
  const count = challenge.countries.length
  const where = challenge.scope ? ` ${motherTongueScope(challenge)}` : ''
  return `Spoken in ${count} ${count === 1 ? 'country' : 'countries'}${where}`
}

/**
 * Does this country speak the language but stand off the board?
 *
 * Such a guess is RIGHT about the world and wrong only about the round, so it
 * is vetoed rather than scored: a veto costs nothing and never reaches the
 * submitted list. Terra Incognita refuses the same hook on purpose, because
 * there a free bounce would leak that a country is about to vanish — here it
 * leaks nothing, since the board has been fixed and visible all game.
 */
export const speaksButOffBoard = (
  challenge: LanguageRound | undefined,
  isoCode: ISOCountryCode
): boolean => {
  if (!challenge?.scope) return false
  if (challenge.countries.includes(isoCode)) return false
  // The same predicate the board was dealt with, so the veto is exactly "this
  // speaker is standing somewhere else" — never a second opinion on who speaks.
  return speaksLanguage(isoCode, challenge.language)
}

/** May a single-answer question accept this country for the language? Every
 *  speaker, plus any sourced row below the bar — accepted, never required. */
export const acceptsSpeaker = (isoCode: ISOCountryCode, language: string): boolean => {
  if (speaksLanguage(isoCode, language)) return true
  const row = speakerRow(isoCode, language)
  // A usage figure alone is schooling: "speaks English" must not take Germany.
  return !!row?.official || !!row?.named
}

/**
 * Why a guess outside the answer set bounces free:
 *   - `off-board`: a speaker standing somewhere this board doesn't reach
 *   - `statute`: official, nationally or in one region, but spoken below the bar
 *   - `minority`: the country's own sources name it, but too few speak it
 *   - `second-language`: widely used, as Sweden's English, but no one's own
 */
export type LanguageBounce = 'off-board' | 'statute' | 'minority' | 'second-language'

/**
 * Why a guess outside the answer set bounces free instead of costing a point.
 * The ONE predicate both language rounds' views and the server's grading read,
 * so a bounced guess is never charged.
 */
export const languageBounce = (
  challenge: LanguageRound | undefined,
  isoCode: ISOCountryCode
): LanguageBounce | undefined => {
  if (!challenge || challenge.countries.includes(isoCode)) return undefined
  // Off the board, or benched from it (a micro-nation on a world board).
  if (speaksLanguage(isoCode, challenge.language)) return 'off-board'
  const row = speakerRow(isoCode, challenge.language)
  if (!row) return undefined
  if (row.official) return 'statute'
  // Tongue Buzz keeps its language secret, and a free "second language" or
  // "minority" bounce would let a player probe it without spending a lockout.
  if (challenge._type === 'tongue-buzz-challenge') return undefined
  return row.named ? 'minority' : 'second-language'
}

const fewSpeakIt = (share: number | undefined): string => {
  if (share === undefined) return 'no source counts how many speak it'
  return share < 1 ? 'under 1% speak it' : `only ${formatProseNumber(share, 1)}% speak it`
}

/**
 * The line a bounced guess shows, from the same row that bounced it. `spoken`
 * is how the line names the language — Tongue Buzz says "it", because there
 * the language is the secret.
 */
export const languageBounceLine = (
  challenge: LanguageRound | undefined,
  isoCode: ISOCountryCode,
  spoken: string = challenge?.language ?? ''
): string | undefined => {
  const bounce = languageBounce(challenge, isoCode)
  if (!challenge || !bounce) return undefined
  const name = countryName(isoCode)
  const share = speakerRow(isoCode, challenge.language)?.share
  const few = fewSpeakIt(share)
  switch (bounce) {
    case 'off-board':
      return challenge.scope
        ? `${name} does speak ${spoken} — but this round is ${motherTongueScope(challenge)}`
        : `${name} does speak ${spoken} — but it isn't in play this game`
    case 'statute':
      return speakerRow(isoCode, challenge.language)?.official === 'regional'
        ? `${name} makes ${spoken} official only regionally — not counted`
        : `${name} makes ${spoken} official, but ${few} — not counted`
    case 'minority':
      return `${name} has ${spoken} speakers, but ${few} — not counted`
    case 'second-language':
      return `${name} speaks ${spoken} mostly as a second language — not counted`
  }
}

/** The languages this game's Mother Tongue and Tongue Buzz rounds have already asked about. */
export const languagesAsked = (game: Pick<Game, 'rounds'>): Set<string> =>
  new Set(
    game.rounds.flatMap(({ groupChallenge }) =>
      isChallengeOfType(groupChallenge, 'mother-tongue-challenge') ||
      isChallengeOfType(groupChallenge, 'tongue-buzz-challenge')
        ? [groupChallenge.language]
        : []
    )
  )
