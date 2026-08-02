import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { ANTHEMS } from '~~/data/anthems.gen'
import { COUNTRIES } from '~~/data/countries.gen'
import { ATTRIBUTION_FREE, corroborates, isPlayable } from '~~/generators/anthem-corroboration'
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

  // The sweep spawns one ffprobe per shipped clip (~183, serially) — a
  // data-pipeline check, not a unit test, so machines without ffmpeg skip it
  // LOUDLY rather than crashing on a null stdout or silently vouching.
  const ffprobeAvailable = spawnSync('ffprobe', ['-version']).status === 0
  if (!ffprobeAvailable) {
    console.warn('anthems.test: ffprobe not on PATH — skipping the clip sample-rate sweep')
  }

  it.skipIf(!ffprobeAvailable)('ships every clip at one sample rate', () => {
    // `loudnorm` resamples to 192kHz internally and passes that downstream, so
    // an unpinned AAC encode once shipped 96kHz m4a files — double speed, and
    // audible ONLY on Safari, which prefers the m4a over the (correct) webm.
    // Opus is 48kHz-only, so the webm was always right and hid the bug.
    const probe = (file: string) => {
      const result = spawnSync(
        'ffprobe',
        ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=sample_rate', '-of', 'csv=p=0', file],
        { encoding: 'utf8' }
      )
      // stdout is null when the spawn itself failed — surface WHICH file and
      // why instead of a bare TypeError from `.trim()`.
      if (result.error || result.stdout === null) {
        throw new Error(`ffprobe failed for ${file}: ${result.error?.message ?? 'no output'}`)
      }
      return result.stdout.trim()
    }

    const offRate = entries
      .filter(([, entry]) => entry?.m4a)
      .map(([iso, entry]) => [iso, probe(`public${entry!.m4a}`)] as const)
      .filter(([, rate]) => rate && rate !== '48000')

    expect(offRate.map(([iso, rate]) => `${iso}: ${rate}Hz`)).toEqual([])
    // One ffprobe per shipped clip — well past the 5s default.
  }, 60_000)

  it('ships both encodings for every country', () => {
    const broken = entries.filter(([, entry]) => !entry?.webm || !entry?.m4a)
    expect(broken.map(([iso]) => iso)).toEqual([])
  })

  it('names an anthem for every country', () => {
    expect(entries.filter(([, entry]) => !entry?.title?.trim()).map(([iso]) => iso)).toEqual([])
  })

  it('names an author on every clip whose licence demands one', () => {
    // Public-domain and CC0 files need no author. CC BY / CC BY-SA do — using
    // one without attribution is a licence breach, not a cosmetic gap. Commons
    // occasionally publishes the licence with no Artist field, so this catches
    // the files that would ship uncredited — judged by the generator's own
    // ATTRIBUTION_FREE, imported so the two can't drift.
    const uncredited = entries.filter(
      ([, entry]) => entry?.license && !ATTRIBUTION_FREE.test(entry.license) && !entry.credit
    )
    expect(uncredited.map(([iso, entry]) => `${iso}: ${entry?.license}`)).toEqual([])
  })

  it('records a licence for every shipped clip', () => {
    expect(entries.filter(([, entry]) => !entry?.license).map(([iso]) => iso)).toEqual([])
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

  it('never ships a take the generator itself calls unusable', () => {
    // THE generator's own predicate, imported, not a re-typed copy — the copy
    // this test once held had already drifted ("1st version" was missing), so
    // it was vouching with a weaker rule than the one it claimed to lock in.
    const offenders = entries.filter(
      ([, entry]) => entry?.sourceFile && !isPlayable(entry.sourceFile)
    )
    expect(offenders.map(([iso, entry]) => `${iso}: ${entry?.sourceFile}`)).toEqual([])
  })

  it('corroborates every SEARCH-sourced clip with the real predicate', () => {
    // Wikidata-sourced clips are vouched for by the anthem item's own P51 link,
    // so their filenames need not spell the country out ("Kimi ga Yo
    // instrumental" is fine for JP). Search-sourced ones have no such link —
    // Commons merely ranked them — so the filename is the only evidence there
    // is, and it must pass the same `corroborates` the generator shipped with.
    const unverifiable = entries.filter(([iso, entry]) => {
      if (!entry?.sourceFile) return false // pre-existing rows without provenance
      if (entry.sourcedBy !== 'search') return false
      return !corroborates(entry.sourceFile, entry.title ?? '', COUNTRIES[iso]?.name.english ?? '')
    })

    expect(unverifiable.map(([iso, entry]) => `${iso}: ${entry?.sourceFile}`)).toEqual([])
  })
})
