import type { AnthemEntry } from '../create-anthems-file'
import { isInstrumental, isPlayable } from '../anthem-corroboration'
import { ANTHEM_OVERRIDES } from '../data/anthem-titles'
import { COUNTRIES } from '../../data/countries.gen'
import { ISOCountryCodes } from '../../data/iso-codes.gen'
import { spokenLanguages } from '../../lib/language-rounds'
import type { ISOCountryCode } from '../../types/geography.types'

/** The pure half of `create-anthems-file.ts`: every field of an entry comes from
 *  ONE of the country's anthem items, never a blend of several. */

export interface AnthemRow {
  isoCode: ISOCountryCode
  anthem: string
  title?: string
  file?: string
  writtenYear?: number
  composer?: string
  /** The item's P31 class or the statement's P3831 role reads "royal anthem". */
  royal?: boolean
}

export interface AnthemCandidate {
  anthem: string
  title: string
  files: string[]
  writtenYear?: number
  composer?: string
  royal: boolean
}

export interface AnthemChoice {
  anthem: AnthemCandidate
  passedOver: { title: string; reason: string }[]
}

/** An unlabelled item surfaces as its Q-id, an unknown value as a genid URL. */
export const isLabel = (value: string | undefined): value is string =>
  !!value?.trim() && !/^Q\d+$/.test(value) && !/^https?:\/\//i.test(value)

/** Wikidata's P86 sometimes holds the lyrics' language ("Seychellois Creole"). */
const NOT_A_COMPOSER = new Set(
  ISOCountryCodes.flatMap(code => [...spokenLanguages(code), COUNTRIES[code]?.name.english])
)

export const isComposerName = (value: string | undefined): value is string =>
  isLabel(value) && !NOT_A_COMPOSER.has(value)

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
    if (candidate.writtenYear === undefined && Number.isFinite(row.writtenYear)) {
      candidate.writtenYear = row.writtenYear
    }
    if (!candidate.composer && isComposerName(row.composer)) candidate.composer = row.composer
    candidate.royal ||= !!row.royal
    anthems.set(row.anthem, candidate)
  }
  return new Map([...byCountry].map(([isoCode, anthems]) => [isoCode, [...anthems.values()]]))
}

interface Ranked {
  candidate: AnthemCandidate
  holders: number
  order: number
}

const RANKING: { key: (ranked: Ranked) => number; lost: (ranked: Ranked) => string }[] = [
  { key: ({ candidate }) => Number(candidate.royal), lost: () => 'royal anthem' },
  { key: ({ holders }) => holders, lost: ({ holders }) => `held by ${holders} countries` },
  { key: ({ candidate }) => Number(!candidate.files.length), lost: () => 'no playable recording' },
  { key: ({ order }) => order, lost: () => 'listed later' },
]

/** National over royal, a country's own over one others also list ("God Save the
 *  King", "Mawtini"), then one with a recording. */
export const pickAnthem = (
  candidates: AnthemCandidate[],
  countriesHolding: (anthem: string) => number
): AnthemChoice | undefined => {
  const ranked = candidates
    .map((candidate, order) => ({ candidate, holders: countriesHolding(candidate.anthem), order }))
    .sort((a, b) => {
      for (const { key } of RANKING) {
        if (key(a) !== key(b)) return key(a) - key(b)
      }
      return 0
    })
  const [winner, ...rest] = ranked
  if (!winner) return undefined
  return {
    anthem: winner.candidate,
    passedOver: rest.map(loser => ({
      title: loser.candidate.title,
      reason: RANKING.find(({ key }) => key(loser) !== key(winner))?.lost(loser) ?? 'listed later',
    })),
  }
}

export const pickAnthemFile = (candidate: AnthemCandidate): string | undefined =>
  candidate.files.find(isInstrumental) ?? candidate.files[0]

/** Every country's chosen anthem, judged against the whole table's statements. */
export const chooseAnthems = (rows: AnthemRow[]): Map<ISOCountryCode, AnthemChoice> => {
  const grouped = groupAnthemCandidates(rows)
  const holders = new Map<string, number>()
  for (const candidates of grouped.values()) {
    for (const { anthem } of candidates) holders.set(anthem, (holders.get(anthem) ?? 0) + 1)
  }
  const chosen = new Map<ISOCountryCode, AnthemChoice>()
  for (const [isoCode, candidates] of grouped) {
    const choice = pickAnthem(candidates, anthem => holders.get(anthem) ?? 0)
    if (choice) chosen.set(isoCode, choice)
  }
  return chosen
}

export const curatedTitle = (isoCode: ISOCountryCode, title: string): string =>
  ANTHEM_OVERRIDES[isoCode]?.title ?? title

/** The curated overrides applied, and a composer that is no name dropped. */
export const curateAnthem = (isoCode: ISOCountryCode, entry: AnthemEntry): AnthemEntry => {
  const { title, composer, writtenYear } = ANTHEM_OVERRIDES[isoCode] ?? {}
  const curated: AnthemEntry = { ...entry, ...(title ? { title } : {}) }
  if (composer !== undefined) curated.composer = composer ?? undefined
  if (writtenYear !== undefined) curated.writtenYear = writtenYear ?? undefined
  if (!isComposerName(curated.composer)) delete curated.composer
  if (curated.writtenYear === undefined) delete curated.writtenYear
  return curated
}

/** A shipped title that still reads like a description, with no override vouching for it. */
export const isUncuratedRawLabel = (isoCode: ISOCountryCode, title: string): boolean =>
  RAW_ANTHEM_LABEL.test(title) && ANTHEM_OVERRIDES[isoCode]?.title !== title
