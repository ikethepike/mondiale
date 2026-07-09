import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { COUNTRIES } from '../data/countries.gen'
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
 * Images are saved one per code under public/currencies/ and converted to WebP
 * (cwebp) at the end. Existing files are kept unless --force is passed.
 *
 *   bun run generate:currencies [--force]
 */

const OUTPUT_DIRECTORY = 'public/currencies'
const CURRENCY_WIDTH = 640
const REVIEW_PATH = 'generators/data/currency-coin-review.txt'

export interface CurrencyEntry {
  /** Currency name (from Wikidata labels), e.g. "United States dollar". */
  name: string
  /** Public path of the banknote image, when one exists on Commons. */
  image?: string
}

export type CurrencyMapping = { [code: string]: CurrencyEntry }

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
const MANUAL_IMAGE: Record<string, string> = {}

const force = process.argv.includes('--force')

// The work list is the set of DISTINCT currency codes actually in use.
const codes = [
  ...new Set(
    Object.values(COUNTRIES)
      .map(country => country.currency)
      .filter((code): code is string => !!code)
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

  const file = MANUAL_IMAGE[code] ?? (qid ? photoFiles.get(qid) : undefined)
  if (!file) continue

  const dimensions = await fetchImageDimensions(file)
  const publicPath = await saveCommonsImage(file, `${OUTPUT_DIRECTORY}/${code}`, `/currencies/${code}`, {
    width: CURRENCY_WIDTH,
    force,
  })
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

// --- 4. Convert every saved image to WebP (cwebp) ---------------------------
console.log('Converting to WebP…')
let converted = 0
for (const code of Object.keys(mapping)) {
  const image = mapping[code].image
  if (!image || image.endsWith('.webp')) continue
  const source = `public${image}` // e.g. public/currencies/USD.jpg
  const target = `${OUTPUT_DIRECTORY}/${code}.webp`
  // cwebp can't read GIF — route animated/GIF sources through gif2webp.
  const result = source.endsWith('.gif')
    ? Bun.spawnSync(['gif2webp', '-q', '80', source, '-o', target])
    : Bun.spawnSync(['cwebp', '-q', '80', source, '-o', target])
  if (result.exitCode !== 0) {
    console.warn(`  cwebp failed for ${code}: ${result.stderr.toString().trim().slice(0, 120)}`)
    continue
  }
  rmSync(source, { force: true })
  mapping[code].image = `/currencies/${code}.webp`
  converted++
}
console.log(`Converted ${converted} images to WebP`)

// --- 5. Merge with previous run (fresh data wins, gaps keep old data) --------
for (const code of codes) {
  const merged = { ...previousMapping[code], ...mapping[code] }
  if (Object.keys(merged).length) mapping[code] = merged
}

writeFileSync(
  'data/currencies.gen.ts',
  `
      import type { CurrencyMapping } from '../generators/create-currencies-file'
      export const CURRENCIES: CurrencyMapping = ${JSON.stringify(mapping)}
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
