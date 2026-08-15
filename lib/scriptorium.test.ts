import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { COUNTRIES } from '~~/data/countries.gen'
import {
  SCRIPTORIUM_POOL,
  SCRIPTORIUM_RUNGS,
  SCRIPTORIUM_RUNG_UNLOCK,
  scriptoriumAnswers,
  scriptoriumLadder,
  scriptoriumRegionHint,
  type ScriptoriumRung,
} from '~~/lib/scriptorium'
import {
  HINT_UNLOCK_FIRST_ELAPSED,
  HINT_UNLOCK_LAST_ELAPSED,
  HINT_UNLOCK_SECOND_ELAPSED,
} from '~~/lib/scoring'
import { anthemTongueSample, seededTongueSample, tongueSampleSource } from '~~/lib/tongue-samples'

describe('SCRIPTORIUM_POOL', () => {
  it('never deals the Latin alphabet — the script must narrow the world', () => {
    for (const entry of SCRIPTORIUM_POOL) {
      expect(entry.script, entry.language).not.toMatch(/latin/i)
    }
  })

  it('has a speaker for every entry', () => {
    for (const entry of SCRIPTORIUM_POOL) {
      expect(scriptoriumAnswers(entry.language).length, entry.language).toBeGreaterThan(0)
    }
  })

  it('never stages a page whose language no country writes officially — except where the Factbook does not say so', () => {
    // The pool's admission rule is "somebody makes it official", and the data
    // backs it everywhere but Kyrgyz: the Factbook parse leaves Kyrgyzstan's
    // officials as Russian alone, with Kyrgyz on the spoken list. Pinned as a
    // known exception rather than asserted away — a SECOND entry drifting into
    // minority-status-only is a pool bug worth failing on.
    const withoutOfficial = SCRIPTORIUM_POOL.filter(
      entry =>
        !scriptoriumAnswers(entry.language).some(isoCode =>
          (COUNTRIES[isoCode]?.officialLanguages ?? []).includes(entry.language)
        )
    ).map(entry => entry.language)
    expect(withoutOfficial).toEqual(['Kyrgyz'])
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

describe('scriptoriumLadder', () => {
  const ladder = (state: Partial<Parameters<typeof scriptoriumLadder>[0]> = {}) =>
    scriptoriumLadder({ elapsedFraction: 1, bought: [], ...state })

  it('reads its waves from the shared hint-unlock tokens', () => {
    // The ladder is the hint economy's, not this mode's — a private timetable
    // is how one gate's shop drifts from every other gate's.
    expect(SCRIPTORIUM_RUNG_UNLOCK.region).toBe(HINT_UNLOCK_FIRST_ELAPSED)
    expect(SCRIPTORIUM_RUNG_UNLOCK.script).toBe(HINT_UNLOCK_SECOND_ELAPSED)
    expect(SCRIPTORIUM_RUNG_UNLOCK.country).toBe(HINT_UNLOCK_LAST_ELAPSED)
    // Strictly later, rung by rung: a wave that opened before the one above it
    // would let the descent be skipped by simply waiting.
    const waves = SCRIPTORIUM_RUNGS.map(rung => SCRIPTORIUM_RUNG_UNLOCK[rung])
    for (let index = 1; index < waves.length; index++) {
      expect(waves[index]).toBeGreaterThan(waves[index - 1]!)
    }
  })

  it('offers nothing before the first wave breaks', () => {
    expect(ladder({ elapsedFraction: 0 }).offered).toBeUndefined()
    expect(ladder({ elapsedFraction: HINT_UNLOCK_FIRST_ELAPSED - 0.01 }).offered).toBeUndefined()
    expect(ladder({ elapsedFraction: HINT_UNLOCK_FIRST_ELAPSED }).offered).toBe('region')
  })

  it('offers exactly one rung — the topmost still standing', () => {
    // Late in the clock every wave has broken, but the shop still sells the
    // ladder in order: the naming rung can never be bought for one bite.
    expect(ladder({ bought: [] }).offered).toBe('region')
    expect(ladder({ bought: ['region'] }).offered).toBe('script')
    expect(ladder({ bought: ['region', 'script'] }).offered).toBe('country')
    expect(ladder({ bought: ['region', 'script', 'country'] }).offered).toBeUndefined()
  })

  it('holds a rung back until its own wave breaks, however many are down', () => {
    expect(ladder({ elapsedFraction: 0.5, bought: ['region'] }).offered).toBeUndefined()
    expect(
      ladder({ elapsedFraction: HINT_UNLOCK_SECOND_ELAPSED, bought: ['region'] }).offered
    ).toBe('script')
    expect(
      ladder({ elapsedFraction: HINT_UNLOCK_SECOND_ELAPSED, bought: ['region', 'script'] }).offered
    ).toBeUndefined()
  })

  it("shows easy's free region without charging it, and moves the shop on", () => {
    const easy = ladder({ free: ['region'] })
    expect(easy.shown).toEqual(['region'])
    // Free, so it is never in `bought` — the pot is untouched — but it still
    // counts as down, or the descent would stall on a rung already on screen.
    expect(easy.offered).toBe('script')
  })

  it('accumulates the bought rungs rather than replacing them', () => {
    expect(ladder({ bought: ['region', 'script'] }).shown).toEqual(['region', 'script'])
    expect(ladder({ free: ['region'], bought: ['script', 'country'] }).shown).toEqual([
      ...SCRIPTORIUM_RUNGS,
    ])
  })

  it('steps over a mute rung instead of jamming the descent below it', () => {
    // A language that cannot phrase a rung must not strand the ones under it —
    // the shape that left this gate with no move in it in the first place.
    expect(ladder({ mute: ['region'] }).offered).toBe('script')
    expect(ladder({ mute: ['region', 'script'] }).offered).toBe('country')
    // And a mute rung is not a shown one: there is nothing to show.
    expect(ladder({ mute: ['region'], bought: ['script'] }).shown).toEqual(['script'])
  })

  it('opens every wave at once when the page never arrived', () => {
    // Blind, the player is being asked to read nothing: the ladder is the only
    // way through, so the clock stops gating it.
    expect(ladder({ elapsedFraction: 0, blind: true }).offered).toBe('region')
    expect(ladder({ elapsedFraction: 0, blind: true, bought: ['region'] }).offered).toBe('script')
    expect(ladder({ elapsedFraction: 0, blind: true, bought: ['region', 'script'] }).offered).toBe(
      'country'
    )
  })

  it('shuts the shop the moment the gate has a verdict', () => {
    const resolved = ladder({ bought: ['region'], resolved: true })
    expect(resolved.offered).toBeUndefined()
    // What was bought stays on screen — the player paid for it.
    expect(resolved.shown).toEqual(['region'])
  })

  it('never charges more rungs than the pot can grade', () => {
    // Three rungs at GATE_HINT_BITE_STEPS each is what pins the scriptorium
    // pot at 5 (lib/scoring.test.ts) — a fourth would make the ladder's
    // bottom two indistinguishable, both staking nothing.
    expect(SCRIPTORIUM_RUNGS.length).toBe(3)
    const every: ScriptoriumRung[] = [...SCRIPTORIUM_RUNGS]
    expect(ladder({ bought: every }).offered).toBeUndefined()
  })
})
