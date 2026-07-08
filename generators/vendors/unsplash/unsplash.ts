import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * Minimal Unsplash image fetcher for landmark overrides where Wikidata's
 * auto-picked photo is the wrong subject or low quality. Needs an access key
 * in UNSPLASH_ACCESS_KEY (register a free app at unsplash.com/developers).
 * Returns undefined (and warns once) when no key is set, so the generator can
 * fall back to Commons.
 *
 * IMPORTANT — the free tier is 50 requests/HOUR. To stay well under it:
 *  1) if the target image file already exists (and not --force), NO API call is
 *     made at all — the download is the API-costly step;
 *  2) resolved photo URLs are cached to disk, so even a --force re-run reuses
 *     the metadata lookup and only re-downloads the bytes.
 */

const ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY
let warnedNoKey = false

// --- URL cache (query/photoId → resolved raw url) ---------------------------
const CACHE_FILE = 'generators/vendors/unsplash/.cache/urls.json'
let urlCache: Record<string, string> = {}
try {
  urlCache = JSON.parse(readFileSync(CACHE_FILE, 'utf-8'))
} catch {
  // no cache yet
}
const rememberUrl = (key: string, url: string) => {
  urlCache[key] = url
  mkdirSync(dirname(CACHE_FILE), { recursive: true })
  writeFileSync(CACHE_FILE, JSON.stringify(urlCache, null, 2))
}

export const hasUnsplashKey = (): boolean => {
  if (!ACCESS_KEY && !warnedNoKey) {
    console.warn(
      '  UNSPLASH_ACCESS_KEY not set — landmarks with an `unsplash:` override fall back to Commons.'
    )
    warnedNoKey = true
  }
  return !!ACCESS_KEY
}

interface UnsplashPhoto {
  urls?: { raw?: string; regular?: string }
}
interface SearchResponse {
  results?: UnsplashPhoto[]
}

const downloadSized = async (
  raw: string,
  baseName: string,
  publicBase: string,
  width: number
): Promise<string | undefined> => {
  const imageUrl = `${raw}${raw.includes('?') ? '&' : '?'}w=${width}&fm=jpg&q=80&fit=max`
  const response = await fetch(imageUrl).catch(() => undefined)
  if (!response?.ok) return undefined
  writeFileSync(`${baseName}.jpg`, Buffer.from(await response.arrayBuffer()))
  return `${publicBase}.jpg`
}

/** An already-downloaded file means we can skip the API entirely (rate limit). */
const existingImage = (baseName: string, publicBase: string): string | undefined =>
  existsSync(`${baseName}.jpg`) ? `${publicBase}.jpg` : undefined

/**
 * Fetch one EXACT Unsplash photo by its id (the code at the end of an Unsplash
 * URL, e.g. `.../photo-slug-SvTVnah8jUk` → `SvTVnah8jUk`). Use when the search
 * result isn't right and you've hand-picked a specific photo.
 */
export const saveUnsplashPhoto = async (
  photoId: string,
  baseName: string,
  publicBase: string,
  width: number,
  force = false
): Promise<string | undefined> => {
  if (!ACCESS_KEY) return undefined
  if (!force) {
    const existing = existingImage(baseName, publicBase)
    if (existing) return existing
  }

  const key = `photo:${photoId}`
  let raw = urlCache[key]
  if (!raw) {
    const photo = await fetch(`https://api.unsplash.com/photos/${photoId}`, {
      headers: { Authorization: `Client-ID ${ACCESS_KEY}` },
    })
      .then(response => (response.ok ? (response.json() as Promise<UnsplashPhoto>) : undefined))
      .catch(() => undefined)
    raw = photo?.urls?.raw ?? photo?.urls?.regular ?? ''
    if (!raw) {
      console.warn(`  no Unsplash photo for id "${photoId}"`)
      return undefined
    }
    rememberUrl(key, raw)
  }
  return downloadSized(raw, baseName, publicBase, width)
}

/**
 * Search Unsplash and save the top landscape-oriented result to
 * `${baseName}.jpg`, returning its public path. `query` should be specific
 * (e.g. "Copán Mayan ruins Honduras").
 */
export const saveUnsplashImage = async (
  query: string,
  baseName: string,
  publicBase: string,
  width: number,
  force = false
): Promise<string | undefined> => {
  if (!ACCESS_KEY) return undefined
  if (!force) {
    const existing = existingImage(baseName, publicBase)
    if (existing) return existing
  }

  const key = `search:${query}`
  const cached = urlCache[key]
  if (cached) return downloadSized(cached, baseName, publicBase, width)

  const search = await fetch(
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(
      query
    )}&per_page=1&orientation=landscape&content_filter=high`,
    { headers: { Authorization: `Client-ID ${ACCESS_KEY}` } }
  )
    .then(response => (response.ok ? (response.json() as Promise<SearchResponse>) : undefined))
    .catch(() => undefined)

  const raw = search?.results?.[0]?.urls?.raw ?? search?.results?.[0]?.urls?.regular
  if (!raw) {
    console.warn(`  no Unsplash result for "${query}"`)
    return undefined
  }
  rememberUrl(key, raw)
  return downloadSized(raw, baseName, publicBase, width)
}
