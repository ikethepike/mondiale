import { ANTHEMS } from '~~/data/anthems.gen'
import type { AnthemEntry } from '~~/generators/create-anthems-file'
import type { ISOCountryCode } from '~~/types/geography.types'
import { countryInProse, countryName } from './country'
import { listJoin } from './strings'

/**
 * Anthems sung to one melody under different words. The round plays the tune,
 * so a listener who names any of them heard it right.
 */
export const SHARED_MELODIES: readonly (readonly ISOCountryCode[])[] = [
  ['GR', 'CY'],
  ['GB', 'LI'],
  ['FI', 'EE'],
  // South Africa's anthem opens on Nkosi Sikelel' iAfrika, and the clip plays from the top.
  ['ZA', 'TZ', 'ZM'],
]

const TUNE_GROUPS = (() => {
  const byRecording = new Map<string, ISOCountryCode[]>()
  for (const [isoCode, anthem] of Object.entries(ANTHEMS) as [ISOCountryCode, AnthemEntry][]) {
    if (!anthem.sourceFile) continue
    byRecording.set(anthem.sourceFile, [...(byRecording.get(anthem.sourceFile) ?? []), isoCode])
  }

  const groups = new Map<ISOCountryCode, ReadonlySet<ISOCountryCode>>()
  for (const members of [...SHARED_MELODIES, ...byRecording.values()]) {
    const merged = new Set(members.flatMap(isoCode => [...(groups.get(isoCode) ?? [isoCode])]))
    for (const isoCode of merged) groups.set(isoCode, merged)
  }
  return groups
})()

/**
 * Every country whose anthem is the dealt one's tune — the dealt country
 * first, then the rest by name. A melody table entry or a shared Commons
 * recording both join a group.
 */
export const sharedTuneCountries = (dealt: ISOCountryCode): ISOCountryCode[] => [
  dealt,
  ...[...(TUNE_GROUPS.get(dealt) ?? [])]
    .filter(isoCode => isoCode !== dealt)
    .sort((a, b) => countryName(a).localeCompare(countryName(b))),
]

/** Whether a buzz names the dealt anthem's tune. The view pays on it and the
 *  server grades with it, so the two can never disagree about a sibling. */
export const anthemTuneMatches = (dealt: ISOCountryCode, guess: ISOCountryCode): boolean =>
  sharedTuneCountries(dealt).includes(guess)

/** "Same tune as Greece" — undefined for an anthem with a tune of its own. */
export const sharedTuneLine = (dealt: ISOCountryCode): string | undefined => {
  const siblings = sharedTuneCountries(dealt).slice(1)
  return siblings.length ? `Same tune as ${listJoin(siblings.map(countryInProse))}` : undefined
}
