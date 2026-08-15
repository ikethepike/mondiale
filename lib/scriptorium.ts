import { COUNTRIES } from '~~/data/countries.gen'
import type { ISOCountryCode } from '~~/types/geography.types'
import { isValidISOCode } from '~~/types/geography.types'
import {
  HINT_UNLOCK_FIRST_ELAPSED,
  HINT_UNLOCK_LAST_ELAPSED,
  HINT_UNLOCK_SECOND_ELAPSED,
} from './scoring'
import { REGION_LABELS } from './variant'

/**
 * Scriptorium's pure logic: which languages the gate may deal, and which
 * countries count as a right answer. Both ends of the wire read this module —
 * the dealer, the submit handler's verdict and the reveal's chip list all
 * resolve the same pool and the same answer set, so they cannot drift.
 *
 * The written sample itself resolves through lib/tongue-samples (seeds or a
 * curated anthem lyric wall) — one home, shared with the Tongues round.
 */
export interface ScriptoriumEntry {
  /** Language name as it appears in `Country.languages` AND as a
   *  `TONGUES`/seed key, so the sample lookup and the answer set share it. */
  language: string
  /**
   * The script family, for the dealer's decoy rule and as the reveal's
   * fallback label. A lyric-derived sample carries its own (more precise)
   * script name — the reveal prefers that when it resolves.
   */
  script: string
  /** BCP-47 tag for the `lang` attribute — browsers pick fonts from it. */
  code: string
}

/**
 * Languages whose writing alone narrows the world: a resolvable written
 * sample, a script that is not the Latin alphabet, and at least one country
 * that lists the language as official. Pruned by lib/scriptorium.test.ts —
 * every entry must resolve a sample and a non-empty answer set.
 */
export const SCRIPTORIUM_POOL: ScriptoriumEntry[] = [
  { language: 'Arabic', script: 'Arabic script', code: 'ar' },
  { language: 'Russian', script: 'Cyrillic script', code: 'ru' },
  { language: 'Bulgarian', script: 'Cyrillic script', code: 'bg' },
  { language: 'Ukrainian', script: 'Cyrillic script', code: 'uk' },
  { language: 'Macedonian', script: 'Cyrillic script', code: 'mk' },
  // Kazakh is out: a lyric wall exists but no TONGUES locale routes to it.
  { language: 'Kyrgyz', script: 'Cyrillic script', code: 'ky' },
  { language: 'Tajik', script: 'Cyrillic script', code: 'tg' },
  { language: 'Mongolian', script: 'Cyrillic script', code: 'mn' },
  { language: 'Korean', script: 'Hangul', code: 'ko' },
  { language: 'Chinese', script: 'Chinese characters', code: 'zh' },
  { language: 'Japanese', script: 'Japanese kanji and kana', code: 'ja' },
  { language: 'Georgian', script: 'Georgian script', code: 'ka' },
  { language: 'Amharic', script: 'Geʽez script', code: 'am' },
  { language: 'Tigrinya', script: 'Geʽez script', code: 'ti' },
  { language: 'Thai', script: 'Thai script', code: 'th' },
  { language: 'Laotian', script: 'Lao script', code: 'lo' },
  { language: 'Cambodian', script: 'Khmer script', code: 'km' },
  { language: 'Burmese', script: 'Burmese script', code: 'my' },
  { language: 'Hindi', script: 'Devanagari', code: 'hi' },
  { language: 'Nepali', script: 'Devanagari', code: 'ne' },
  { language: 'Bengali', script: 'Bengali script', code: 'bn' },
  { language: 'Tamil', script: 'Tamil script', code: 'ta' },
  { language: 'Sinhalese', script: 'Sinhala script', code: 'si' },
  { language: 'Divehi', script: 'Thaana', code: 'dv' },
  { language: 'Dzongkha', script: 'Tibetan script', code: 'dz' },
  { language: 'Hebrew', script: 'Hebrew script', code: 'he' },
  { language: 'Greek', script: 'Greek alphabet', code: 'el' },
  { language: 'Persian', script: 'Perso-Arabic script', code: 'fa' },
  { language: 'Pashto', script: 'Perso-Arabic script', code: 'ps' },
  { language: 'Urdu', script: 'Perso-Arabic script', code: 'ur' },
]

export const scriptoriumEntry = (language: string): ScriptoriumEntry | undefined =>
  SCRIPTORIUM_POOL.find(entry => entry.language === language)

/** Scripts that run right-to-left — the manuscript's `dir` and the direction
 *  its write-on wipe sweeps. Keyed by the pool's BCP-47 codes. */
const RTL_CODES = new Set(['ar', 'fa', 'ps', 'ur', 'he', 'dv'])
export const scriptoriumRtl = (language: string): boolean => {
  const entry = scriptoriumEntry(language)
  return !!entry && RTL_CODES.has(entry.code)
}

/**
 * Every country where the language is official — the verdict's answer set.
 * Deliberately unfiltered by playability: like the shared-currency carve-out,
 * a right answer is a right answer even off the current board.
 */
export const scriptoriumAnswers = (language: string): ISOCountryCode[] =>
  Object.keys(COUNTRIES)
    .filter(isValidISOCode)
    .filter(isoCode => COUNTRIES[isoCode].languages?.includes(language))

/**
 * The hint ladder, strongest rung LAST — the order is the descent, and the
 * descent is what prices it.
 *
 * The mode shipped with the region rung alone, and it is a WIDE opener — for
 * eighteen of the pool's thirty languages it says "Asia". That is fine as a
 * first step and hopeless as the only one: a player who could not read the
 * page had no second move at all, and the only progression left was to run
 * the clock out and forfeit the walk. The rungs below it are the answer to
 * that, not a sharper opener.
 */
export const SCRIPTORIUM_RUNGS = ['region', 'script', 'country'] as const
export type ScriptoriumRung = (typeof SCRIPTORIUM_RUNGS)[number]

/** Which wave opens each rung. Read from the shared unlock tokens so the
 *  ladder can never drift from the hint economy every other gate keeps. */
export const SCRIPTORIUM_RUNG_UNLOCK: { [rung in ScriptoriumRung]: number } = {
  region: HINT_UNLOCK_FIRST_ELAPSED,
  script: HINT_UNLOCK_SECOND_ELAPSED,
  country: HINT_UNLOCK_LAST_ELAPSED,
}

export interface ScriptoriumLadderState {
  /** How much of the clock is gone. */
  elapsedFraction: number
  /** Rungs the player has paid for — each bites `GATE_HINT_BITE_STEPS`. */
  bought: Iterable<ScriptoriumRung>
  /** Rungs the difficulty gives away (easy's region): shown, never charged. */
  free?: Iterable<ScriptoriumRung>
  /** Rungs with nothing to say for this language. Down by default, so a
   *  language that cannot phrase one can never jam the descent below it. */
  mute?: Iterable<ScriptoriumRung>
  /** The page never arrived — every wave counts as already broken, or the
   *  player is being asked to read nothing with no way to buy their way out. */
  blind?: boolean
  /** The gate has a verdict: the shop is shut. */
  resolved?: boolean
}

/**
 * What the shop shows right now: the rungs already down, and the ONE that is
 * on offer.
 *
 * At most one, always the topmost that is still up. Ungated, a player could
 * skip the two narrowing rungs and buy the naming one for a single bite — a
 * real leap for being handed the answer, and rungs one and two made pointless.
 * It also keeps the chip row to a single chip, so the shop never crowds the
 * manuscript off a phone's band.
 */
export const scriptoriumLadder = (
  state: ScriptoriumLadderState
): { shown: ScriptoriumRung[]; offered: ScriptoriumRung | undefined } => {
  const bought = new Set(state.bought)
  const free = new Set(state.free ?? [])
  const mute = new Set(state.mute ?? [])
  const down = (rung: ScriptoriumRung) => bought.has(rung) || free.has(rung) || mute.has(rung)

  const shown = SCRIPTORIUM_RUNGS.filter(rung => bought.has(rung) || free.has(rung))
  const next = SCRIPTORIUM_RUNGS.find(rung => !down(rung))
  const broken = !!next && (state.blind || state.elapsedFraction >= SCRIPTORIUM_RUNG_UNLOCK[next])
  return { shown, offered: state.resolved || !broken ? undefined : next }
}

/** The buyable hint: where the answer countries mostly live. */
export const scriptoriumRegionHint = (language: string): string | undefined => {
  const tally = new Map<string, number>()
  for (const isoCode of scriptoriumAnswers(language)) {
    const label = REGION_LABELS[COUNTRIES[isoCode].region]
    if (label) tally.set(label, (tally.get(label) ?? 0) + 1)
  }
  const [best] = [...tally.entries()].sort((a, b) => b[1] - a[1])
  return best?.[0]
}
