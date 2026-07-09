import { writeFileSync } from 'node:fs'
import { LANDMARKS } from '../data/landmarks.gen'
import { LANDMARK_SEEDS } from './data/landmark-seeds'
import { fetchJson, wait } from './vendors/wikidata/commons'

const slugify = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/**
 * Pulls the lead paragraph of each landmark's English Wikipedia article into a
 * review file, as source material for the one-line descriptions in
 * generators/data/landmark-facts.ts.
 *
 * It resolves the article by NAME through Wikipedia's own search rather than
 * through the landmark's Wikidata Q-id. The Q-id comes from
 * `resolveQidBySearch`, which falls back to the first hit when nothing matches
 * the seed country — and Wikidata's search ranks the *village* of Borobudur
 * above the temple, "Palenque" the municipality above the Maya city, and
 * "Ennedi Massif" onto the Lakes of Ounianga 500km away. Wikipedia's search
 * gets all three right.
 *
 * Every article is then checked against the landmark's own coordinates: an
 * article whose point sits far from the landmark is about a different place,
 * so its prose is dropped rather than quietly written into the review file.
 *
 *   bun run generators/fetch-landmark-facts.ts
 */

const OUTPUT_PATH = 'generators/data/landmark-facts-review.txt'

/**
 * How far an article's coordinates may sit from the landmark's own before we
 * assume it describes something else. Generous: Wikipedia often geotags a
 * sprawling site (a mountain range, a reef) at a different point than Wikidata
 * does, and one article legitimately covers a whole plateau. The failures this
 * catches are hundreds of kilometres out, not tens.
 */
const MAX_KM_APART = 120
const EARTH_RADIUS_KM = 6371

const haversineKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }): number => {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180
  const deltaLat = toRadians(b.lat - a.lat)
  const deltaLng = toRadians(b.lng - a.lng)
  const chord =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(deltaLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(chord))
}

interface SearchResponse {
  query?: { search?: { title: string }[] }
}
interface PagesResponse {
  query?: {
    /** `titles=Matobo Hills` comes back as the page `Matobo National Park`. */
    redirects?: { from: string; to: string }[]
    /** Case and underscore fixes, applied before redirects. */
    normalized?: { from: string; to: string }[]
    pages?: {
      [pageId: string]: {
        title?: string
        extract?: string
        coordinates?: { lat: number; lon: number }[]
      }
    }
  }
}

const WIKIPEDIA = 'https://en.wikipedia.org/w/api.php'

/** The article Wikipedia's own search puts first for this name. */
const findArticle = async (name: string): Promise<string | undefined> => {
  const search = await fetchJson<SearchResponse>(
    `${WIKIPEDIA}?action=query&list=search&srsearch=${encodeURIComponent(name)}&srlimit=1&format=json`
  )
  return search?.query?.search?.[0]?.title
}

/**
 * The lead paragraph, minus the apparatus a lead opens with: the IPA
 * pronunciation, the native-script name, the romanisation. Those run to a
 * hundred characters of parentheses before the sentence says anything.
 */
const cleanExtract = (raw: string): string =>
  raw
    // Leading parentheticals only — a later "(built 1889)" is worth keeping.
    .replace(/^([^(]{0,60})\([^)]*\)/, '$1')
    .replace(/\s*\((?:[^()]*(?:\([^()]*\))?[^()]*)\)/g, match =>
      // Drop parentheses that are pronunciation or script; keep the rest.
      /[\p{Script=Han}\p{Script=Arabic}\p{Script=Cyrillic}\p{Script=Devanagari}\p{Script=Tibetan}]|IPA|pronounced|romanized|lit\.|transl\./u.test(
        match
      )
        ? ''
        : match
    )
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()

/** The article a pinned Wikidata item links to — authoritative, no searching. */
const articleForQid = async (qid: string): Promise<string | undefined> => {
  const data = await fetchJson<{
    entities?: { [id: string]: { sitelinks?: { enwiki?: { title?: string } } } }
  }>(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=sitelinks&sitefilter=enwiki&format=json`
  )
  return data?.entities?.[qid]?.sitelinks?.enwiki?.title
}

/** A seed's pinned qid, if it has one. */
const qidBySlug = new Map<string, string>()
for (const seed of LANDMARK_SEEDS) {
  if (seed.qid) qidBySlug.set(slugify(seed.name), seed.qid)
}

const entries = Object.entries(LANDMARKS)
console.log(`Fetching Wikipedia leads for ${entries.length} landmarks…`)

const titleOf = new Map<string, string>()
for (const [slug, landmark] of entries) {
  // A pin exists precisely because the name search finds the wrong thing —
  // "Pitons" the climbing spike, "Band-e Amir" the cricket team. Honour it.
  const pinned = qidBySlug.get(slug)
  const title = pinned ? await articleForQid(pinned) : await findArticle(landmark.name)
  if (title) titleOf.set(slug, title)
  else console.warn(`  no article for "${landmark.name}"`)
  process.stdout.write(`\r  ${titleOf.size}/${entries.length} articles`)
  await wait(120)
}
console.log('')

// Extracts and coordinates in one batched call per 20 titles.
const extractOf = new Map<string, string>()
const pointOf = new Map<string, { lat: number; lng: number }>()
const bySlug = new Map<string, string>()
for (const [slug, title] of titleOf) bySlug.set(title, slug)

const titles = [...titleOf.values()]
for (let index = 0; index < titles.length; index += 20) {
  const batch = titles.slice(index, index + 20)
  const data = await fetchJson<PagesResponse>(
    `${WIKIPEDIA}?action=query&prop=extracts|coordinates&exintro&explaintext&redirects=1&titles=${batch
      .map(encodeURIComponent)
      .join('%7C')}&format=json`
  )
  // A page's title is where the redirect LANDED, not what we asked for, so walk
  // the chain back to the title we know the slug by. Without this, every
  // redirected article (Matobo Hills → Matobo National Park) is silently lost.
  const resolvedFrom = new Map<string, string>()
  for (const hop of [...(data?.query?.normalized ?? []), ...(data?.query?.redirects ?? [])]) {
    resolvedFrom.set(hop.to, resolvedFrom.get(hop.from) ?? hop.from)
  }

  for (const page of Object.values(data?.query?.pages ?? {})) {
    if (!page.title) continue
    const requested = resolvedFrom.get(page.title) ?? page.title
    const slug = bySlug.get(requested)
    if (!slug) continue

    if (page.extract) extractOf.set(slug, cleanExtract(page.extract))
    const point = page.coordinates?.[0]
    if (point) pointOf.set(slug, { lat: point.lat, lng: point.lon })
  }
  process.stdout.write(`\r  ${Math.min(index + 20, titles.length)}/${titles.length} extracts`)
  await wait(200)
}
console.log('')

// --- Verify each article really is about this landmark -----------------------
const lines: string[] = []
let kept = 0
let displaced = 0
let missing = 0

for (const [slug, landmark] of entries) {
  const extract = extractOf.get(slug)
  const title = titleOf.get(slug)
  if (!extract || !title) {
    missing++
    lines.push(`### ${slug}\t${landmark.name} (${landmark.country})\n!! NO ARTICLE\n`)
    continue
  }

  const articlePoint = pointOf.get(slug)
  if (articlePoint && landmark.coordinates) {
    const km = haversineKm(articlePoint, landmark.coordinates)
    if (km > MAX_KM_APART) {
      displaced++
      lines.push(
        `### ${slug}\t${landmark.name} (${landmark.country})\n` +
          `!! WRONG ARTICLE: "${title}" is ${Math.round(km)}km from the landmark\n`
      )
      continue
    }
  }

  kept++
  lines.push(`### ${slug}\t${landmark.name} (${landmark.country})\n@ ${title}\n${extract}\n`)
}

writeFileSync(OUTPUT_PATH, lines.join('\n'))
console.log(
  `\n${kept} leads written, ${displaced} rejected (wrong article), ${missing} without an article`
)
console.log(`→ ${OUTPUT_PATH}`)
