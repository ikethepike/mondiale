import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { ANTHEMS } from '~~/data/anthems.gen'
import { COUNTRIES } from '~~/data/countries.gen'
import {
  SHARED_MELODIES,
  anthemTuneMatches,
  sharedTuneCountries,
  sharedTuneLine,
} from '~~/lib/anthems'
import { gradeGroupAnswer } from '~~/lib/events/server/grade-group-answer'
import { ATTRIBUTION_FREE, corroborates, isPlayable } from '~~/generators/anthem-corroboration'
import {
  curateAnthem,
  isComposerName,
  isUncuratedRawLabel,
} from '~~/generators/lib/anthem-selection'
import { isBoilerplateCredit } from '~~/generators/lib/licence'
import type { AnthemBuzzChallenge } from '~~/types/challenges/group-modes.type'
import type { Game } from '~~/types/game.types'
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

  it.skipIf(!ffprobeAvailable)(
    'ships every clip at one sample rate',
    () => {
      // `loudnorm` resamples to 192kHz internally and passes that downstream, so
      // an unpinned AAC encode once shipped 96kHz m4a files — double speed, and
      // audible ONLY on Safari, which prefers the m4a over the (correct) webm.
      // Opus is 48kHz-only, so the webm was always right and hid the bug.
      const probe = (file: string) => {
        const result = spawnSync(
          'ffprobe',
          [
            '-v',
            'error',
            '-select_streams',
            'a',
            '-show_entries',
            'stream=sample_rate',
            '-of',
            'csv=p=0',
            file,
          ],
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
    },
    60_000
  )

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

  it("titles each country with the anthem its clip plays, not a realm's", () => {
    const titles = Object.fromEntries(
      (['NZ', 'AG', 'BZ', 'GD', 'PS', 'ZA'] as const).map(iso => [iso, ANTHEMS[iso]?.title])
    )
    expect(titles).toEqual({
      NZ: 'God Defend New Zealand',
      AG: 'Fair Antigua, We Salute Thee',
      BZ: 'Land of the Free',
      GD: 'Hail Grenada',
      PS: "Fida'i",
      ZA: 'National Anthem of South Africa',
    })
    expect(ANTHEMS.NZ?.composer).toBe('John Joseph Woods')
    expect(ANTHEMS.NZ?.writtenYear).toBe(1876)
    expect(ANTHEMS.CO?.composer).toBe('Oreste Síndici')
    expect(ANTHEMS.SC?.composer).toBeUndefined()
    expect(ANTHEMS.GD?.composer).not.toBe('Henry Carey')
  })

  it('ships every entry exactly as the curation leaves it', () => {
    const uncurated = entries.filter(([iso, entry]) => {
      return entry && JSON.stringify(curateAnthem(iso, entry)) !== JSON.stringify(entry)
    })
    expect(uncurated.map(([iso]) => iso)).toEqual([])
  })

  it('names every anthem rather than describing it', () => {
    const described = entries.filter(
      ([iso, entry]) => entry && isUncuratedRawLabel(iso, entry.title)
    )
    expect(described.map(([iso, entry]) => `${iso}: ${entry?.title}`)).toEqual([])
  })

  it('never prints a composer or credit that names nobody', () => {
    const offenders = entries.filter(
      ([, entry]) =>
        (entry?.composer !== undefined && !isComposerName(entry.composer)) ||
        (entry?.credit !== undefined && isBoilerplateCredit(entry.credit))
    )
    expect(offenders.map(([iso]) => iso)).toEqual([])
  })
})

describe('shared anthem tunes', () => {
  /** Composers credited on more than one shipped anthem who wrote each a
   *  different melody. A regenerated roster that pairs a new composer has to
   *  be ruled on here or in SHARED_MELODIES. */
  const DISTINCT_TUNES_BY_COMPOSER = new Set([
    'Mohammed Abdel Wahab',
    'Herbert Pepper',
    'Rabindranath Tagore',
    'Francisco José Debali',
  ])
  const shipped = Object.entries(ANTHEMS) as [ISOCountryCode, (typeof ANTHEMS)[ISOCountryCode]][]

  it('accepts every country sung to the dealt tune, and no other', () => {
    for (const [dealt, sibling] of [
      ['CY', 'GR'],
      ['GR', 'CY'],
      ['LI', 'GB'],
      ['GB', 'LI'],
      ['EE', 'FI'],
      ['ZA', 'TZ'],
      ['ZM', 'ZA'],
    ] as const) {
      expect(anthemTuneMatches(dealt, dealt)).toBe(true)
      expect(anthemTuneMatches(dealt, sibling)).toBe(true)
    }
    expect(anthemTuneMatches('CY', 'TR')).toBe(false)
    expect(anthemTuneMatches('LI', 'CH')).toBe(false)
    expect(anthemTuneMatches('FR', 'FR')).toBe(true)
    expect(sharedTuneCountries('FR')).toEqual(['FR'])
  })

  it('puts the dealt country first and names the rest', () => {
    expect(sharedTuneCountries('CY')).toEqual(['CY', 'GR'])
    expect(sharedTuneCountries('ZA')).toEqual(['ZA', 'TZ', 'ZM'])
    expect(sharedTuneLine('LI')).toBe('Same tune as the United Kingdom')
    expect(sharedTuneLine('FR')).toBeUndefined()
  })

  it('groups every shipped recording two countries share', () => {
    const byFile = new Map<string, ISOCountryCode[]>()
    for (const [isoCode, anthem] of shipped) {
      if (anthem?.sourceFile)
        byFile.set(anthem.sourceFile, [...(byFile.get(anthem.sourceFile) ?? []), isoCode])
    }
    for (const members of byFile.values()) {
      for (const isoCode of members)
        expect(sharedTuneCountries(isoCode)).toEqual(expect.arrayContaining(members))
    }
  })

  it('rules on every composer two shipped anthems share', () => {
    const byComposer = new Map<string, ISOCountryCode[]>()
    for (const [isoCode, anthem] of shipped) {
      if (anthem?.composer)
        byComposer.set(anthem.composer, [...(byComposer.get(anthem.composer) ?? []), isoCode])
    }
    const unruled = [...byComposer]
      .filter(
        ([composer, members]) => members.length > 1 && !DISTINCT_TUNES_BY_COMPOSER.has(composer)
      )
      .filter(([, members]) => !members.every(isoCode => anthemTuneMatches(members[0]!, isoCode)))
    expect(unruled).toEqual([])
  })

  it('ships an anthem for every country on the melody table', () => {
    expect(SHARED_MELODIES.flat().filter(isoCode => !ANTHEMS[isoCode])).toEqual([])
  })

  it('grades a sibling buzz correct on the server and lists the whole tune', async () => {
    const challenge: AnthemBuzzChallenge = {
      _type: 'anthem-buzz-challenge',
      country: 'CY',
      clip: { webm: '/anthems/CY.webm', m4a: '/anthems/CY.m4a' },
      durationSeconds: 30,
      maximumPoints: 10,
    }
    const grade = (guess: ISOCountryCode) =>
      gradeGroupAnswer({
        game: { difficulty: 'normal', regions: [] } as unknown as Game,
        round: { groupChallenge: challenge, groupAnswers: {}, playerTurns: {} } as never,
        playerId: 'p1',
        submission: { ranking: [guess], clientScore: 8 },
      })

    for (const guess of ['CY', 'GR'] as const) {
      const { scoring, answer } = await grade(guess)
      expect(scoring).toEqual({ scored: 8, maximum: 10 })
      expect(answer.correct).toEqual(['CY', 'GR'])
    }
    expect((await grade('TR')).scoring.scored).toBe(0)
  })
})
