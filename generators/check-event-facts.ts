import { existsSync, readFileSync } from 'node:fs'
import { EVENT_SEEDS } from './data/event-seeds'

/**
 * Flags event descriptions (generators/data/event-seeds) that assert something
 * their Wikipedia lead does not — the event pipeline's sibling of
 * check-landmark-facts, and the same deliberately narrow contract: it cannot
 * check meaning, only the NUMBERS and PROPER NOUNS a description can be wrong
 * about in a way that matters. For a timeline game the numbers are the whole
 * point — a wrong year on a card actively teaches falsehood.
 *
 * Run after editing event seeds, with the review file already fetched:
 *   bun run generators/fetch-event-facts.ts
 *   bun run generators/check-event-facts.ts
 */

const REVIEW_PATH = 'generators/data/event-facts-review.txt'

if (!existsSync(REVIEW_PATH)) {
  console.error(`No ${REVIEW_PATH}. Run: bun run generators/fetch-event-facts.ts`)
  process.exit(1)
}

const slugify = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** Sentence-openers and words too generic to be a checkable claim. */
const NOT_A_CLAIM = new Set([
  'A',
  'An',
  'The',
  'It',
  'Its',
  'They',
  'Their',
  'This',
  'One',
  'Two',
  'Three',
  'Five',
  'Six',
  'Ten',
  'Eleven',
  'Twelve',
  'Twenty',
  'Thirteen',
  'Built',
  'Begun',
  'Now',
  'Already',
  'Just',
  'Europe',
  'European',
  'World',
  'War',
  'Empire',
  'Republic',
  'King',
  'Queen',
  'President',
  'Emperor',
  'Pope',
  'New',
  'North',
  'South',
  'East',
  'West',
  'Western',
  'Eastern',
  'Cold',
  'Second',
  'First',
  'Great',
  'Day',
  'Christmas',
  'Sunday',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
])

const strip = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Proper nouns: capitalised words that are not merely starting a sentence. */
const properNouns = (text: string): string[] => {
  const words = text.split(/[\s—–]+/)
  const found: string[] = []
  for (let index = 0; index < words.length; index++) {
    const raw = words[index]!.replace(/^[^\p{L}]+|[^\p{L}']+$/gu, '')
    if (!/^\p{Lu}/u.test(raw) || raw.length < 3) continue
    if (NOT_A_CLAIM.has(raw)) continue
    const previous = index > 0 ? words[index - 1]! : ''
    if (index === 0 || /[.:;?!"”]$/.test(previous)) continue
    found.push(raw)
  }
  return [...new Set(found)]
}

/** Numbers are claims too — for a timeline card, the claim. */
const numbers = (text: string): string[] => [
  ...new Set((text.match(/\d[\d,]*/g) ?? []).map(value => value.replace(/,/g, ''))),
]

// --- Parse the review file into slug -> lead ----------------------------------
const leads = new Map<string, string>()
for (const block of readFileSync(REVIEW_PATH, 'utf-8').split('### ')) {
  const trimmed = block.trim()
  if (!trimmed) continue
  const lines = trimmed.split('\n')
  const slug = lines[0]!.split('\t')[0]!
  if (lines.some(line => line.startsWith('!!'))) continue
  leads.set(
    slug,
    lines
      .slice(1)
      .filter(line => !line.startsWith('@'))
      .join(' ')
  )
}

let checked = 0
let flagged = 0
let noSource = 0

for (const seed of EVENT_SEEDS) {
  const slug = slugify(seed.name)
  const lead = leads.get(slug)
  if (!lead) {
    noSource++
    console.warn(`? ${slug}: no lead in the review file — cannot verify`)
    continue
  }

  checked++
  const haystack = strip(lead)
  const leadNumbers = new Set(numbers(lead))
  // The card's own year is verified against Wikidata by the generator — the
  // description repeating it is never a fresh claim.
  leadNumbers.add(String(Math.abs(seed.year)))

  const unsupportedNouns = properNouns(seed.description).filter(noun => {
    const stem = strip(noun).replace(/'s$/, '')
    return !haystack.includes(stem.slice(0, Math.max(4, stem.length - 2)))
  })

  const unsupportedNumbers = numbers(seed.description).filter(value => {
    if (leadNumbers.has(value)) return false
    if (value.length <= 2) {
      for (const known of leadNumbers) if (known.length === 4 && known.endsWith(value)) return false
    }
    return true
  })

  if (unsupportedNouns.length || unsupportedNumbers.length) {
    flagged++
    console.log(`\n✗ ${slug}`)
    if (unsupportedNouns.length) console.log(`    proper nouns: ${unsupportedNouns.join(', ')}`)
    if (unsupportedNumbers.length) console.log(`    numbers:      ${unsupportedNumbers.join(', ')}`)
  }
}

console.log(
  `\n${checked} descriptions checked · ${flagged} with unsupported claims · ${noSource} unverifiable`
)
if (flagged) {
  console.log('\nEach flagged word appears in the description but not in its Wikipedia lead.')
  console.log('Rewrite the line from the lead, or confirm the word is a harmless paraphrase.')
}
