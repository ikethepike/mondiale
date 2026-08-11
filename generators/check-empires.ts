/**
 * Advisory linter for the empire roster — editorial and structural checks the
 * generator deliberately does NOT enforce with throws. The generator gates
 * everything that could crash a room (ISO codes, keyframe menus, the Europe
 * quota); this checks what makes the roster GOOD: fame spread, blurb register,
 * cross-links, and per-board coverage. Findings are printed, never fatal —
 * the curator owns the judgment.
 *
 * Run after editing empire seeds:
 *   bun run generators/check-empires.ts
 */
import { EVENTS } from '../data/events.gen'
import { variantCountries } from '../lib/variant'
import { gameVariants } from '../types/game.types'
import { EMPIRE_SEEDS } from './data/empire-seeds'
import type { EmpireRegion } from './data/empire-seeds'
import { FAME_TIERS, type Fame } from '../types/fame.types'

const findings: string[] = []
const flag = (id: string, message: string) => findings.push(`✗ ${id}: ${message}`)

// --- Blurb register: length, and no celebratory vocabulary ---------------------
const CELEBRATORY =
  /\b(glorious|great(est)? civili[sz]ation|magnificent|golden age of conquest|heroic|mighty|legendary|triumphant)\b/i

for (const seed of EMPIRE_SEEDS) {
  if (seed.blurb.length < 80 || seed.blurb.length > 300)
    flag(seed.id, `blurb is ${seed.blurb.length} chars (aim for 80–300)`)
  const celebratory = CELEBRATORY.exec(seed.blurb)
  if (celebratory) flag(seed.id, `blurb reads celebratory: "${celebratory[0]}"`)

  // Cross-links resolve against the CURRENT events build — advisory because
  // events can drop on their own regen; the reveal tolerates a dangle.
  for (const slug of seed.eventSlugs ?? []) {
    if (!EVENTS[slug]) flag(seed.id, `eventSlug '${slug}' resolves to nothing in data/events.gen`)
  }

  // Options show flags only when every option has one — flagless majors pull
  // their rounds toward text cards. Fine when no honest banner exists.
  if (seed.fame === 'major' && !seed.commons)
    flag(seed.id, 'major without a flag — its option rounds fall back to text cards')
}

// --- Fame spread per region ----------------------------------------------------
// Easy deals `major` and nothing else, so a region short of them silently
// drops off the easy board; a region that is ALL major has nothing for hard to
// dig for. Two per tier-floor is the working minimum — the dealer never
// repeats an empire within a game.
const MINIMUM_MAJORS = 2
const regions = new Map<EmpireRegion, { [fame in Fame]: number }>()
for (const seed of EMPIRE_SEEDS) {
  const bucket = regions.get(seed.region) ?? { major: 0, minor: 0, obscure: 0 }
  bucket[seed.fame]++
  regions.set(seed.region, bucket)
}
for (const [region, counts] of regions) {
  if (counts.major < MINIMUM_MAJORS)
    findings.push(
      `✗ region ${region}: ${counts.major} major — an easy table sees it at most ${counts.major} time(s) a game`
    )
  if (!counts.minor && !counts.obscure && EMPIRE_SEEDS.length > 20)
    findings.push(`✗ region ${region}: all major — hard mode has nothing to dig for there`)
}

// --- Per-board coverage: each continental variant should have something to deal
for (const variant of gameVariants) {
  if (variant === 'world') continue
  const pool = new Set(variantCountries(variant))
  const containable = EMPIRE_SEEDS.filter(
    seed => seed.members.core.length >= 2 && seed.members.core.every(code => pool.has(code))
  )
  if (containable.length < 2)
    findings.push(
      `✗ variant ${variant}: only ${containable.length} empire(s) fully inside the board — the mode falls back to ranking there`
    )
}

// --- Report --------------------------------------------------------------------
if (findings.length) {
  console.info(findings.join('\n'))
} else {
  console.info('✓ all clear')
}
console.info(
  `\n${EMPIRE_SEEDS.length} seeds · ${FAME_TIERS.map(fame => `${fame}:${EMPIRE_SEEDS.filter(seed => seed.fame === fame).length}`).join(' ')}` +
    `\n${[...regions.entries()].map(([region, counts]) => `${region}:${FAME_TIERS.map(fame => counts[fame]).join('/')}`).join(' ')} (major/minor/obscure)`
)
