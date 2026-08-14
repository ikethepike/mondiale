/**
 * The Factbook's language prose → the official languages it names.
 *
 * The pure half of the countries generator's language step, here rather than
 * beside it because `create-countries-file.ts` runs its whole fetch at import
 * and no test can load it.
 *
 * The source is one comma-separated sentence per country, and every shape it
 * takes is deliberate here rather than incidental:
 *
 *   Burundi     "Kirundi (official), French (official), English (official, least spoken)"
 *   Ecuador     "Spanish (Castilian; official) 98.6%"      ← marker is not first
 *   Switzerland "German (or Swiss German) (official) 62.1%" ← two parentheticals
 *   Vanuatu     "Bislama (official; creole) 14.5%"
 *   Eq. Guinea  "other (includes Fang, Bubi, Portuguese (official), …)" ← nested
 *
 * 21 of 194 countries carry no `(official)` marker at all — Japan, the UK,
 * India, Mexico among them. They are not "countries without official
 * languages"; the source simply doesn't say. Callers fall back to the spoken
 * list for those, which is why this returns an empty array rather than
 * guessing.
 */

/** Buckets that are not a language, and the trailing "(2019 est.)" tail. */
const NOT_A_LANGUAGE =
  /^(other|unspecified|none|unknown|indigenous|declining|more than one|over \d|less than|note\b|data\b|\d)/i

/** Collective buckets: real languages, but named as a group rather than one
 *  the player could ever type ("13 minority languages", "Khoe languages"). */
const A_GROUP_NOT_A_LANGUAGE = /\b(languages|dialects|tongues)$/i

/** Any parenthetical that calls the segment official — "(official)",
 *  "(official, least spoken)", "(Castilian; official)", "(de jure official)". */
const OFFICIAL_MARK = /\([^)]*\bofficial\b[^)]*\)/i
const OFFICIAL_MARK_ALL = /\([^)]*\bofficial\b[^)]*\)/gi

/**
 * Split on commas and semicolons at depth zero only — Equatorial Guinea's
 * officials live inside another country's parenthetical, and a naive split
 * would tear that list apart mid-phrase.
 */
export const splitLanguageSegments = (text: string): string[] => {
  const segments: string[] = []
  let depth = 0
  let current = ''
  for (const character of text) {
    if (character === '(') depth++
    else if (character === ')') depth = Math.max(0, depth - 1)
    if ((character === ',' || character === ';') && depth === 0) {
      segments.push(current)
      current = ''
      continue
    }
    current += character
  }
  segments.push(current)
  return segments.map(segment => segment.trim()).filter(Boolean)
}

/** The language a segment names, shorn of parentheticals, shares and tails. */
const segmentName = (segment: string): string =>
  segment
    // Drop parentheticals innermost-first, so nested dialect lists (Algeria's
    // "Tamazight (official) (dialects include Kabyle (Taqbaylit), …)") leave
    // no orphaned bracket behind.
    .replace(/\(([^()]*)\)/g, ' ')
    .replace(/\(([^()]*)\)/g, ' ')
    .replace(/\(([^()]*)\)/g, ' ')
    // An unbalanced tail is a truncated source string (Spain's "Aranese
    // (official" runs off the end) — everything from the bracket is noise.
    .replace(/[()].*$/, '')
    // A share ends the name, in digits ("German 62.1%", "French <0.1%") or in
    // words ("German (official) less than 1%").
    .replace(/\s*[<>]?\s*\d[\d.,]*\s*%.*$/, '')
    // A bare comparator with no percent sign is a truncated share ("Aranese <5"
    // — the source string ends mid-figure).
    .replace(/\s*[<>]\s*[\d.,]*\s*$/, '')
    .replace(/\s+(?:less|more|greater)\s+than\b.*$/i, '')
    // "English only", "Thai … only" — a qualifier on the share, not the name.
    .replace(/\bonly\b/gi, ' ')
    // "isiZulu or Zulu", "Kiswahili or Swahili" — the Factbook pairs endonym
    // with exonym. Keep the last form; it is the one the rest of the game
    // spells its languages by.
    .replace(/^.*\bor\b\s*/i, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s,;.]+$/, '')
    .trim()

/**
 * Factbook spellings → the spelling the rest of the game already uses.
 *
 * This maps TOWARDS the existing names even where the Factbook's are better
 * ("Rwandi" is really Kinyarwanda, "Cambodian" is Khmer): four tables key off
 * `Country.languages` by exact string — TONGUES, SCRIPTORIUM_POOL,
 * LANGUAGE_LOCALES and TONGUE_FACTS — so a rename here silently unhooks audio
 * clips and answer sets. Correcting the spellings themselves means moving all
 * four together, which is its own job.
 */
export const LANGUAGE_ALIASES: { [factbookName: string]: string } = {
  Bangla: 'Bengali',
  'Bahasa Indonesia': 'Indonesian',
  'Bahasa Malaysia': 'Malay',
  'Castilian Spanish': 'Spanish',
  Khmer: 'Cambodian',
  Kinyarwanda: 'Rwandi',
  Kiswahili: 'Swahili',
  'Swahili/Kiswahili': 'Swahili',
  Lao: 'Laotian',
  Mandarin: 'Chinese',
  'Standard Chinese': 'Chinese',
  'Moldovan/Romanian': 'Romanian',
  'Persian Farsi': 'Persian',
  'Afghan Persian': 'Persian',
  Dari: 'Persian',
  Sinhala: 'Sinhalese',
  Dhivehi: 'Divehi',
  Slovene: 'Slovenian',
  Sesotho: 'Southern Sotho',
  Sotho: 'Southern Sotho',
  Pedi: 'Northern Sotho',
  Tswana: 'Tswana',
  Venda: 'Venda',
  Tsonga: 'Tsonga',
  Swati: 'Swati',
  Ndebele: 'South Ndebele',
  Xhosa: 'Xhosa',
  Zulu: 'Zulu',
  Somali: 'Somalia',
  Bokmal: 'Norwegian',
  'Bokmal Norwegian': 'Norwegian',
  'Nynorsk Norwegian': 'Norwegian',
  // Only Haiti's entry says a bare official "Creole"; Seychelles and the rest
  // name theirs. `Haitian` is the spelling already in the dataset.
  Creole: 'Haitian',
}

/** Names the source yields that no player could type as a language: a family
 *  ("Khoe") or a Zanzibari name for a language already listed ("Kiunguja"). */
const NOT_TYPEABLE = new Set(['Khoe', 'Khoisan', 'Kiunguja'])

/** A parsed name in the spelling the rest of the game uses. */
export const canonicalLanguage = (name: string): string => LANGUAGE_ALIASES[name] ?? name

/**
 * Every language the text marks official, in the order the source lists them
 * — that order is meaningful (Burundi leads with Kirundi, not French).
 * Empty when the source marks none.
 */
export const officialLanguages = (text: string | undefined): string[] => {
  if (!text) return []
  const found: string[] = []

  for (const segment of splitLanguageSegments(text)) {
    // A bucket like "other (includes … Portuguese (official) …)" is not itself
    // official, but it can hide officials inside. Recurse before rejecting it.
    const nested = segment.match(/\(\s*includes\s+([\s\S]*)\)\s*[\d.,%<>\s]*$/i)?.[1]
    if (nested) {
      found.push(...officialLanguages(nested))
      continue
    }

    if (!OFFICIAL_MARK.test(segment)) continue

    // "Spanish (official) and Guarani (official)" is one segment naming two
    // languages — Paraguay is co-official, and dropping Guarani would be the
    // same class of error this whole pass exists to fix.
    const marks = segment.match(OFFICIAL_MARK_ALL)
    const parts = marks && marks.length > 1 ? segment.split(/\s+and\s+/i) : [segment]

    for (const part of parts) {
      if (!OFFICIAL_MARK.test(part)) continue
      let name = segmentName(part)
      // "Tamazight languages" is Tamazight; "Khoe languages" and "13 minority
      // languages" are buckets with no single name to type.
      if (A_GROUP_NOT_A_LANGUAGE.test(name)) {
        const head = name.replace(A_GROUP_NOT_A_LANGUAGE, '').trim()
        if (!head || head.split(/\s+/).length > 1) continue
        name = head
      }
      if (!name || NOT_A_LANGUAGE.test(name) || NOT_TYPEABLE.has(name)) continue
      found.push(canonicalLanguage(name))
    }
  }

  return [...new Set(found)]
}
