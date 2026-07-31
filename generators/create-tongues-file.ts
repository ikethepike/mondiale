import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { writeAudioClip } from './vendors/wikidata/commons'

/**
 * Builds the spoken-language clips for the Mother Tongue buzz round from
 * Mozilla Common Voice (CC0 — no attribution required).
 *
 * Mozilla's own download endpoint is account-gated (it answers 401 anonymously)
 * and ships whole-language archives measured in gigabytes — for three clips per
 * language, that is absurd. So this reads the SAME corpus through Hugging Face's
 * datasets-server, which serves individual rows and per-clip audio URLs over
 * plain HTTP: a few hundred KB fetched instead of tens of GB.
 *
 * Languages the mirror doesn't carry fall back to a local corpus if one has been
 * unpacked at generators/.cache/common-voice/<locale>/ (validated.tsv + clips/),
 * downloaded by hand from https://commonvoice.mozilla.org/datasets. Nothing
 * breaks without it — those languages simply don't deal until they have audio.
 *
 *   bun run generate:tongues [--force]
 */

const CORPUS_DIRECTORY = 'generators/.cache/common-voice'
const OUTPUT_DIRECTORY = 'public/tongues'

/** Ungated Common Voice 17 mirror: same rows, individually addressable. */
const MIRROR = 'fixie-ai/common_voice_17_0'
const ROWS_ENDPOINT = 'https://datasets-server.huggingface.co/rows'
/** Rows are scanned in pages until enough clips land in the length band. */
const PAGE_SIZE = 60
const MAX_PAGES = 6

/** Long enough to carry the sound of a language, short enough to buzz over. */
const MINIMUM_SECONDS = 3.5
const MAXIMUM_SECONDS = 9
/** Several takes per language so the same voice isn't the giveaway on a re-deal. */
const CLIPS_PER_LANGUAGE = 3

export interface TongueEntry {
  /** The Common Voice locale the clips came from, e.g. "sv-SE". */
  locale: string
  clips: { webm: string; m4a: string }[]
}

export type TongueMapping = { [language: string]: TongueEntry }

/**
 * Mondiale's language names (as `Country.languages` spells them) to Common
 * Voice locales. Only languages that BOTH appear on a country and exist in the
 * corpus can deal, so this map is the join between the two.
 */
export const LANGUAGE_LOCALES: { [language: string]: string } = {
  Afrikaans: 'af',
  Albanian: 'sq',
  Amharic: 'am',
  Arabic: 'ar',
  Armenian: 'hy-AM',
  Azerbaijani: 'az',
  Basque: 'eu',
  Belarusian: 'be',
  Bengali: 'bn',
  Bulgarian: 'bg',
  Catalan: 'ca',
  Chinese: 'zh-CN',
  Croatian: 'hr',
  Czech: 'cs',
  Danish: 'da',
  Dutch: 'nl',
  English: 'en',
  Estonian: 'et',
  Finnish: 'fi',
  French: 'fr',
  Georgian: 'ka',
  German: 'de',
  Greek: 'el',
  Hausa: 'ha',
  Hebrew: 'he',
  Hindi: 'hi',
  Hungarian: 'hu',
  Icelandic: 'is',
  Igbo: 'ig',
  Indonesian: 'id',
  Irish: 'ga-IE',
  Italian: 'it',
  Japanese: 'ja',
  Kazakh: 'kk',
  Kinyarwanda: 'rw',
  Korean: 'ko',
  Kyrgyz: 'ky',
  Latvian: 'lv',
  Lithuanian: 'lt',
  Macedonian: 'mk',
  Malay: 'ms',
  Maltese: 'mt',
  Marathi: 'mr',
  Mongolian: 'mn',
  Nepali: 'ne-NP',
  Norwegian: 'nn-NO',
  Persian: 'fa',
  Polish: 'pl',
  Portuguese: 'pt',
  Punjabi: 'pa-IN',
  Romanian: 'ro',
  Russian: 'ru',
  Serbian: 'sr',
  Slovak: 'sk',
  Slovene: 'sl',
  Somali: 'so',
  Spanish: 'es',
  Swahili: 'sw',
  Swedish: 'sv-SE',
  Tamil: 'ta',
  Telugu: 'te',
  Thai: 'th',
  Tigrinya: 'ti',
  Turkish: 'tr',
  Ukrainian: 'uk',
  Urdu: 'ur',
  Uzbek: 'uz',
  Vietnamese: 'vi',
  Welsh: 'cy',
  Yoruba: 'yo',
  Zulu: 'zu',
}

const force = process.argv.includes('--force')

let previousMapping: TongueMapping = {}
try {
  previousMapping = (await import('../data/tongues.gen')).TONGUES ?? {}
} catch {
  // First run — nothing to merge
}

interface Row {
  path: string
  clientId: string
  seconds: number
}

/** Read `validated.tsv`, keeping only rows inside the clip-length band. */
const readValidated = (localeDirectory: string): Row[] => {
  const tsvPath = `${localeDirectory}/validated.tsv`
  if (!existsSync(tsvPath)) return []

  const lines = readFileSync(tsvPath, 'utf8').split('\n')
  const header = lines[0]?.split('\t') ?? []
  const pathColumn = header.indexOf('path')
  const clientColumn = header.indexOf('client_id')
  // Newer corpora ship a duration column; older ones don't, and ffprobing
  // every clip would be far slower than simply accepting them.
  const durationColumn = header.indexOf('duration_ms')
  if (pathColumn < 0) return []

  const rows: Row[] = []
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue
    const columns = line.split('\t')
    const path = columns[pathColumn]
    if (!path) continue

    const milliseconds = durationColumn >= 0 ? Number(columns[durationColumn]) : NaN
    const seconds = Number.isFinite(milliseconds) ? milliseconds / 1000 : 0
    if (seconds && (seconds < MINIMUM_SECONDS || seconds > MAXIMUM_SECONDS)) continue

    rows.push({ path, clientId: columns[clientColumn] ?? '', seconds })
  }
  return rows
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

interface MirrorRow {
  row: {
    client_id?: string
    sentence?: string
    audio?: { src?: string }[] | { src?: string }
  }
}

/** A fetched clip: its bytes, plus who said it. */
interface RemoteClip {
  buffer: Buffer
  clientId: string
  seconds: number
}

const audioUrl = (row: MirrorRow['row']): string | undefined => {
  const audio = row.audio
  return Array.isArray(audio) ? audio[0]?.src : audio?.src
}

/**
 * Measure a downloaded clip. The mirror publishes no duration, and the length
 * band is the whole point — too short carries no language, too long is dead air
 * under a 20s buzz clock.
 *
 * Written to a temp file rather than piped: ffprobe cannot seek a pipe, so an
 * MP3 read from stdin reports `duration=N/A` and every clip silently scores 0.
 */
const clipSeconds = async (buffer: Buffer): Promise<number> => {
  const scratch = `${tmpdir()}/mondiale-tongue-${process.pid}-${probeCounter++}.mp3`
  try {
    writeFileSync(scratch, buffer)
    const probe = Bun.spawn(
      [
        ...['ffprobe', '-v', 'error'],
        ...['-show_entries', 'format=duration'],
        ...['-of', 'default=nw=1:nk=1'],
        scratch,
      ],
      { stdout: 'pipe', stderr: 'ignore' }
    )
    const seconds = Number((await new Response(probe.stdout).text()).trim())
    return Number.isFinite(seconds) ? seconds : 0
  } catch {
    return 0
  } finally {
    if (existsSync(scratch)) rmSync(scratch)
  }
}

let probeCounter = 0

/**
 * Page through the mirror until `wanted` clips land inside the length band,
 * preferring a different speaker each time — one voice across every clip makes
 * the round about that person rather than about the language.
 */
const fetchMirrorClips = async (locale: string, wanted: number): Promise<RemoteClip[]> => {
  const picked: RemoteClip[] = []
  const usedSpeakers = new Set<string>()

  for (let page = 0; page < MAX_PAGES && picked.length < wanted; page++) {
    const url =
      `${ROWS_ENDPOINT}?dataset=${encodeURIComponent(MIRROR)}&config=${encodeURIComponent(locale)}` +
      `&split=train&offset=${page * PAGE_SIZE}&length=${PAGE_SIZE}`
    // The mirror rate-limits hard (429) after a few dozen requests. Back off
    // and retry rather than silently returning nothing — an unhandled 429 is
    // indistinguishable from "this language has no clips", which is how a run
    // once reported 10 languages when it should have found 39.
    let response: Response | undefined
    for (let attempt = 1; attempt <= 5; attempt++) {
      response = await fetch(url).catch(() => undefined)
      if (response?.ok) break
      if (response?.status !== 429 && response) return picked

      const retryAfter = Number(response?.headers.get('retry-after'))
      await wait(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 5000 * attempt)
    }
    if (!response?.ok) {
      console.warn(`\n  rate-limited on ${locale} — stopping early with ${picked.length} clip(s)`)
      return picked
    }

    const body = (await response.json().catch(() => undefined)) as
      | { rows?: MirrorRow[] }
      | undefined
    const rows = body?.rows ?? []
    if (!rows.length) return picked

    for (const { row } of rows) {
      if (picked.length >= wanted) break
      const clientId = row.client_id ?? ''
      if (clientId && usedSpeakers.has(clientId)) continue

      const source = audioUrl(row)
      if (!source) continue

      const clip = await fetch(source).catch(() => undefined)
      if (!clip?.ok) continue

      const buffer = Buffer.from(await clip.arrayBuffer())
      const seconds = await clipSeconds(buffer)
      if (seconds < MINIMUM_SECONDS || seconds > MAXIMUM_SECONDS) continue

      usedSpeakers.add(clientId)
      picked.push({ buffer, clientId, seconds })
      await wait(120)
    }
  }
  return picked
}

/** Prefer distinct speakers: one voice across every clip of a language makes
 *  the round about that person rather than about the language. */
const pickDistinctSpeakers = (rows: Row[], wanted: number): Row[] => {
  const picked: Row[] = []
  const usedSpeakers = new Set<string>()
  for (const row of rows) {
    if (row.clientId && usedSpeakers.has(row.clientId)) continue
    usedSpeakers.add(row.clientId)
    picked.push(row)
    if (picked.length === wanted) break
  }
  // Fall back to repeats only if the language has too few contributors.
  for (const row of rows) {
    if (picked.length === wanted) break
    if (!picked.includes(row)) picked.push(row)
  }
  return picked
}

const availableLocales = existsSync(CORPUS_DIRECTORY)
  ? new Set(
      readdirSync(CORPUS_DIRECTORY, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
    )
  : new Set<string>()

mkdirSync(OUTPUT_DIRECTORY, { recursive: true })

/** The mirror indexes by base code ("sv"), Mondiale by full locale ("sv-SE"). */
const mirrorConfigs = await fetch(
  `https://datasets-server.huggingface.co/splits?dataset=${encodeURIComponent(MIRROR)}`
)
  .then(response => (response.ok ? response.json() : undefined))
  .then((body: { splits?: { config: string }[] } | undefined) =>
    new Set((body?.splits ?? []).map(split => split.config))
  )
  .catch(() => new Set<string>())

if (!mirrorConfigs.size) {
  console.warn('Could not reach the Common Voice mirror — falling back to any local corpus.')
}

const mapping: TongueMapping = {}
const skipped: string[] = []
const languages = Object.entries(LANGUAGE_LOCALES)
let index = 0

for (const [language, locale] of languages) {
  index++
  process.stdout.write(`\r  ${index}/${languages.length} ${language}          `)

  // Already fetched on an earlier run: keep it. The mirror rate-limits, so a
  // full sweep takes several passes — re-fetching what's on disk would burn
  // the quota re-doing solved work and never reach the tail of the alphabet.
  const previous = previousMapping[language]
  if (!force && previous?.clips.length) {
    const onDisk = previous.clips.every(clip =>
      existsSync(`${OUTPUT_DIRECTORY}/${clip.webm.split('/').pop()}`)
    )
    if (onDisk) {
      mapping[language] = previous
      continue
    }
  }

  const encoded: TongueEntry['clips'] = []

  // Preferred path: fetch a handful of rows straight from the mirror.
  const config = mirrorConfigs.has(locale) ? locale : locale.split('-')[0]
  if (mirrorConfigs.has(config)) {
    const clips = await fetchMirrorClips(config, CLIPS_PER_LANGUAGE)
    for (const [slot, clip] of clips.entries()) {
      const written = await writeAudioClip(
        clip.buffer,
        `${OUTPUT_DIRECTORY}/${locale}-${slot}`,
        `/tongues/${locale}-${slot}`,
        { seconds: MAXIMUM_SECONDS }
      )
      if (written) encoded.push(written)
    }
  }

  // Fallback: a hand-unpacked bundle for a language the mirror doesn't carry.
  if (!encoded.length && availableLocales.has(locale)) {
    const localeDirectory = `${CORPUS_DIRECTORY}/${locale}`
    const rows = pickDistinctSpeakers(readValidated(localeDirectory), CLIPS_PER_LANGUAGE)
    for (const [slot, row] of rows.entries()) {
      const source = `${localeDirectory}/clips/${row.path}`
      if (!existsSync(source)) continue
      const written = await writeAudioClip(
        readFileSync(source),
        `${OUTPUT_DIRECTORY}/${locale}-${slot}`,
        `/tongues/${locale}-${slot}`,
        { seconds: MAXIMUM_SECONDS }
      )
      if (written) encoded.push(written)
    }
  }

  if (encoded.length) mapping[language] = { locale, clips: encoded }
  else skipped.push(`${language} (${locale})`)
}

process.stdout.write('\r')

// Merge with the previous run so a corpus you removed from disk doesn't erase
// clips already shipped — the encoded files are still in public/.
for (const [language, entry] of Object.entries(previousMapping)) {
  if (!mapping[language] && !force) mapping[language] = entry
}

writeFileSync(
  'data/tongues.gen.ts',
  `
    import type { TongueMapping } from '../generators/create-tongues-file'

    export const TONGUES: TongueMapping = ${JSON.stringify(mapping)}
  `
)

console.log(`${Object.keys(mapping).length} languages have speech clips.`)
if (skipped.length) console.log(`  ${skipped.length} skipped (no local corpus): ${skipped.slice(0, 6).join(', ')}${skipped.length > 6 ? '…' : ''}`)
