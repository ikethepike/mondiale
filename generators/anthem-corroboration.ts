import { COUNTRIES } from '../data/countries.gen'
import { ISOCountryCodes } from '../data/iso-codes.gen'

/**
 * The evidence rules for shipping an anthem recording — one home shared by
 * the generator (which applies them to Commons results) and the test suite
 * (which locks the shipped data against them). The suite MUST import these,
 * never re-type them: the two copies it once held had already drifted — the
 * test's UNUSABLE lacked `1st version` and its stopword list was a quarter of
 * this one, so it was quietly vouching with a weaker predicate. The
 * self-executing generator can't be imported without running it, which is why
 * this module exists apart.
 */

/**
 * MIDI is a synthesised transcription, not a recording — it sounds nothing
 * like the anthem a player would recognise, and a `.wav` rendered from one is
 * just as tinny, so the WORD matters as much as the extension. Historical and
 * politically superseded takes are excluded too: a "former" anthem is the
 * wrong answer to "whose anthem is this", and a Francoist-era recording is
 * not what should play in a party game.
 */
export const UNUSABLE =
  /\b(midi|former|historic(al)?|francoist|nazi|soviet|colonial|1st version)\b/i

/** Licences that need no named author. Everything else (CC BY, CC BY-SA) does. */
export const ATTRIBUTION_FREE = /public domain|^CC0|^PD/i

export const isPlayable = (file: string): boolean =>
  !/\.(mid|midi)$/i.test(file) && !UNUSABLE.test(file)

/** Words that carry no identifying weight — matching on these alone would let
 *  any anthem recording answer for any country. */
const STOPWORDS = new Set([
  'the',
  'of',
  'a',
  'an',
  'and',
  'or',
  'to',
  'is',
  'in',
  'our',
  'we',
  'you',
  'national',
  'anthem',
  'hymn',
  'march',
  'song',
  'state',
  'instrumental',
  'de',
  'la',
  'le',
  'les',
  'du',
  'des',
  'el',
  'nossa',
  'e',
])

/** Military/ceremonial bands record other countries' anthems constantly, and
 *  the credit names THEIR nation, not the anthem's. Strip the ensemble before
 *  asking whether a filename claims a different country. */
const PERFORMER_CREDIT =
  /\b(?:performed by |played by |by )?(?:the )?(?:u\.?s\.?|united states|royal|us)\s+(?:navy|army|air force|marine|marines|coast guard)\s+band\b|\b(?:navy|army|air force|marine)\s+band\b/gi

export const significantWords = (text: string): string[] =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(word => word.length > 2 && !STOPWORDS.has(word))

/** Match on stems so "Ukraine" corroborates "Ukrainian" and "Ukrainy" — the
 *  adjectival and native forms filenames actually use. */
export const stem = (word: string): string => word.slice(0, Math.max(4, word.length - 3))

/** Every country's name words, for the "names someone else" check below. */
const OTHER_COUNTRY_WORDS: string[] = [
  ...new Set(
    ISOCountryCodes.flatMap(code => significantWords(COUNTRIES[code]?.name.english ?? ''))
  ),
]

/**
 * Does this Commons file actually belong to this country?
 *
 * Search relevance alone is NOT evidence: querying an ISO code returns
 * whatever anthem recording ranks highest, which is how Afghanistan first
 * shipped the US Air Force Band playing the Star-Spangled Banner. A hit only
 * counts when its FILENAME independently corroborates the anthem's title or
 * the country's name — and never when it names some other country outright.
 */
export const corroborates = (file: string, anthem: string, country: string): boolean => {
  const haystack = significantWords(file)
  if (!haystack.length) return false

  const wanted = [...significantWords(anthem), ...significantWords(country)]
  if (!wanted.some(word => haystack.some(found => found.startsWith(stem(word))))) return false

  // "United States Navy Band - Mawtini" is a legitimate performance of Iraq's
  // anthem; "God Defend New Zealand" for Bosnia is not. Reject a file naming a
  // DIFFERENT country unless this country is named too — but ignore the words
  // belonging to a performing ensemble, which credit the band, not the anthem.
  const ours = new Set(significantWords(country))
  const performerless = significantWords(file.replace(PERFORMER_CREDIT, ' '))
  const foreign = OTHER_COUNTRY_WORDS.filter(
    word => performerless.includes(word) && !ours.has(word)
  )
  return foreign.length === 0
}
