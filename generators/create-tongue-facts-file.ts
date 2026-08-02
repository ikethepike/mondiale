import { writeFileSync } from 'fs'
import { COUNTRIES } from '~~/data/countries.gen'
import { fetchJson, wait } from './vendors/wikidata/commons'

const OUTPUT_FILE = 'data/tongue-facts.gen.ts'

/** Mirrored into the generated file's header — the app imports it from there. */
interface TongueFacts {
  speakers?: number
  scripts?: string[]
}

interface SearchResponse {
  query?: { search?: { title: string }[] }
}

interface EntityResponse {
  entities?: {
    [qid: string]: {
      labels?: { en?: { value?: string } }
      claims?: {
        [property: string]: {
          mainsnak?: {
            datavalue?: { value?: { amount?: string; id?: string } }
          }
        }[]
      }
    }
  }
}

/**
 * Language facts for the Mother Tongue reveal, from Wikidata: total speakers
 * (P1098, the largest published statement) and writing systems (P282).
 * Keyed by the game's language names (Country.languages); languages Wikidata
 * can't resolve are simply absent — reveals degrade gracefully.
 *
 *   bun run generate:tongue-facts
 */
const createTongueFactsFile = async () => {
  const languages = [
    ...new Set(Object.values(COUNTRIES).flatMap(country => country.languages ?? [])),
  ].sort()
  console.log(`Resolving ${languages.length} languages against Wikidata…`)

  // --- 1. Name → language Q-id (P220: only true languages carry an ISO 639-3) --
  const qidByLanguage = new Map<string, string>()
  for (const language of languages) {
    const page = await fetchJson<SearchResponse>(
      `https://www.wikidata.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        `${language} haswbstatement:P220`
      )}&srnamespace=0&srlimit=1&format=json`
    )
    const hit = page?.query?.search?.[0]?.title
    if (hit) qidByLanguage.set(language, hit)
    else console.warn(`  no Wikidata language item for: ${language}`)
    await wait(200)
  }

  // --- 2. Claims: speakers (P1098) + script items (P282) -----------------------
  const qids = [...new Set(qidByLanguage.values())]
  const speakersByQid = new Map<string, number>()
  const scriptQidsByQid = new Map<string, string[]>()
  for (let index = 0; index < qids.length; index += 50) {
    const batch = qids.slice(index, index + 50)
    const data = await fetchJson<EntityResponse>(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${batch.join('|')}&props=claims&format=json`
    )
    for (const [qid, entity] of Object.entries(data?.entities ?? {})) {
      const amounts = (entity.claims?.P1098 ?? [])
        .map(claim => Number(claim.mainsnak?.datavalue?.value?.amount))
        .filter(amount => Number.isFinite(amount) && amount > 0)
      if (amounts.length) speakersByQid.set(qid, Math.max(...amounts))
      const scripts = (entity.claims?.P282 ?? [])
        .map(claim => claim.mainsnak?.datavalue?.value?.id)
        .filter((id): id is string => !!id)
      if (scripts.length) scriptQidsByQid.set(qid, scripts)
    }
    await wait(200)
  }

  // --- 3. Script labels ---------------------------------------------------------
  const scriptQids = [...new Set([...scriptQidsByQid.values()].flat())]
  const scriptLabels = new Map<string, string>()
  for (let index = 0; index < scriptQids.length; index += 50) {
    const batch = scriptQids.slice(index, index + 50)
    const data = await fetchJson<EntityResponse>(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${batch.join('|')}&props=labels&languages=en&languagefallback=1&format=json`
    )
    for (const [id, entity] of Object.entries(data?.entities ?? {})) {
      if (entity.labels?.en?.value) scriptLabels.set(id, entity.labels.en.value)
    }
    await wait(200)
  }

  const facts: { [language: string]: TongueFacts } = {}
  for (const [language, qid] of qidByLanguage) {
    const entry: TongueFacts = {}
    const speakers = speakersByQid.get(qid)
    if (speakers) entry.speakers = speakers
    // The claim list mixes registers ("Latin script", "Swedish alphabet",
    // "French Braille") — keep the script-level names, at most two.
    const scripts = [
      ...new Set(
        (scriptQidsByQid.get(qid) ?? [])
          .map(id => scriptLabels.get(id))
          .filter((label): label is string => !!label && !/braille|alphabet/i.test(label))
      ),
    ].slice(0, 2)
    if (scripts.length) entry.scripts = scripts
    if (Object.keys(entry).length) facts[language] = entry
  }

  const withSpeakers = Object.values(facts).filter(entry => entry.speakers).length
  console.log(
    `Tongue facts: ${Object.keys(facts).length}/${languages.length} languages, ${withSpeakers} with speaker counts`
  )

  writeFileSync(
    OUTPUT_FILE,
    `// This is a generated file, don't touch it.
// Generated at: ${new Date().toISOString()}

/** Language facts from Wikidata, keyed by the game's language names
 *  (Country.languages): total speakers (P1098) and writing systems (P282). */
export interface TongueFacts {
  speakers?: number
  scripts?: string[]
}

export const TONGUE_FACTS: { [language: string]: TongueFacts } = ${JSON.stringify(facts)}
`
  )
  console.log(`Finished creating file: ${OUTPUT_FILE}`)
}

createTongueFactsFile()
