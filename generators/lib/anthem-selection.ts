import type { AnthemEntry } from '../create-anthems-file'
import { isInstrumental, isPlayable } from '../anthem-corroboration'
import { ANTHEM_OVERRIDES } from '../data/anthem-titles'
import type { ISOCountryCode } from '../../types/geography.types'

/**
 * The pure half of `create-anthems-file.ts`, which runs its whole fetch at
 * import. A country can hold several current anthems (New Zealand lists "God
 * Save the King" beside "God Defend New Zealand"); folding their rows into one
 * entry once put one anthem's title and composer on another's audio, so every
 * field of an entry comes from ONE anthem item.
 */

export interface AnthemRow {
  isoCode: ISOCountryCode
  anthem: string
  title?: string
  file?: string
  adoptedYear?: number
  composer?: string
  /** The item's P31 class or the statement's P3831 role reads "royal anthem". */
  royal?: boolean
}

export interface AnthemCandidate {
  anthem: string
  title: string
  files: string[]
  adoptedYear?: number
  composer?: string
  royal: boolean
}

/** An unlabelled item surfaces as its Q-id, an unknown value as a genid URL. */
export const isLabel = (value: string | undefined): value is string =>
  !!value?.trim() && !/^Q\d+$/.test(value) && !/^https?:\/\//i.test(value)

/** Wikidata labels that describe an anthem rather than name it. */
export const RAW_ANTHEM_LABEL =
  /\b(?:national|state|royal)(?:\s+state)?\s+anthem\b|\banthem of\b|\bstanza of\b/i

export const groupAnthemCandidates = (
  rows: AnthemRow[]
): Map<ISOCountryCode, AnthemCandidate[]> => {
  const byCountry = new Map<ISOCountryCode, Map<string, AnthemCandidate>>()
  for (const row of rows) {
    if (!isLabel(row.title)) continue
    const anthems = byCountry.get(row.isoCode) ?? new Map<string, AnthemCandidate>()
    byCountry.set(row.isoCode, anthems)

    const candidate = anthems.get(row.anthem) ?? {
      anthem: row.anthem,
      title: row.title,
      files: [],
      royal: false,
    }
    if (row.file && isPlayable(row.file) && !candidate.files.includes(row.file)) {
      candidate.files.push(row.file)
    }
    if (candidate.adoptedYear === undefined && Number.isFinite(row.adoptedYear)) {
      candidate.adoptedYear = row.adoptedYear
    }
    if (!candidate.composer && isLabel(row.composer)) candidate.composer = row.composer
    candidate.royal ||= !!row.royal
    anthems.set(row.anthem, candidate)
  }
  return new Map([...byCountry].map(([isoCode, anthems]) => [isoCode, [...anthems.values()]]))
}

/**
 * The one anthem a country ships: its national anthem over a royal one, its
 * own over one another country also lists (the Commonwealth realms' "God Save
 * the King", Iraq's "Mawtini"), then one with a recording over one without.
 */
export const pickAnthem = (
  candidates: AnthemCandidate[],
  countriesHolding: (anthem: string) => number
): AnthemCandidate | undefined =>
  candidates
    .map((candidate, order) => ({ candidate, order }))
    .sort(
      (a, b) =>
        Number(a.candidate.royal) - Number(b.candidate.royal) ||
        countriesHolding(a.candidate.anthem) - countriesHolding(b.candidate.anthem) ||
        Number(!a.candidate.files.length) - Number(!b.candidate.files.length) ||
        a.order - b.order
    )[0]?.candidate

export const pickAnthemFile = (candidate: AnthemCandidate): string | undefined =>
  candidate.files.find(isInstrumental) ?? candidate.files[0]

/** Every country's chosen anthem, judged against the whole table's statements. */
export const chooseAnthems = (rows: AnthemRow[]): Map<ISOCountryCode, AnthemCandidate> => {
  const grouped = groupAnthemCandidates(rows)
  const holders = new Map<string, number>()
  for (const candidates of grouped.values()) {
    for (const { anthem } of candidates) holders.set(anthem, (holders.get(anthem) ?? 0) + 1)
  }
  const chosen = new Map<ISOCountryCode, AnthemCandidate>()
  for (const [isoCode, candidates] of grouped) {
    const pick = pickAnthem(candidates, anthem => holders.get(anthem) ?? 0)
    if (pick) chosen.set(isoCode, pick)
  }
  return chosen
}

export const curatedTitle = (isoCode: ISOCountryCode, title: string): string =>
  ANTHEM_OVERRIDES[isoCode]?.title ?? title

/** The curated overrides applied, and a composer that is no name dropped. */
export const curateAnthem = (isoCode: ISOCountryCode, entry: AnthemEntry): AnthemEntry => {
  const curated: AnthemEntry = { ...entry, ...ANTHEM_OVERRIDES[isoCode] }
  if (curated.composer !== undefined && !isLabel(curated.composer)) delete curated.composer
  return curated
}

/** A shipped title that still reads like a description, with no override vouching for it. */
export const isUncuratedRawLabel = (isoCode: ISOCountryCode, title: string): boolean =>
  RAW_ANTHEM_LABEL.test(title) && ANTHEM_OVERRIDES[isoCode]?.title !== title
