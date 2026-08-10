import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { SCRIPTORIUM_POOL, scriptoriumAnswers, scriptoriumRegionHint } from '~~/lib/scriptorium'
import { anthemTongueSample, seededTongueSample, tongueSampleSource } from '~~/lib/tongue-samples'

describe('SCRIPTORIUM_POOL', () => {
  it('never deals the Latin alphabet — the script must narrow the world', () => {
    for (const entry of SCRIPTORIUM_POOL) {
      expect(entry.script, entry.language).not.toMatch(/latin/i)
    }
  })

  it('has an official speaker for every entry', () => {
    for (const entry of SCRIPTORIUM_POOL) {
      expect(scriptoriumAnswers(entry.language).length, entry.language).toBeGreaterThan(0)
    }
  })

  it('resolves a written sample with real lines for every entry', () => {
    // The exact resolution path the gate takes: seed first, else the lyric
    // wall routed by the entry's own BCP-47 code — and the wall must distil
    // to at least one unmasked line, or the gate stages a blank page.
    for (const entry of SCRIPTORIUM_POOL) {
      if (seededTongueSample(entry.language)) continue
      const source = tongueSampleSource(entry.language, entry.code)
      expect(source, entry.language).toBeTruthy()
      const lyrics = JSON.parse(readFileSync(join(__dirname, '../public', source!), 'utf8'))
      const sample = anthemTongueSample(lyrics)
      expect(sample?.lines.length, entry.language).toBeGreaterThan(0)
      expect(sample?.script, entry.language).toBeTruthy()
    }
  })

  it('keeps the gate give-up tokens out of every answer set', () => {
    // wrongTokenFor's guarantee: CH/AT/NZ can never be a scriptorium answer,
    // or letting the clock expire could win the gate (the errata-swap lesson).
    for (const entry of SCRIPTORIUM_POOL) {
      const answers = scriptoriumAnswers(entry.language)
      for (const token of ['CH', 'AT', 'NZ'] as const) {
        expect(answers, `${entry.language} accepts ${token}`).not.toContain(token)
      }
    }
  })

  it('phrases a region hint for every entry', () => {
    for (const entry of SCRIPTORIUM_POOL) {
      expect(scriptoriumRegionHint(entry.language), entry.language).toBeTruthy()
    }
  })
})
