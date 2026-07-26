import { writeFileSync } from 'node:fs'
import { EVENT_SEEDS } from './data/event-seeds'
import { fetchJson, wait } from './vendors/wikidata/commons'

const slugify = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/**
 * Pulls the lead paragraph of each event's English Wikipedia article into a
 * review file, as source material for the descriptions in
 * generators/data/event-seeds.ts — the event pipeline's sibling of
 * fetch-landmark-facts.
 *
 * Events carry no coordinates to sanity-check an article against; the guard
 * here is the YEAR instead. A lead that never mentions the seed's year (or a
 * neighbouring one — campaigns straddle new years) is probably about something
 * else, and is marked rather than quietly written into the review file. BCE
 * years skip that check: leads write them too many ways to match reliably.
 *
 *   bun run generators/fetch-event-facts.ts
 *   bun run generators/check-event-facts.ts
 */

const OUTPUT_PATH = 'generators/data/event-facts-review.txt'

interface SearchResponse {
  query?: { search?: { title: string }[] }
}
interface PagesResponse {
  query?: {
    redirects?: { from: string; to: string }[]
    normalized?: { from: string; to: string }[]
    pages?: { [pageId: string]: { title?: string; extract?: string } }
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

/** The article a pinned Wikidata item links to — authoritative, no searching. */
const articleForQid = async (qid: string): Promise<string | undefined> => {
  const data = await fetchJson<{
    entities?: { [id: string]: { sitelinks?: { enwiki?: { title?: string } } } }
  }>(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=sitelinks&sitefilter=enwiki&format=json`
  )
  return data?.entities?.[qid]?.sitelinks?.enwiki?.title
}

/** The lead paragraph, minus the apparatus a lead opens with (see landmarks). */
const cleanExtract = (raw: string): string =>
  raw
    .replace(/^([^(]{0,60})\([^)]*\)/, '$1')
    .replace(/\s*\((?:[^()]*(?:\([^()]*\))?[^()]*)\)/g, match =>
      /[\p{Script=Han}\p{Script=Arabic}\p{Script=Cyrillic}\p{Script=Devanagari}\p{Script=Tibetan}]|IPA|pronounced|romanized|lit\.|transl\./u.test(
        match
      )
        ? ''
        : match
    )
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()

console.log(`Fetching Wikipedia leads for ${EVENT_SEEDS.length} events…`)

const titleOf = new Map<string, string>()
for (const seed of EVENT_SEEDS) {
  const slug = slugify(seed.name)
  const title = seed.qid ? await articleForQid(seed.qid) : await findArticle(seed.name)
  if (title) titleOf.set(slug, title)
  else console.warn(`  no article for "${seed.name}"`)
  process.stdout.write(`\r  ${titleOf.size}/${EVENT_SEEDS.length} articles`)
  await wait(120)
}
console.log('')

const extractOf = new Map<string, string>()
const bySlug = new Map<string, string>()
for (const [slug, title] of titleOf) bySlug.set(title, slug)

const titles = [...titleOf.values()]
for (let index = 0; index < titles.length; index += 20) {
  const batch = titles.slice(index, index + 20)
  const data = await fetchJson<PagesResponse>(
    `${WIKIPEDIA}?action=query&prop=extracts&exintro&explaintext&redirects=1&titles=${batch
      .map(encodeURIComponent)
      .join('%7C')}&format=json`
  )
  // Walk the normalize→redirect chain back to the requested title (see the
  // landmark fetcher) — a redirected article is otherwise silently lost.
  const resolvedFrom = new Map<string, string>()
  for (const hop of [...(data?.query?.normalized ?? []), ...(data?.query?.redirects ?? [])]) {
    resolvedFrom.set(hop.to, resolvedFrom.get(hop.from) ?? hop.from)
  }

  for (const page of Object.values(data?.query?.pages ?? {})) {
    if (!page.title || !page.extract) continue
    const requested = resolvedFrom.get(page.title) ?? page.title
    const slug = bySlug.get(requested)
    if (slug) extractOf.set(slug, cleanExtract(page.extract))
  }
  process.stdout.write(`\r  ${Math.min(index + 20, titles.length)}/${titles.length} extracts`)
  await wait(200)
}
console.log('')

// --- Verify each article really is about this event ---------------------------
const lines: string[] = []
let kept = 0
let suspect = 0
let missing = 0

for (const seed of EVENT_SEEDS) {
  const slug = slugify(seed.name)
  const extract = extractOf.get(slug)
  const title = titleOf.get(slug)
  if (!extract || !title) {
    missing++
    lines.push(`### ${slug}\t${seed.name} (${seed.country})\n!! NO ARTICLE\n`)
    continue
  }

  const nearYears = [seed.year - 1, seed.year, seed.year + 1].map(String)
  if (seed.year > 0 && !nearYears.some(year => extract.includes(year))) {
    suspect++
    lines.push(
      `### ${slug}\t${seed.name} (${seed.country})\n` +
        `!! WRONG ARTICLE?: "${title}" never mentions ${seed.year}\n`
    )
    continue
  }

  kept++
  lines.push(`### ${slug}\t${seed.name} (${seed.country})\n@ ${title}\n${extract}\n`)
}

writeFileSync(OUTPUT_PATH, lines.join('\n'))
console.log(
  `\n${kept} leads written, ${suspect} rejected (year missing), ${missing} without an article`
)
console.log(`→ ${OUTPUT_PATH}`)
