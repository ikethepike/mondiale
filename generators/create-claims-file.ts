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

  writeFileSync(REPORT_FILE, claimsReport(claims, coverage))
  writeFileSync(
    OUTPUT_FILE,
    `// This is a generated file, don't touch it.
// Generated at: ${new Date().toISOString()}
import type { Claim } from '~~/types/two-truths.types'

export const CLAIMS: Claim[] = JSON.parse(${JSON.stringify(JSON.stringify(claims))})
`
  )
  console.log(`Claims: ${claims.length}. ${coverage.join(' · ')}`)
  console.log(`Finished creating file: ${OUTPUT_FILE}`)
}

createClaimsFile()
