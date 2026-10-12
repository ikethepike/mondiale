/**
 * The Factbook's language prose → the official languages it names, the
 * languages it names at all, and the first-language share it gives each — plus
 * the CLDR code folds. The pure half of `generators/vendors/cldr/create-speakers.ts`,
 * here so tests can load it.
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
 * languages"; the source simply doesn't say. The speaker generator falls back
 * to `countries-list` for those, which is why this returns an empty array
 * rather than guessing.
 */
import { languages } from 'countries-list'

/** Buckets that are not a language, and the trailing "(2019 est.)" tail. */
const NOT_A_LANGUAGE =
  /^(other|unspecified|none|unknown|indigenous|declining|more than one|over \d|less than|note\b|data\b|\d)/i

/** Collective buckets: real languages, but named as a group rather than one
 *  the player could ever type ("13 minority languages", "Khoe languages"). */
const A_GROUP_NOT_A_LANGUAGE = /\b(languages|dialects|tongues)$/i

/** Any parenthetical that calls the segment official — "(official)",
 *  "(official, least spoken)", "(Castilian; official)", "(de jure official)",
 *  and Kyrgyzstan's "(state language)". */
const OFFICIAL_MARK = /\([^)]*\b(?:official|state language)\b[^)]*\)/i
const OFFICIAL_MARK_ALL = /\([^)]*\b(?:official|state language)\b[^)]*\)/gi

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

// Innermost-first, so nested dialect lists (Algeria's "Tamazight (official)
// (dialects include Kabyle (Taqbaylit), …)") leave no orphaned bracket behind.
const withoutParentheticals = (segment: string): string =>
  segment
    .replace(/\(([^()]*)\)/g, ' ')
    .replace(/\(([^()]*)\)/g, ' ')
    .replace(/\(([^()]*)\)/g, ' ')

/** The language a segment names, shorn of parentheticals, shares and tails. */
const segmentName = (segment: string): string =>
  withoutParentheticals(segment)
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
 * Source spellings (Factbook and countries-list) → the spelling the rest of the game already uses.
 *
 * This maps TOWARDS the existing names even where the Factbook's are better
 * ("Rwandi" is really Kinyarwanda, "Cambodian" is Khmer): four tables key off
 * `Country.languages` by exact string — TONGUES, SCRIPTORIUM_POOL,
 * LANGUAGE_LOCALES and TONGUE_FACTS — so a rename here silently unhooks audio
 * clips and answer sets. Correcting the spellings themselves means moving all
 * four together, which is its own job.
 */
export const LANGUAGE_ALIASES: { [sourceName: string]: string } = {
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
  siSwati: 'Swati',
  Ndebele: 'South Ndebele',
  Xhosa: 'Xhosa',
  Zulu: 'Zulu',
  Tigrigna: 'Tigrinya',
  iTaukei: 'Fijian',
  Aranese: 'Occitan',
  // countries-list's own name for ISO 639-1 "so": the country, not the language.
  Somalia: 'Somali',
  Azeri: 'Azerbaijani',
  Castilian: 'Spanish',
  // countries-list's names for ISO 639-1 "pa" and "or": no table keyed them
  // before, so the current spellings break none.
  'Panjabi / Punjabi': 'Punjabi',
  Oriya: 'Odia',
  Bokmal: 'Norwegian',
  'Bokmal Norwegian': 'Norwegian',
  'Nynorsk Norwegian': 'Norwegian',
  'Norwegian Bokmål': 'Norwegian',
  'Norwegian Nynorsk': 'Norwegian',
  Māori: 'Maori',
  'West Frisian': 'Frisian',
  'Western Frisian': 'Frisian',
  Tongan: 'Tonga',
  Nauru: 'Nauruan',
  Tuvalu: 'Tuvaluan',
  Fula: 'Peul',
  Rundi: 'Kirundi',
  Nyanja: 'Chichewa',
  'Haitian Creole': 'Haitian',
  Tagalog: 'Tagalog / Filipino',
  'Raeto Romance': 'Romansh',
  // Fiji's official Hindustani; the game asks one "Hindi".
  'Fiji Hindi': 'Hindi',
  // countries-list's name for ISO 639-1 "ng"; Namibians call it Oshiwambo.
  Ndonga: 'Oshiwambo',
  // Only Haiti's entry says a bare official "Creole"; Seychelles and the rest
  // name theirs. `Haitian` is the spelling already in the dataset.
  Creole: 'Haitian',
}

/** Names the source yields that no player could type as a language: a family
 *  ("Khoe") or a Zanzibari name for a language already listed ("Kiunguja"). */
const NOT_TYPEABLE = new Set(['Khoe', 'Khoisan', 'Kiunguja'])

/** Where one source name means a different language by country: Zimbabwe's
 *  "Ndebele" is Northern Ndebele, while South Africa's is Southern. */
const LANGUAGE_BY_COUNTRY: { [isoCode: string]: { [name: string]: string } } = {
  ZW: { 'South Ndebele': 'North Ndebele' },
}

/** A game-spelled name, corrected for the country it was read in. */
export const countryLanguage = (isoCode: string, language: string): string =>
  LANGUAGE_BY_COUNTRY[isoCode]?.[language] ?? language

/** A parsed name in the spelling the rest of the game uses. */
export const canonicalLanguage = (name: string): string => LANGUAGE_ALIASES[name] ?? name

/**
 * A segment's own name in the game's spelling, or undefined when it names a
 * bucket rather than a language anyone could type.
 */
const typeableLanguage = (segment: string): string | undefined => {
  let name = segmentName(segment)
  // "Tamazight languages" is Tamazight; "Khoe languages" and "13 minority
  // languages" are buckets with no single name to type.
  if (A_GROUP_NOT_A_LANGUAGE.test(name)) {
    const head = name.replace(A_GROUP_NOT_A_LANGUAGE, '').trim()
    if (!head || head.split(/\s+/).length > 1) return undefined
    name = head
  }
  if (!name || NOT_A_LANGUAGE.test(name) || NOT_TYPEABLE.has(name)) return undefined
  return canonicalLanguage(name)
}

/** "(official in Burgenland)", "(official regional working language)",
 *  "(official, only in municipalities where Italian nationals reside)",
 *  "(official, but locally used)". */
const REGIONAL_MARK = /\bofficial\s+in\b|\bregional\b|\bonly\s+in\b|\blocally\b/i

/** Each official the text names, with whether its officiality is only regional. */
const officialEntries = (text: string | undefined): { language: string; regional: boolean }[] => {
  if (!text) return []
  const found: { language: string; regional: boolean }[] = []

  for (const segment of splitLanguageSegments(text)) {
    // A bucket like "other (includes … Portuguese (official) …)" is not itself
    // official, but it can hide officials inside. Recurse before rejecting it.
    const nested = segment.match(/\(\s*includes\s+([\s\S]*)\)\s*[\d.,%<>\s]*$/i)?.[1]
    if (nested) {
      found.push(...officialEntries(nested))
      continue
    }

    if (!OFFICIAL_MARK.test(segment)) continue

    // "Spanish (official) and Guarani (official)" is one segment naming two
    // languages — Paraguay is co-official, and dropping Guarani would be the
    // same class of error this whole pass exists to fix.
    const marks = segment.match(OFFICIAL_MARK_ALL)
    const parts = marks && marks.length > 1 ? segment.split(/\s+and\s+/i) : [segment]

    for (const part of parts) {
      const mark = part.match(OFFICIAL_MARK)?.[0]
      if (!mark) continue
      const language = typeableLanguage(part)
      if (language) found.push({ language, regional: REGIONAL_MARK.test(mark) })
    }
  }

  return found
}

/**
 * Every language the text marks official, in the order the source lists them
 * — that order is meaningful (Burundi leads with Kirundi, not French).
 * Empty when the source marks none.
 */
export const officialLanguages = (text: string | undefined): string[] => [
  ...new Set(officialEntries(text).map(({ language }) => language)),
]

/**
 * The officials whose status is only regional — Croatian in Burgenland,
 * Frisian in Fryslân, Italian in Slovenia's coastal municipalities. A subset of
 * `officialLanguages`, flagged so "speaks" can tell a statute for one province
 * from a language the country speaks.
 */
export const regionalOfficialLanguages = (text: string | undefined): string[] => {
  const entries = officialEntries(text)
  const national = new Set(
    entries.filter(({ regional }) => !regional).map(({ language }) => language)
  )
  return [
    ...new Set(
      entries
        .filter(({ regional, language }) => regional && !national.has(language))
        .map(({ language }) => language)
    ),
  ]
}

/**
 * Past this the shares are a can-speak survey, not a first-language census —
 * Hungary's "English 25.3%, German 12.6%" is schooling, not a community.
 */
const FIRST_LANGUAGE_TALLY_MAX = 102

/** Names the prose uses for a different language than the game's own: Zambia's
 *  Tonga is not Tongan, and a bare "Creole" is Mauritian or Belizean as often
 *  as it is Haitian. */
const NOT_THE_SAME_LANGUAGE = new Set(['Creole', 'Tonga'])

/** Every ISO 639-1 language, in the game's spelling — the languages a share
 *  may add. The prose's long tail (Mossi, Bisaya, Oshiwambo) stays out. */
export const ISO_LANGUAGE_NAMES: ReadonlySet<string> = new Set(
  Object.values(languages).map(({ name }) => canonicalLanguage(name))
)

/** A segment's own share ("Russian 29.6%"), never one quoted inside its parentheticals. */
const segmentShare = (segment: string): number | undefined => {
  const share = withoutParentheticals(segment).match(/(\d[\d.,]*)\s*%/)?.[1]
  return share === undefined ? undefined : Number.parseFloat(share.replace(/,/g, ''))
}

/**
 * Each typeable ISO 639-1 language a first-language tally gives a share, with
 * that share. Empty for a can-speak survey and for the half of the corpus that
 * states no shares at all.
 */
export const firstLanguageShares = (
  text: string | undefined
): { language: string; share: number }[] => {
  if (!text) return []
  const segments = splitLanguageSegments(text).map(segment => ({
    segment,
    share: segmentShare(segment),
  }))
  const tally = segments.reduce((sum, { share }) => sum + (share ?? 0), 0)
  if (tally > FIRST_LANGUAGE_TALLY_MAX) return []

  const found = new Map<string, number>()
  for (const { segment, share } of segments) {
    if (share === undefined || NOT_THE_SAME_LANGUAGE.has(segmentName(segment))) continue
    const language = typeableLanguage(segment)
    if (language && ISO_LANGUAGE_NAMES.has(language) && !found.has(language)) {
      found.set(language, share)
    }
  }
  return [...found].map(([language, share]) => ({ language, share }))
}

/**
 * Every typeable ISO 639-1 language the prose names as the country's own, sized
 * or not — Nigeria's "Hausa, Yoruba, Igbo (Ibo)". A can-speak survey names
 * only its officials: Hungary's "English 25.3%" is schooling, not a community.
 */
export const namedLanguages = (text: string | undefined): string[] => {
  if (!text) return []
  const segments = splitLanguageSegments(text)
  const tally = segments.reduce((sum, segment) => sum + (segmentShare(segment) ?? 0), 0)
  const named = new Set(officialLanguages(text))
  if (tally > FIRST_LANGUAGE_TALLY_MAX) return [...named]
  for (const segment of segments) {
    if (NOT_THE_SAME_LANGUAGE.has(segmentName(segment))) continue
    const language = typeableLanguage(segment)
    if (language && ISO_LANGUAGE_NAMES.has(language)) named.add(language)
  }
  return [...named]
}

/**
 * CLDR codes for a variety the game names by its standard language: Maghrebi
 * and Levantine Arabic are "Arabic", Swiss German is "German", Cantonese and
 * Min Nan are "Chinese". CLDR files them apart, so the fold takes the larger
 * share rather than adding them — the same people answer both lines.
 */
export const CLDR_LANGUAGE_FOLDS: { [cldrCode: string]: string } = {
  aeb: 'ar',
  acm: 'ar',
  acy: 'ar',
  afb: 'ar',
  ajp: 'ar',
  apc: 'ar',
  apd: 'ar',
  arq: 'ar',
  ars: 'ar',
  ary: 'ar',
  arz: 'ar',
  ayl: 'ar',
  shu: 'ar',
  ssh: 'ar',
  gsw: 'de',
  yue: 'zh',
  nan: 'zh',
  hak: 'zh',
  wuu: 'zh',
  hsn: 'zh',
  gan: 'zh',
  // Lahnda ("Western Panjabi"); CLDR aliases pnb to it.
  lah: 'pa',
  pnb: 'pa',
  hif: 'hi',
  ckb: 'ku',
  kmr: 'ku',
  sdh: 'ku',
  fil: 'tl',
  nb: 'no',
  nn: 'no',
  prs: 'fa',
  qug: 'qu',
  // The Berber varieties the Factbook files under one "Tamazight".
  zgh: 'tzm',
  kab: 'tzm',
  shi: 'tzm',
  rif: 'tzm',
  // Kwanyama and Ndonga are the two written Oshiwambo standards.
  kj: 'ng',
  // Comorian's four island varieties.
  wni: 'zdj',
  swb: 'zdj',
}

/** CLDR's English names, where they differ from the game's own spelling for a
 *  language `countries-list` cannot carry (no ISO 639-1 code). */
const CLDR_NAMES: { [cldrCode: string]: string } = {
  crs: 'Seychellois Creole',
  tzm: 'Tamazight',
  zdj: 'Shikomoro',
}

/**
 * A CLDR language code (script and region subtags allowed) → the language in
 * the game's spelling: the `countries-list` name the rest of the dataset was
 * spelled from, else CLDR's English display name. Undefined for a code neither
 * can name.
 */
export const cldrLanguage = (
  code: string,
  displayNames: { [cldrCode: string]: string }
): string | undefined => {
  const base = code.split('_')[0]!
  const folded = CLDR_LANGUAGE_FOLDS[base] ?? base
  const name =
    CLDR_NAMES[folded] ??
    (languages as { [code: string]: { name: string } | undefined })[folded]?.name ??
    displayNames[folded]
  return name ? canonicalLanguage(name) : undefined
}
