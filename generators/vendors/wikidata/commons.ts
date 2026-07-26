import { existsSync, rmSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'

/**
 * Shared Wikidata / Wikimedia Commons fetch helpers — one implementation of the
 * retry-with-backoff JSON fetch, the `page_image_free` batch lookup, and the
 * Commons image download+save, reused by the leaders / capitals / landmarks
 * generators. Extracted from create-leaders-file.ts (its original home).
 */

export const WIKIDATA_USER_AGENT =
  'mondiale-game-generator/1.0 (https://github.com/ikethepike/mondiale)'

export const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** JSON fetch with Retry-After-aware backoff; undefined after repeated failure. */
export const fetchJson = async <T>(url: string, attempt = 1): Promise<T | undefined> => {
  const response = await fetch(url, {
    headers: { 'User-Agent': WIKIDATA_USER_AGENT, Accept: 'application/json' },
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
  return (await response.json()) as T
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
          extmetadata?: {
            Artist?: { value?: string }
            LicenseShortName?: { value?: string }
          }
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
  // Some "artist" fields are whole camera-club paragraphs — too long to credit.
  return { credit: credit && credit.length <= 80 ? credit : undefined, license }
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

/** Fetch a Commons file at a fixed width, honouring 429 backoff. */
export const downloadCommonsImage = async (
  file: string,
  width: number,
  attempt = 1
): Promise<Response | undefined> => {
  const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${width}`
  const response = await fetch(url, { headers: { 'User-Agent': WIKIDATA_USER_AGENT } }).catch(
    () => undefined
  )
  if (response?.ok) return response
  if (attempt >= 6) return undefined

  const retryAfter = Number(response?.headers.get('retry-after'))
  await wait(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2500 * attempt)
  return downloadCommonsImage(file, width, attempt + 1)
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
    const body = new TextDecoder(encoding).decode(bytes).replace(/^﻿/, '')
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

  return writeWebp(Buffer.from(await response.arrayBuffer()), baseName, publicBase, width)
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
