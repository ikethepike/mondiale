import { existsSync, writeFileSync } from 'node:fs'

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

export const EXTENSION_BY_CONTENT_TYPE: { [contentType: string]: string } = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
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
 * Download a Commons file to `${baseName}.<ext>` and return its public path
 * (relative to /public). Skips the download when a file already exists and
 * `force` is false. Returns undefined on failure.
 */
export const saveCommonsImage = async (
  file: string,
  baseName: string,
  publicBase: string,
  { width, force }: { width: number; force: boolean }
): Promise<string | undefined> => {
  const existing = Object.values(EXTENSION_BY_CONTENT_TYPE).find(extension =>
    existsSync(`${baseName}.${extension}`)
  )
  if (existing && !force) return `${publicBase}.${existing}`

  const response = await downloadCommonsImage(file, width)
  if (!response) return undefined

  const contentType = response.headers.get('content-type')?.split(';')[0] ?? ''
  const extension = EXTENSION_BY_CONTENT_TYPE[contentType] ?? 'jpg'
  writeFileSync(`${baseName}.${extension}`, Buffer.from(await response.arrayBuffer()))
  return `${publicBase}.${extension}`
}
