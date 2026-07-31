import { describe, expect, it } from 'vitest'
import { ANTHEMS } from '~~/data/anthems.gen'
import { COUNTRIES } from '~~/data/countries.gen'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * Guards the anthem dataset against the failure that shipped once already:
 * Afghanistan carrying the US Air Force Band playing the Star-Spangled Banner.
 *
 * Commons search ranks by relevance, not by correctness — querying an ISO code
 * happily returns some other nation's anthem. The generator now requires each
 * filename to corroborate the anthem or country, and records `sourceFile` so
 * the claim stays checkable here rather than only being audible in a round.
 */
describe('anthem dataset', () => {
  const entries = Object.entries(ANTHEMS) as [ISOCountryCode, (typeof ANTHEMS)[ISOCountryCode]][]

  it('ships both encodings for every country', () => {
    const broken = entries.filter(([, entry]) => !entry?.webm || !entry?.m4a)
    expect(broken.map(([iso]) => iso)).toEqual([])
  })

  it('names an anthem for every country', () => {
    expect(entries.filter(([, entry]) => !entry?.title?.trim()).map(([iso]) => iso)).toEqual([])
  })

  it('never serves one country the clip of another', () => {
    // Two countries pointing at the same audio means a search fallback matched
    // the wrong nation — the exact shape of the Afghanistan/US bug.
    const byClip = new Map<string, ISOCountryCode[]>()
    for (const [iso, entry] of entries) {
      if (!entry?.webm) continue
      byClip.set(entry.webm, [...(byClip.get(entry.webm) ?? []), iso])
    }
    const shared = [...byClip.entries()].filter(([, isoCodes]) => isoCodes.length > 1)
    expect(shared).toEqual([])
  })

  it('keeps every clip pointing at its own country code', () => {
    // public/anthems/<ISO>.webm — a path that disagrees with its key means a
    // merge crossed two entries.
    const mismatched = entries.filter(
      ([iso, entry]) => entry?.webm && !entry.webm.endsWith(`/${iso}.webm`)
    )
    expect(mismatched.map(([iso]) => iso)).toEqual([])
  })

  it('never ships a superseded, synthesised or politically loaded take', () => {
    // A "former" anthem is the wrong answer to "whose anthem is this"; a MIDI
    // render sounds nothing like the real thing; a Francoist-era recording is
    // not what should play in a party game.
    const unusable = /\b(midi|former|historic(al)?|francoist|nazi|soviet|colonial)\b/i
    const offenders = entries.filter(([, entry]) => entry?.sourceFile && unusable.test(entry.sourceFile))
    expect(offenders.map(([iso, entry]) => `${iso}: ${entry?.sourceFile}`)).toEqual([])
  })

  it('corroborates every SEARCH-sourced clip by name', () => {
    // Wikidata-sourced clips are vouched for by the anthem item's own P51 link,
    // so their filenames need not spell the country out ("Kimi ga Yo
    // instrumental" is fine for JP). Search-sourced ones have no such link —
    // Commons merely ranked them — so the filename is the only evidence there
    // is, and it must name the anthem or the country.
    const STOPWORDS = new Set(['the', 'of', 'and', 'national', 'anthem', 'instrumental', 'state'])
    const words = (text: string) =>
      text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .split(/[^a-z0-9]+/)
        .filter(word => word.length > 2 && !STOPWORDS.has(word))

    const unverifiable = entries.filter(([iso, entry]) => {
      if (!entry?.sourceFile) return false // pre-existing rows without provenance
      if (entry.sourcedBy !== 'search') return false
      const haystack = words(entry.sourceFile)
      const wanted = [...words(entry.title ?? ''), ...words(COUNTRIES[iso]?.name.english ?? '')]
      const stem = (word: string) => word.slice(0, Math.max(4, word.length - 3))
      return !wanted.some(word => haystack.some(found => found.startsWith(stem(word))))
    })

    expect(unverifiable.map(([iso, entry]) => `${iso}: ${entry?.sourceFile}`)).toEqual([])
  })
})
