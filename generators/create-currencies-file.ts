import { mkdirSync, writeFileSync } from 'node:fs'
import { COUNTRIES } from '../data/countries.gen'
import type { CurrencyCode, CurrencyMapping } from '../types/currency.type'
import {
  fetchImageDimensions,
  fetchJson,
  fetchPageImages,
  saveCommonsImage,
  wait,
} from './vendors/wikidata/commons'

/**
 * Pulls a representative BANKNOTE photo for each ISO 4217 currency from Wikimedia
 * Commons, for the Money Match "which country uses this currency?" challenge.
 * Currencies are found by their ISO 4217 code (Wikidata P498) — keyed by CODE,
 * not country, because a currency is shared (EUR spans 27 countries, XOF 8…).
 *
 * The one weak spot is sourcing: a currency item's representative image (P18 /
 * page_image_free) is often a COIN, symbol, or logo rather than a banknote. So
 * this auto-fetches everything as a baseline and writes a "coin review" report
 * (generators/data/currency-coin-review.txt) flagging the likely non-banknotes,
 * which are then hand-pinned via MANUAL_IMAGE. Curated picks survive re-runs
 * because the mapping merges with the previous run.
 *
 * Images are saved one per code under public/currencies/, re-encoded to WebP by
 * the shared save helpers. Existing images are NEVER overwritten unless
 * --redownload-images is passed: many were hand-placed from non-Commons
 * sources and cannot be re-fetched (see redownloadImages below).
 *
 *   bun run generate:currencies [--redownload-images]
 */

const OUTPUT_DIRECTORY = 'public/currencies'
/** Banknote scans; many Commons sources are small, so this is a ceiling. */
const CURRENCY_WIDTH = 1280
const REVIEW_PATH = 'generators/data/currency-coin-review.txt'


/**
 * Pin the Wikidata Q-id for codes where the P498 search is ambiguous — shared
 * union currencies resolve to multi-country monetary-union items.
 */
const MANUAL_QID: Record<string, string> = {
  EUR: 'Q4916',
}

/**
 * Force a specific Commons banknote filename for a code whose auto-picked image
 * (P18) is a coin/symbol. Populate this from the coin-review report, then re-run.
 * Filenames are Commons File: names WITHOUT the "File:" prefix.
 */
/** Hand-pinned COMMONS filenames, for codes whose auto-pick is a coin/logo. */
const MANUAL_IMAGE: Record<string, string> = {}

/**
 * Codes whose Wikidata auto-pick was reviewed and rejected — a coin, a symbol,
 * or a photo of notes strewn on the ground rather than a clean banknote. The
 * `looksLikeCoin` heuristic only writes a review report; it doesn't stop the
 * download, so without this the next run silently reinstates them.
 *
 * Remove a code from here once a real banknote is hand-placed for it.
 */
const REJECTED_AUTO_IMAGE = new Set([
  'BOB', // coin strip
  'IDR', // banknote sheet, but low-res
  'TOP', // single Tongan coin
  'UGX', // notes scattered on a log
])

/**
 * Many banknote images in public/currencies/ were placed by hand, from sources
 * that aren't on Commons — so there is nothing to re-fetch them from. `--force`
 * (which every other generator reads as "re-download everything") would
 * silently replace those with Wikidata's auto-pick, which for currencies is
 * frequently a coin or a logo rather than a note.
 *
 * Hence the deliberately awkward flag name: a re-run always refreshes names and
 * the review report, but only ever touches existing image bytes when you ask
 * for it by name — e.g. after raising CURRENCY_WIDTH.
 */
const redownloadImages = process.argv.includes('--redownload-images')

// The work list is the set of DISTINCT currency codes actually in use.
const codes = [
  ...new Set(
    Object.values(COUNTRIES)
      .map(country => country.currency)
      .filter((code): code is CurrencyCode => !!code)
  ),
].sort()

// How many countries use each code — drives coin-report ordering (fix the
// high-impact currencies first).
const countryCount: Record<string, number> = {}
for (const country of Object.values(COUNTRIES)) {
  if (country.currency) countryCount[country.currency] = (countryCount[country.currency] ?? 0) + 1
}

console.log(`${codes.length} distinct currency codes in the dataset`)

let previousMapping: CurrencyMapping = {}
try {
  previousMapping = (await import('../data/currencies.gen')).CURRENCIES ?? {}
} catch {
  // First run — nothing to merge
}

// --- 1. Code → Wikidata Q-id (P498 = ISO 4217 code) -------------------------
interface SearchResponse {
  query?: { search?: { title: string }[] }
}

console.log('Resolving currency Q-ids (P498)…')
const qidByCode = new Map<string, string>()
for (const code of codes) {
  const manual = MANUAL_QID[code]
  if (manual) {
    qidByCode.set(code, manual)
    continue
  }
  const search = await fetchJson<SearchResponse>(
    `https://www.wikidata.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      `haswbstatement:P498=${code}`
    )}&srnamespace=0&srlimit=1&format=json`
  )
  const qid = search?.query?.search?.[0]?.title
  if (qid) qidByCode.set(code, qid)
  process.stdout.write(`\r  ${qidByCode.size}/${codes.length}`)
  await wait(200)
}
console.log(`\n${qidByCode.size} currencies resolved to a Q-id`)

// --- 2. Q-ids → names (labels) + representative image filenames -------------
const qids = [...new Set(qidByCode.values())]
const names = new Map<string, string>()

interface LabelsResponse {
  entities?: { [id: string]: { labels?: { en?: { value: string } } } }
}
console.log(`Fetching ${qids.length} currency labels…`)
for (let index = 0; index < qids.length; index += 50) {
  const batch = qids.slice(index, index + 50)
  const data = await fetchJson<LabelsResponse>(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${batch.join('|')}&props=labels&languages=en&languagefallback=1&format=json`
  )
  for (const [id, entity] of Object.entries(data?.entities ?? {})) {
    if (entity.labels?.en?.value) names.set(id, entity.labels.en.value)
  }
  process.stdout.write(`\r  ${Math.min(index + 50, qids.length)}/${qids.length}`)
  await wait(200)
}
console.log('')

const photoFiles = await fetchPageImages(qids)

// --- 3. Assemble + download images ------------------------------------------
mkdirSync(OUTPUT_DIRECTORY, { recursive: true })
const mapping: CurrencyMapping = {}
type Review = { code: string; name: string; file: string; dimensions?: string }
const coinSuspects: Review[] = []
let done = 0
let failed = 0

/**
 * Flag an image that is likely NOT a banknote — a review list for hand-picking
 * replacement bills, so it errs toward the reliable signals rather than tagging
 * every note that happens to omit the word "banknote". Flag when the filename
 * explicitly names a coin/symbol, OR the image is square-ish (banknotes are wide
 * ~2:1; coins, symbols and "coins + notes" montages are closer to ~1:1).
 */
const looksLikeCoin = (file: string, dimensions?: { width: number; height: number }): boolean => {
  if (/coin|m[üu]nze|moneda|monnaie|symbol|\.svg$/i.test(file)) return true
  if (dimensions && dimensions.width / dimensions.height < 1.5) return true
  return false
}

for (const code of codes) {
  const qid = qidByCode.get(code)
  const name = qid ? names.get(qid) : undefined
  if (name && !/^Q\d+$/.test(name)) mapping[code] = { name }

  // A hand-pinned Commons file always wins; otherwise honour the rejection list.
  const file =
    MANUAL_IMAGE[code] ?? (qid && !REJECTED_AUTO_IMAGE.has(code) ? photoFiles.get(qid) : undefined)
  if (!file) continue

  const dimensions = await fetchImageDimensions(file)
  const publicPath = await saveCommonsImage(
    file,
    `${OUTPUT_DIRECTORY}/${code}`,
    `/currencies/${code}`,
    {
      width: CURRENCY_WIDTH,
      force: redownloadImages,
    }
  )
  if (!publicPath) {
    failed++
    continue
  }
  mapping[code] = { name: mapping[code]?.name ?? code, image: publicPath }
  done++

  // Skip the coin heuristic for codes we've already hand-pinned.
  if (!MANUAL_IMAGE[code] && looksLikeCoin(file, dimensions)) {
    coinSuspects.push({
      code,
      name: mapping[code]!.name,
      file,
      dimensions: dimensions ? `${dimensions.width}x${dimensions.height}` : '?',
    })
  }

  process.stdout.write(`\r  ${done + failed}/${codes.length} images`)
  await wait(250)
}
console.log(`\nImages: ${done} saved, ${failed} failed`)

// WebP conversion used to live here, shelling out to cwebp/gif2webp. Every save
// path now re-encodes through sharp (see vendors/wikidata/commons), so images
// arrive as WebP already — and this generator no longer needs those two
// Homebrew binaries on PATH.

// --- 4. Merge with previous run (fresh data wins, gaps keep old data) --------
for (const code of codes) {
  const merged = { ...previousMapping[code], ...mapping[code] }
  if (Object.keys(merged).length) mapping[code] = merged
}

writeFileSync(
  'data/currencies.gen.ts',
  `
      import type { CurrencyEntry, CurrencyMapping } from '~~/types/currency.type'
      const data = ${JSON.stringify(mapping)} satisfies CurrencyMapping
      export const CURRENCIES: { [code in keyof typeof data]: CurrencyEntry } = data
    `
)
console.log(`Wrote data/currencies.gen.ts (${Object.keys(mapping).length} currencies)`)

const withImage = Object.values(mapping).filter(entry => entry?.image).length
console.log(`${withImage} currencies have an image`)

// --- 6. Coin-review report (hand off for banknote replacements) --------------
coinSuspects.sort((a, b) => (countryCount[b.code] ?? 0) - (countryCount[a.code] ?? 0))
const reportLines = coinSuspects.map(
  suspect =>
    `${suspect.code}\t(${countryCount[suspect.code] ?? 0} countries)\t${suspect.name}\t${suspect.file}\t${suspect.dimensions}`
)
writeFileSync(
  REVIEW_PATH,
  `# Currencies whose auto-picked image is likely a COIN/symbol, not a banknote.\n` +
    `# Find a Commons banknote File: name for each and add it to MANUAL_IMAGE in\n` +
    `# generators/create-currencies-file.ts, then re-run. Sorted by country count.\n` +
    `# CODE\t(countries)\tname\tfilename\tWxH\n` +
    reportLines.join('\n') +
    '\n'
)
console.log(`\n${coinSuspects.length} likely coins/symbols flagged → ${REVIEW_PATH}`)
