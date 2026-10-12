import { describe, expect, it } from 'vitest'
import { CLAIMS } from '~~/data/claims.gen'
import { buildClaims } from './claims'

describe('the committed Two Truths deck', () => {
  // The verdicts are the answer key: a dataset refresh that flips one must
  // fail here until `bun run generate:claims` re-stamps the deck.
  it('is exactly what the builders derive from the shipped datasets', () => {
    const rebuilt = buildClaims()
    expect(rebuilt.map(claim => `${claim.id}:${claim.truth}`)).toEqual(
      CLAIMS.map(claim => `${claim.id}:${claim.truth}`)
    )
    expect(rebuilt).toEqual(CLAIMS)
  })
})
