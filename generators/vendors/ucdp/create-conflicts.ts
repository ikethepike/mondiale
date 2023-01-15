import { writeFileSync } from 'fs'
import { ISOCountryCode, isValidISOCode } from '~~/types/geography.types'
import { UCDPResponse } from '~~/types/vendor/ucdp/ucdp.responses'
import { GWToISOCode } from './gwcodes'

const OUTPUT_FILE = `data/conflicts.gen.ts`

export type ConflictMapping = {
  [country in ISOCountryCode]?: {
    conflicts: number
  }
}

enum UCDPRegion {
  'europe' = 1,
  'middle east' = 2,
  'asia' = 3,
  'africa' = 4,
  'americas' = 5,
}

export const createConflictsMapping = async () => {
  let conflictParties: number[] = []
  let processing = true
  let page = 0

  const conflictMapping: ConflictMapping = {}

  while (processing) {
    try {
      console.info(`Making request #${page}`)
      const response = await fetch(
        `https://ucdpapi.pcr.uu.se/api/dyadic/22.1?pagesize=1000&page=${page++}`,
        {
          headers: {
            Content: 'application/json',
          },
        }
      )
      const parsed: UCDPResponse = await response.json()

      for (const conflict of parsed.Result) {
        conflictParties = conflictParties.concat(
          [
            conflict.gwno_a,
            conflict.gwno_b,
            ...conflict.gwno_a_2nd.split(','),
            ...conflict.gwno_b_2nd.split(','),
          ]
            .filter(Boolean)
            .map(value => Number(value))
        )
      }

      processing = !!parsed.NextPageUrl
    } catch (e) {
      processing = false
      return Promise.reject(e)
    }
  }

  for (const [isoCode, gwCode] of Object.entries(GWToISOCode)) {
    if (!isValidISOCode(isoCode)) continue // bypass unsupported nations
    conflictMapping[isoCode] = {
      conflicts: conflictParties.filter(party => party === gwCode).length,
    }
  }

  try {
    writeFileSync(
      OUTPUT_FILE,
      `
      import { ConflictMapping } from 'generators/vendors/ucdp/create-conflicts'
      export const conflictMapping: ConflictMapping = ${JSON.stringify(conflictMapping)}
    `
    )
  } catch (error) {}
}

createConflictsMapping()
