import { existsSync, readFileSync } from 'node:fs'
import { LANDMARK_FACTS } from './data/landmark-facts'

/**
 * Flags descriptions in landmark-facts that assert something their Wikipedia
 * lead does not, so a confident line written from memory rather than from the
 * source cannot slip through.
 *
 * It cannot check meaning, only the two things a description can be wrong about
 * in a way that matters: its NUMBERS and its PROPER NOUNS. A date, a height, a
 * count, an emperor, a river — each must appear in the lead the description was
 * condensed from. "Napoleon died before it was finished" fails, because
 * Napoleon is nowhere in the source; "an abbey on a tidal island" passes,
 * because paraphrase invents no facts.
 *
 * Verbs and adjectives are deliberately ignored. Flagging "hilltop" or "begun"
 * would bury the one line that says 1561 when the source says 1555.
 *
 * Run after editing landmark-facts, with the review file already fetched:
 *   bun run generators/fetch-landmark-facts.ts
 *   bun run generators/check-landmark-facts.ts
 */

const REVIEW_PATH = 'generators/data/landmark-facts-review.txt'

if (!existsSync(REVIEW_PATH)) {
  console.error(`No ${REVIEW_PATH}. Run: bun run generators/fetch-landmark-facts.ts`)
  process.exit(1)
}

/**
 * Capitalised words that open a sentence, or that are simply too generic to be
 * a checkable claim about the place.
 */
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
  'Twelve',
  'Twenty',
  'Built',
  'Begun',
  'Raised',
  'Now',
  'Already',
  'Just',
  'Locally',
  'Europe',
  'European',
  'World',
  'Fair',
])

const strip = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * Proper nouns: capitalised words that are not merely starting a sentence.
 * These carry the facts a description can get wrong — Vespasian, Vesuvius,
 * Gaudí, the Kremlin.
 */
const properNouns = (text: string): string[] => {
  const words = text.split(/[\s—–]+/)
  const found: string[] = []
  for (let index = 0; index < words.length; index++) {
    const raw = words[index]!.replace(/^[^\p{L}]+|[^\p{L}']+$/gu, '')
    if (!/^\p{Lu}/u.test(raw) || raw.length < 3) continue
    if (NOT_A_CLAIM.has(raw)) continue
    // Skip the first word of a sentence — capitalisation there means nothing.
    const previous = index > 0 ? words[index - 1]! : ''
    if (index === 0 || /[.:;?!]$/.test(previous)) continue
    found.push(raw)
  }
  return [...new Set(found)]
}

/** Numbers are claims too: a year, a height, a count. */
const numbers = (text: string): string[] => [
  ...new Set((text.match(/\d[\d,]*/g) ?? []).map(value => value.replace(/,/g, ''))),
]

// --- Parse the review file into slug -> lead --------------------------------
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

for (const [slug, description] of Object.entries(LANDMARK_FACTS)) {
  const lead = leads.get(slug)
  if (!lead) {
    noSource++
    console.warn(`? ${slug}: no lead in the review file — cannot verify`)
    continue
  }

  checked++
  const haystack = strip(lead)
  const leadNumbers = new Set(numbers(lead))

  const unsupportedNouns = properNouns(description).filter(noun => {
    // Match on a stem, so "Romans" finds "Roman" and "Gaudí's" finds "Gaudí".
    const stem = strip(noun).replace(/'s$/, '')
    return !haystack.includes(stem.slice(0, Math.max(4, stem.length - 2)))
  })

  const unsupportedNumbers = numbers(description).filter(value => {
    if (leadNumbers.has(value)) return false
    // "1555–61" is shorthand for 1561: accept a suffix of a year in the lead.
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
