import { writeFileSync } from 'fs'
import { COUNTRIES } from '~~/data/countries.gen'
import { assembleSheet, TWO_TRUTHS_TUNING } from '~~/lib/two-truths'
import { isFameDealable } from '~~/types/fame.types'
import type { GameDifficulty } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'
import { buildClaims, claimsReport } from './lib/claims'

const OUTPUT_FILE = 'data/claims.gen.ts'
const REPORT_FILE = 'generators/data/claims-report.txt'

/**
 * The Two Truths deck: every claim the round may deal, derived from the
 * shipped datasets and stamped with its truth, plausibility and fame. Server
 * only — the truths are the answer key (see `loadTwoTruthsAnswers`).
 *
 *   bun run generate:claims
 */
const createClaimsFile = () => {
  const claims = buildClaims()

  const coverage = (['easy', 'normal', 'hard'] as GameDifficulty[]).map(difficulty => {
    const dealable = (Object.keys(COUNTRIES) as ISOCountryCode[]).filter(subject => {
      const own = claims.filter(
        claim => claim.subject === subject && isFameDealable(claim.fame, difficulty)
      )
      return TWO_TRUTHS_TUNING.lies.some(lies =>
        Array.from({ length: 4 }).some(() => assembleSheet(own, lies))
      )
    })
    return `${difficulty.padEnd(7)} ${dealable.length} subjects`
  })

  // Evidence repeats across a subject's claims (every border claim shows the
  // same neighbours), so it ships once and claims point at it — the inline
  // deck was a 2MB string the preview builder ran out of memory on.
  const evidence: string[] = []
  const evidenceIndex = new Map<string, number>()
  const rows = claims.map(claim => {
    const key = JSON.stringify(claim.evidence)
    if (!evidenceIndex.has(key)) {
      evidenceIndex.set(key, evidence.length)
      evidence.push(key)
    }
    return { ...claim, evidence: evidenceIndex.get(key)! }
  })

  writeFileSync(REPORT_FILE, claimsReport(claims, coverage))
  writeFileSync(
    OUTPUT_FILE,
    `// This is a generated file, don't touch it.
// Generated at: ${new Date().toISOString()}
import type { Claim, ClaimEvidence } from '~~/types/two-truths.types'

const EVIDENCE: ClaimEvidence[] = JSON.parse(${JSON.stringify(`[${evidence.join(',')}]`)})

const ROWS: (Omit<Claim, 'evidence'> & { evidence: number })[] = JSON.parse(${JSON.stringify(JSON.stringify(rows))})

export const CLAIMS: Claim[] = ROWS.map(row => ({ ...row, evidence: EVIDENCE[row.evidence]! }))
`
  )
  console.log(`Claims: ${claims.length}. ${coverage.join(' · ')}`)
  console.log(`Finished creating file: ${OUTPUT_FILE}`)
}

createClaimsFile()
