import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import sharp from 'sharp'
import type { MediaCredit } from '../../../lib/attribution'
import { classifyLicence, type ExtMetadata, type ImageLicence } from '../../lib/licence'

/**
 * Shared Wikidata / Wikimedia Commons fetch helpers — one implementation of the
 * retry-with-backoff JSON fetch, the `page_image_free` batch lookup, and the
 * Commons image download+save, reused by the leaders / capitals / landmarks
 * generators. Extracted from create-leaders-file.ts (its original home).
 */

export const WIKIDATA_USER_AGENT =
  'mondiale-game-generator/1.0 (https://github.com/ikethepike/mondiale)'

export const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * How long a single request may hang before it counts as a failure and the
 * backoff takes over. Without this a socket that opens and then goes quiet
 * blocks forever: a long generator run was observed stalled at 0% CPU with 72
 * ESTABLISHED connections and no bytes moving, which no amount of retry logic
 * can rescue because the await never returns.
 */
const REQUEST_TIMEOUT_MS = 30_000

/** JSON fetch with Retry-After-aware backoff; undefined after repeated failure. */
export const fetchJson = async <T>(url: string, attempt = 1): Promise<T | undefined> => {
  const response = await fetch(url, {
    headers: { 'User-Agent': WIKIDATA_USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }).catch(() => undefined)

  if (!response?.ok) {
    if (attempt >= 6) {
      console.warn(
        `  request failed after ${attempt} tries (${response?.status ?? 'network'}): ${url.slice(0, 120)}`
      )
      return undefined
    }
    const retryAfter = Number(response?.headers.get('retry-after'))
    await wait(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2500 * attempt)
    return fetchJson(url, attempt + 1)
  }

  // Reading the BODY can fail too — a connection cut mid-response, or the
  // timeout landing between headers and the last byte, throws here rather than
  // at the fetch. Uncaught, that ends a 45-minute run with a bare DOMException,
  // so it re-enters the same backoff as any other failure.
  const parsed = await response.json().catch(() => undefined)
  if (parsed === undefined && attempt < 6) {
    await wait(2500 * attempt)
    return fetchJson(url, attempt + 1)
  }
  return parsed as T | undefined
}

interface PagePropsResponse {
  query?: {
    pages?: { [pageId: string]: { title?: string; pageprops?: { page_image_free?: string } } }
  }
}

/**
 * Batch-resolve each Wikidata item's representative Commons image filename via
 * the PageImages `page_image_free` prop (derived from P18, costs bytes not the
 * megabytes a full-claims fetch would). Returns a map of Q-id → filename.
 */
export const fetchPageImages = async (qids: string[]): Promise<Map<string, string>> => {
  const images = new Map<string, string>()
  for (let index = 0; index < qids.length; index += 50) {
    const batch = qids.slice(index, index + 50)
    const data = await fetchJson<PagePropsResponse>(
      `https://www.wikidata.org/w/api.php?action=query&prop=pageprops&ppprop=page_image_free&titles=${batch.join('|')}&format=json`
    )
    for (const page of Object.values(data?.query?.pages ?? {})) {
      if (page.title && page.pageprops?.page_image_free) {
        images.set(page.title, page.pageprops.page_image_free)
      }
    }
    await wait(200)
  }
  return images
}

interface SearchResponse {
  query?: { search?: { title: string }[] }
}

/**
 * Resolve a Wikidata Q-id from a name search. When `contextCountryQid` is given,
 * prefer the first hit whose P17 (country) matches — this disambiguates
 * collisions (multiple Georgetowns, San Josés) that a bare name search can't.
 */
export const resolveQidBySearch = async (
  name: string,
  options: { contextCountryQid?: string } = {}
): Promise<string | undefined> => {
  const search = await fetchJson<SearchResponse>(
    `https://www.wikidata.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      name
    )}&srnamespace=0&srlimit=5&format=json`
  )
  const hits = (search?.query?.search ?? []).map(result => result.title)
  if (!hits.length) return undefined
  if (!options.contextCountryQid) return hits[0]

  // Check each candidate's country (P17) until one matches the context.
  interface ClaimsResponse {
    entities?: {
      [id: string]: {
        claims?: { P17?: { mainsnak?: { datavalue?: { value?: { id?: string } } } }[] }
      }
    }
  }
  const data = await fetchJson<ClaimsResponse>(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${hits.join('|')}&props=claims&format=json`
  )
  for (const qid of hits) {
    const country = data?.entities?.[qid]?.claims?.P17?.[0]?.mainsnak?.datavalue?.value?.id
    if (country === options.contextCountryQid) return qid
  }
  return hits[0]
}

interface ImageInfoResponse {
  query?: {
    pages?: { [pageId: string]: { imageinfo?: { width?: number; height?: number }[] } }
  }
}

/**
 * The SOURCE pixel dimensions of a Commons file. Lets a generator reject
 * low-resolution images (a tiny original scaled up looks bad in a photo quiz).
 * Returns undefined if unknown.
 */
export const fetchImageDimensions = async (
  file: string
): Promise<{ width: number; height: number } | undefined> => {
  const data = await fetchJson<ImageInfoResponse>(
    `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(
      `File:${file}`
    )}&prop=imageinfo&iiprop=size&format=json`
  )
  const info = Object.values(data?.query?.pages ?? {})[0]?.imageinfo?.[0]
  if (info?.width && info?.height) return { width: info.width, height: info.height }
  return undefined
}

interface ExtMetadataResponse {
  query?: {
    pages?: {
      [pageId: string]: {
        imageinfo?: {
          extmetadata?: ExtMetadata
        }[]
      }
    }
  }
}

/** Strip the HTML Commons wraps around metadata values ("<a href=…>Name</a>"). */
const stripTags = (html: string): string =>
  html
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/** Longest credit line worth printing under an image. */
const CREDIT_MAX_CHARS = 80

/**
 * A too-long credit, cut to something printable without losing WHO made it.
 *
 * A bare source URL is unwrapped to its host, a multi-clause artist line keeps
 * its first clause, and anything still over the cap is trimmed on a word.
 */
const shortenCredit = (credit: string): string => {
  if (credit.length <= CREDIT_MAX_CHARS) return credit
  if (/^https?:\/\//i.test(credit)) {
    const host = credit.replace(/^https?:\/\//i, '').split('/')[0]
    return host ?? credit.slice(0, CREDIT_MAX_CHARS)
  }
  const firstClause = credit.split(/[;,]/)[0]?.trim()
  if (firstClause && firstClause.length <= CREDIT_MAX_CHARS) return firstClause
  const trimmed = credit.slice(0, CREDIT_MAX_CHARS)
  return `${trimmed.slice(0, trimmed.lastIndexOf(' ') > 0 ? trimmed.lastIndexOf(' ') : CREDIT_MAX_CHARS)}…`
}

/** The wikis a file may live on: Commons first, then the local en.wikipedia
 *  upload that fair-use files never leave. */
const FILE_HOSTS = [
  'https://commons.wikimedia.org/w/api.php',
  'https://en.wikipedia.org/w/api.php',
] as const

/**
 * A file's licence from whichever wiki actually hosts it.
 *
 * Commons hosting was long used as the licence test itself — it accepts free
 * files only, so "Commons serves it" implied "we may re-host it". That proxy is
 * sound in one direction and wrong in the other: a freely licensed file
 * uploaded to en.wikipedia instead (South Africa's Democratic Alliance mark is
 * public domain) fails a hosting probe while being perfectly free to use. Ask
 * the licence directly, and let the caller decide on the answer.
 */
export const fetchImageLicence = async (file: string): Promise<ImageLicence | undefined> => {
  for (const host of FILE_HOSTS) {
    const data = await fetchJson<ExtMetadataResponse>(
      `${host}?action=query&titles=${encodeURIComponent(
        `File:${file}`
      )}&prop=imageinfo&iiprop=extmetadata&format=json`
    )
    const page = Object.values(data?.query?.pages ?? {})[0]
    const metadata = page?.imageinfo?.[0]?.extmetadata
    if (metadata) return classifyLicence(metadata, stripTags, shortenCredit)
  }
  return undefined
}

/**
 * A Commons file's author and licence, from its extmetadata. Wikimedia photos
 * are free to use but most licences require attribution — anything shipped to
 * players should carry this credit line.
 */
export const fetchImageAttribution = async (
  file: string
): Promise<{ credit?: string; license?: string } | undefined> => {
  const data = await fetchJson<ExtMetadataResponse>(
    `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(
      `File:${file}`
    )}&prop=imageinfo&iiprop=extmetadata&format=json`
  )
  const metadata = Object.values(data?.query?.pages ?? {})[0]?.imageinfo?.[0]?.extmetadata
  if (!metadata) return undefined

  const credit = metadata.Artist?.value ? stripTags(metadata.Artist.value) : undefined
  const license = metadata.LicenseShortName?.value
    ? stripTags(metadata.LicenseShortName.value)
    : undefined
  if (!credit && !license) return undefined
  // Some "artist" fields are whole camera-club paragraphs, or a bare URL to the
  // source page. Those are too long to print — but DROPPING them left files
  // under CC BY / CC BY-SA shipping with a licence that demands attribution and
  // nobody to attribute (Ireland's Green Party, Turkey's HDP). Shorten instead:
  // a trimmed credit still names the author, where none names nobody.
  return { credit: credit ? shortenCredit(credit) : undefined, license }
}

/**
 * The credit to store beside a shipped Commons photo, reusing whatever the
 * previous run captured — one metadata call per newly credited image, none for
 * the thousands already credited. Every media generator writes these fields, so
 * a view can name the photographer the licence requires it to name.
 */
export const captureImageCredit = async (
  file: string | undefined,
  previous?: MediaCredit,
  force = false
): Promise<MediaCredit> => {
  const kept: MediaCredit = {
    ...(previous?.credit ? { credit: previous.credit } : {}),
    ...(previous?.license ? { license: previous.license } : {}),
  }
  if (!file) return kept
  if (!force && kept.license) return kept

  const attribution = await fetchImageAttribution(file)
  if (!attribution) return kept

  return {
    ...(attribution.credit ? { credit: attribution.credit } : {}),
    ...(attribution.license ? { license: attribution.license } : {}),
  }
}

export const EXTENSION_BY_CONTENT_TYPE: { [contentType: string]: string } = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/**
 * Everything we ship is re-encoded to WebP at a bounded width — one format and
 * one size budget for every generated image, whatever the source served. Kept
 * here (rather than per-generator) so capitals/leaders/currencies/landmarks
 * can't drift apart.
 */
export const WEBP_QUALITY = 80

/** Re-encode any image buffer to WebP, downscaling to `maxWidth` (never up). */
export const encodeWebp = async (input: Buffer, maxWidth: number): Promise<Buffer> =>
  sharp(input)
    .rotate() // honour EXIF orientation before we strip metadata
    .resize({ width: maxWidth, withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer()

/**
 * Write `buffer` as `${baseName}.webp`, returning its public path. Any stale
 * `.jpg`/`.png`/`.gif` sibling from an older run is removed so the directory
 * never holds two encodings of the same image.
 */
export const writeWebp = async (
  buffer: Buffer,
  baseName: string,
  publicBase: string,
  maxWidth: number
): Promise<string | undefined> => {
  const encoded = await encodeWebp(buffer, maxWidth).catch(() => undefined)
  if (!encoded) return undefined

  writeFileSync(`${baseName}.webp`, encoded)
  for (const extension of ['jpg', 'png', 'gif']) {
    if (existsSync(`${baseName}.${extension}`)) rmSync(`${baseName}.${extension}`)
  }
  return `${publicBase}.webp`
}

/**
 * A local `.webp`'s intrinsic size, read straight from the file header — no
 * decode, no network, no `sharp` round-trip (the whole 1709-file party roster
 * reads in ~190ms).
 *
 * WebP has three container shapes and the dimensions sit in a different place
 * in each: VP8X stores two 24-bit LE values minus one, VP8L packs two 14-bit
 * fields into a u32, and plain VP8 keeps 14-bit values in two u16s.
 *
 * Sibling of `fetchImageDimensions`, which asks Commons about a file we have
 * not downloaded yet; this one answers for a file already on disk, which is
 * what a backfill over saved assets needs.
 */
export const webpDimensions = (path: string): { width: number; height: number } | undefined => {
  let buffer: Buffer
  try {
    buffer = readFileSync(path)
  } catch {
    return undefined
  }
  if (buffer.length < 30) return undefined
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP')
    return undefined

  const format = buffer.toString('ascii', 12, 16)
  if (format === 'VP8X')
    return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) }
  if (format === 'VP8L') {
    const packed = buffer.readUInt32LE(21)
    return { width: 1 + (packed & 0x3fff), height: 1 + ((packed >> 14) & 0x3fff) }
  }
  if (format === 'VP8 ')
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff }
  return undefined
}

/**
 * Fetch a wiki-hosted file at a fixed width, honouring 429 backoff.
 *
 * Commons serves the overwhelming majority, but a freely licensed file can be
 * uploaded to en.wikipedia instead and never mirrored — `Special:FilePath` on
 * Commons 404s for those. Falling through to en.wikipedia means a file the
 * licence gate cleared can always actually be fetched, rather than passing the
 * check and then silently failing to download.
 */
const FILE_PATH_HOSTS = ['https://commons.wikimedia.org', 'https://en.wikipedia.org'] as const

export const downloadCommonsImage = async (
  file: string,
  width: number,
  attempt = 1,
  host = 0
): Promise<Response | undefined> => {
  const base = FILE_PATH_HOSTS[host] ?? FILE_PATH_HOSTS[0]
  const url = `${base}/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${width}`
  const response = await fetch(url, { headers: { 'User-Agent': WIKIDATA_USER_AGENT } }).catch(
    () => undefined
  )
  if (response?.ok) return response

  // A 404 means this host does not have the file — try the next one at once
  // rather than spending six backoffs on an answer that will not change.
  if (response?.status === 404 && host + 1 < FILE_PATH_HOSTS.length) {
    return downloadCommonsImage(file, width, 1, host + 1)
  }
  if (attempt >= 6) return undefined

  const retryAfter = Number(response?.headers.get('retry-after'))
  await wait(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2500 * attempt)
  return downloadCommonsImage(file, width, attempt + 1, host)
}

/**
 * Fetch a Commons SVG file's raw markup. `downloadCommonsImage` always appends
 * `?width=`, which makes Commons rasterize SVGs to PNG — this is the same
 * fetch/backoff dance without the width hint, so the original vector comes
 * back. Returns undefined when the file isn't SVG or keeps failing.
 */
export const fetchCommonsSvgText = async (
  file: string,
  attempt = 1
): Promise<string | undefined> => {
  const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}`
  const response = await fetch(url, { headers: { 'User-Agent': WIKIDATA_USER_AGENT } }).catch(
    () => undefined
  )
  if (response?.ok) {
    const contentType = response.headers.get('content-type') ?? ''
    // Some Commons SVGs are saved as UTF-16 (BOM-prefixed) — response.text()
    // assumes UTF-8 and produces null-riddled garbage. Sniff the BOM.
    const bytes = new Uint8Array(await response.arrayBuffer())
    const encoding =
      bytes[0] === 0xff && bytes[1] === 0xfe
        ? 'utf-16le'
        : bytes[0] === 0xfe && bytes[1] === 0xff
          ? 'utf-16be'
          : 'utf-8'
    const body = new TextDecoder(encoding).decode(bytes).replace(/^\uFEFF/, '')
    const looksLikeSvg = contentType.includes('svg') || /^\s*(<\?xml|<svg)/.test(body)
    if (!looksLikeSvg) {
      console.warn(`  not an SVG (${contentType || 'no content-type'}): ${file}`)
      return undefined
    }
    return body
  }
  if (attempt >= 6) return undefined

  const retryAfter = Number(response?.headers.get('retry-after'))
  await wait(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2500 * attempt)
  return fetchCommonsSvgText(file, attempt + 1)
}

/**
 * An already-encoded `${baseName}.webp`. Only WebP counts as a cache hit — a
 * leftover `.jpg` from before the WebP switch must be re-encoded, not reused.
 */
export const existingImagePath = (baseName: string, publicBase: string): string | undefined =>
  existsSync(`${baseName}.webp`) ? `${publicBase}.webp` : undefined

/**
 * Raw downloaded bytes, keyed by source URL and kept beside the vendor
 * datasets (gitignored, regenerable). A `--force` run or an encoding change
 * re-encodes from these instead of re-hitting the source host — the Internet
 * Archive especially throttles far harder than Commons, and its copies are the
 * only surviving originals for the World of Change frames. Delete the
 * directory to force a true re-download.
 */
const ORIGINALS_DIRECTORY = 'generators/vendors/originals'

const originalBase = (url: string) =>
  `${ORIGINALS_DIRECTORY}/${createHash('sha1').update(url).digest('hex')}`

const cachedOriginalPath = (url: string): string | undefined =>
  Object.values(EXTENSION_BY_CONTENT_TYPE)
    .map(extension => `${originalBase(url)}.${extension}`)
    .find(existsSync)

/** Whether `saveImageUrl(url, …)` can serve this URL without touching the network. */
export const hasCachedOriginal = (url: string): boolean => Boolean(cachedOriginalPath(url))

/**
 * Fetch `url` into the originals cache (no-op when already held) and return
 * the cached file's path. Best-effort: undefined after repeated failure or a
 * non-image response, never a throw.
 */
export const cacheOriginal = async (url: string): Promise<string | undefined> => {
  const cached = cachedOriginalPath(url)
  if (cached) return cached

  // A plain browser UA: some hosts 403 an unknown agent, and unlike Commons
  // these are arbitrary sites we don't have an arrangement with.
  // Retried with backoff: a 386-seed run reliably trips Wikimedia's rate limit
  // on at least one image, and a single 429 shouldn't drop a landmark.
  let response: Response | undefined
  for (let attempt = 1; attempt <= 5; attempt++) {
    response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; mondiale-game-generator/1.0)' },
    }).catch(() => undefined)
    if (response?.ok) break

    const retryable = !response || response.status === 429 || response.status >= 500
    if (!retryable || attempt === 5) break

    const retryAfter = Number(response?.headers.get('retry-after'))
    await wait(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * attempt)
  }

  if (!response?.ok) {
    console.warn(`  imageUrl fetch failed (${response?.status ?? 'network'}): ${url.slice(0, 90)}`)
    return undefined
  }

  const contentType = response.headers.get('content-type')?.split(';')[0] ?? ''
  if (!EXTENSION_BY_CONTENT_TYPE[contentType]) {
    console.warn(`  imageUrl is not an image (${contentType || 'no content-type'})`)
    return undefined
  }

  const path = `${originalBase(url)}.${EXTENSION_BY_CONTENT_TYPE[contentType]}`
  mkdirSync(ORIGINALS_DIRECTORY, { recursive: true })
  writeFileSync(path, Buffer.from(await response.arrayBuffer()))
  return path
}

/**
 * Download a hand-picked image from an arbitrary URL. Used by a seed's
 * `imageUrl` override, so it skips the viability check entirely — whoever set
 * the URL already vouched for the photo.
 */
export const saveImageUrl = async (
  url: string,
  baseName: string,
  publicBase: string,
  { width, force }: { width: number; force: boolean }
): Promise<string | undefined> => {
  if (!force) {
    const existing = existingImagePath(baseName, publicBase)
    if (existing) return existing
  }

  const original = await cacheOriginal(url)
  if (!original) return undefined

  return writeWebp(readFileSync(original), baseName, publicBase, width)
}

/**
 * Download a Commons file, re-encode it to WebP, and return its public path
 * (relative to /public). Skips the work when `${baseName}.webp` already exists
 * and `force` is false. Returns undefined on failure.
 *
 * Commons serves the file pre-scaled to `width`, so the resize in writeWebp is
 * usually a no-op — it's there to bound the odd source that ignores the hint.
 */
export const saveCommonsImage = async (
  file: string,
  baseName: string,
  publicBase: string,
  { width, force }: { width: number; force: boolean }
): Promise<string | undefined> => {
  if (!force) {
    const existing = existingImagePath(baseName, publicBase)
    if (existing) return existing
  }

  const response = await downloadCommonsImage(file, width)
  if (!response) return undefined

  return writeWebp(Buffer.from(await response.arrayBuffer()), baseName, publicBase, width)
}

/**
 * Audio ships in two encodings because no single one covers every browser:
 * Opus/WebM for Chrome/Firefox/Android, AAC/M4A for Safari. Both are bounded
 * the same way images are — one clip length and one bitrate budget for every
 * generated sound, kept here so the anthem and language generators can't drift.
 */
export const AUDIO_CLIP_SECONDS = 30
export const OPUS_BITRATE = '64k'
export const AAC_BITRATE = '96k'
/** Opus is 48kHz-only, so both encodes share it — and pinning it stops
 *  `loudnorm`'s internal 192kHz resample leaking into the shipped file. */
export const AUDIO_SAMPLE_RATE = 48000

/** Recordings arrive at wildly different levels — a quiet anthem after a loud
 *  one is a bad round, not a hard one. Normalize every clip to the same target. */
const LOUDNESS_FILTER = 'loudnorm=I=-16:TP=-1.5:LRA=11'

/** Encode a trimmed, loudness-normalized clip. `codec` picks the container. */
const encodeClip = (
  input: Buffer,
  outputPath: string,
  { seconds, offset, codec }: { seconds: number; offset: number; codec: 'opus' | 'aac' }
): Promise<boolean> =>
  new Promise(resolve => {
    const child = spawn(
      'ffmpeg',
      [
        ...['-hide_banner', '-loglevel', 'error', '-y'],
        ...['-i', 'pipe:0'],
        ...['-ss', String(offset), '-t', String(seconds)],
        ...['-af', LOUDNESS_FILTER],
        '-vn', // some Commons audio carries cover art; never ship a video stream
        // Pin the sample rate. `loudnorm` resamples to 192kHz internally and
        // hands that on, so an unpinned AAC encode shipped 96kHz files that
        // played back sped-up and chipmunked — the speech clips sounded like a
        // rave. Opus only ever supports 48k, so both land on the same rate.
        ...['-ar', String(AUDIO_SAMPLE_RATE)],
        ...(codec === 'opus'
          ? ['-c:a', 'libopus', '-b:a', OPUS_BITRATE, '-f', 'webm']
          : ['-c:a', 'aac', '-b:a', AAC_BITRATE, '-f', 'mp4', '-movflags', '+faststart']),
        outputPath,
      ],
      { stdio: ['pipe', 'ignore', 'pipe'] }
    )

    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk))
    child.on('error', () => resolve(false))
    child.on('close', (code: number | null) => {
      if (code !== 0 && stderr.trim()) console.warn(`  ffmpeg: ${stderr.trim().slice(0, 120)}`)
      resolve(code === 0)
    })
    child.stdin.on('error', () => {}) // ffmpeg can exit before the write drains
    child.stdin.end(input)
  })

/** Both encodings of an already-generated clip, or undefined if either is missing. */
export const existingAudioClip = (
  baseName: string,
  publicBase: string
): { webm: string; m4a: string } | undefined =>
  existsSync(`${baseName}.webm`) && existsSync(`${baseName}.m4a`)
    ? { webm: `${publicBase}.webm`, m4a: `${publicBase}.m4a` }
    : undefined

/**
 * Write `buffer` as both `${baseName}.webm` and `${baseName}.m4a`, trimmed to
 * `seconds` from `offset`. Returns both public paths, or undefined if either
 * encode fails — a half-encoded clip would play on one browser and not another.
 */
export const writeAudioClip = async (
  buffer: Buffer,
  baseName: string,
  publicBase: string,
  { seconds = AUDIO_CLIP_SECONDS, offset = 0 }: { seconds?: number; offset?: number } = {}
): Promise<{ webm: string; m4a: string } | undefined> => {
  const [opus, aac] = await Promise.all([
    encodeClip(buffer, `${baseName}.webm`, { seconds, offset, codec: 'opus' }),
    encodeClip(buffer, `${baseName}.m4a`, { seconds, offset, codec: 'aac' }),
  ])

  if (!opus || !aac) {
    for (const extension of ['webm', 'm4a']) {
      if (existsSync(`${baseName}.${extension}`)) rmSync(`${baseName}.${extension}`)
    }
    return undefined
  }
  return { webm: `${publicBase}.webm`, m4a: `${publicBase}.m4a` }
}

/**
 * Download a Commons audio file and ship it as a trimmed clip in both
 * encodings. Unlike images there is no `?width=` hint to shrink the transfer,
 * so the whole recording comes down and ffmpeg does the trimming.
 */
export const saveCommonsAudio = async (
  file: string,
  baseName: string,
  publicBase: string,
  {
    force,
    seconds = AUDIO_CLIP_SECONDS,
    offset = 0,
  }: { force: boolean; seconds?: number; offset?: number }
): Promise<{ webm: string; m4a: string } | undefined> => {
  if (!force) {
    const existing = existingAudioClip(baseName, publicBase)
    if (existing) return existing
  }

  const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}`
  let response: Response | undefined
  for (let attempt = 1; attempt <= 6; attempt++) {
    response = await fetch(url, { headers: { 'User-Agent': WIKIDATA_USER_AGENT } }).catch(
      () => undefined
    )
    if (response?.ok) break

    const retryAfter = Number(response?.headers.get('retry-after'))
    await wait(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2500 * attempt)
  }
  if (!response?.ok) {
    console.warn(`  audio fetch failed (${response?.status ?? 'network'}): ${file.slice(0, 90)}`)
    return undefined
  }

  return writeAudioClip(Buffer.from(await response.arrayBuffer()), baseName, publicBase, {
    seconds,
    offset,
  })
}
