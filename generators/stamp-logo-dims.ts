import { PARTIES } from '../data/parties.gen'
import { jsonParseLiteral } from './lib/emit'
import { webpDimensions } from './vendors/wikidata/commons'
import type { PartyMapping } from '../types/party.types'

/**
 * Stamp `logoRatio` onto every party whose logo is already on disk.
 *
 * A LOCAL pass, deliberately. The shape could be captured during
 * `create-polity-file`'s own download loop (and now is, for future runs), but
 * re-running that generator to acquire it would refetch the live polity feed
 * and rewrite rosters, seat counts and standings as a side effect of what is
 * purely a geometry fix — an unreviewable diff, touching the Government round.
 *
 * The 1709 saved logos already hold their dimensions in their file headers, so
 * this reads them straight off disk: no network, no decode, ~190ms for the lot.
 *
 * Idempotent — re-running stamps the same values.
 */

const PUBLIC_DIRECTORY = 'public'

const main = async () => {
  const mapping = structuredClone(PARTIES) as PartyMapping

  let stamped = 0
  let missing = 0
  let unreadable = 0
  for (const entry of Object.values(mapping)) {
    for (const party of entry.parties) {
      if (!party.logo) continue
      const size = webpDimensions(`${PUBLIC_DIRECTORY}${party.logo}`)
      if (!size?.width || !size.height) {
        unreadable += 1
        process.stdout.write(`  unreadable: ${party.logo}\n`)
        continue
      }
      party.logoRatio = Math.round((size.width / size.height) * 1000) / 1000
      stamped += 1
    }
  }
  for (const entry of Object.values(mapping)) {
    missing += entry.parties.filter(party => party.logo && party.logoRatio === undefined).length
  }

  process.stdout.write(`  ${stamped} logos stamped, ${unreadable} unreadable, ${missing} missing\n`)
  if (!stamped) throw new Error('stamped nothing — refusing to rewrite the dataset')

  const source = await Bun.file('data/parties.gen.ts').text()
  // Keep the provenance header exactly as create-polity-file wrote it: this
  // pass adds a field, it does not re-source the data, and rewriting the
  // header would lie about where the roster came from.
  const header = source.slice(0, source.indexOf('export const PARTIES'))
  await Bun.write(
    'data/parties.gen.ts',
    `${header}export const PARTIES: PartyMapping = ${jsonParseLiteral(mapping)}\n`
  )
  process.stdout.write('wrote data/parties.gen.ts\n')
}

await main()
