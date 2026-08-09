import { describe, expect, it } from 'vitest'
import { ISOCountryCodes } from '~~/data/iso-codes.gen'
import {
  ATLAS_TABLE_SEED_OPTIONS,
  ATLAS_TARGET_LINKS,
  atlasChainCredit,
  atlasContinuations,
  atlasHeadLetter,
  atlasKey,
  atlasLinkOverlap,
  atlasTailLetter,
  hasAtlasChain,
  pickAtlasHint,
  pickAtlasSeed,
} from '~~/lib/atlas-chain'
import { playableWorldCountries } from '~~/lib/game-rules'
import { gameDifficulties, type GameRules } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'

const WORLD: ISOCountryCode[] = [...ISOCountryCodes]
const RULES: GameRules = { variant: 'world', difficulty: 'normal', includeMicroNations: false }

describe('atlasKey and letters', () => {
  it('normalizes punctuation, diacritics and spaces', () => {
    expect(atlasKey('CI')).toBe('cotedivoire')
    expect(atlasHeadLetter('CI')).toBe('c')
    expect(atlasTailLetter('CI')).toBe('e')
    expect(atlasTailLetter('GW')).toBe('u') // Guinea-Bissau
    expect(atlasTailLetter('TL')).toBe('e') // Timor-Leste
    expect(atlasHeadLetter('ZA')).toBe('s') // South Africa: whole key, not last token
    expect(atlasTailLetter('ZA')).toBe('a')
  })
})

describe('atlasLinkOverlap', () => {
  it('measures the shared fragment', () => {
    expect(atlasLinkOverlap('NP', 'LA')).toBe(1) // Nepal → Laos
    expect(atlasLinkOverlap('NP', 'DZ')).toBe(2) // Nepal → Algeria
    expect(atlasLinkOverlap('NP', 'PS')).toBe(3) // Nepal → Palestine
    expect(atlasLinkOverlap('PK', 'TZ')).toBe(3) // Pakistan → Tanzania
    expect(atlasLinkOverlap('NE', 'NG')).toBe(5) // Niger → Nigeria
    expect(atlasLinkOverlap('NP', 'SE')).toBe(0) // Nepal → Sweden: no chain
  })

  it('crosses word boundaries through the space-stripped key', () => {
    // Vanuatu ends "tu"; "tu" opens no name, but "u" does — and United
    // Kingdom's key is "unitedkingdom", so the single letter carries it.
    expect(atlasLinkOverlap('VU', 'GB')).toBe(1)
  })
})

describe('atlasContinuations', () => {
  it('applies letter, dupe and pool filters', () => {
    const moves = atlasContinuations('NP', ['NP', 'LA'], WORLD)
    expect(moves).not.toContain('LA')
    expect(moves.every(isoCode => atlasHeadLetter(isoCode) === 'l')).toBe(true)
    expect(moves.length).toBeGreaterThan(3)
  })

  it('is a superset under the overlap rule', () => {
    const plain = atlasContinuations('NP', ['NP'], WORLD)
    const wide = atlasContinuations('NP', ['NP'], WORLD, { overlaps: true })
    for (const isoCode of plain) expect(wide).toContain(isoCode)
    expect(wide).toContain('PS') // the overlap-only extra
  })

  it('knows the forced edges', () => {
    // Iraq → Qatar is the letter graph's only q-edge…
    expect(atlasContinuations('IQ', ['IQ'], WORLD)).toEqual(['QA'])
    // …and once Qatar is spent, Iraq is a dead end under the plain rule.
    expect(atlasContinuations('IQ', ['IQ', 'QA'], WORLD)).toEqual([])
  })

  it('has no dead letters in the full pool', () => {
    for (const isoCode of WORLD) {
      expect(atlasContinuations(isoCode, [isoCode], WORLD).length, isoCode).toBeGreaterThan(0)
    }
  })
})

describe('atlasChainCredit', () => {
  it('pays one per junction under the plain rule', () => {
    expect(atlasChainCredit(['NP', 'LA', 'SE'])).toBe(2)
  })

  it('pays overlap length under the hard rule', () => {
    expect(atlasChainCredit(['NP', 'PS'], { overlaps: true })).toBe(3)
    expect(atlasChainCredit(['NP', 'PS', 'ET'], { overlaps: true })).toBe(4)
  })
})

describe('hasAtlasChain', () => {
  it('proves every difficulty target from a healthy seed', () => {
    for (const difficulty of gameDifficulties) {
      expect(hasAtlasChain('NP', ATLAS_TARGET_LINKS[difficulty], WORLD)).toBe(true)
    }
  })

  it('fails when the pool cannot carry the chain', () => {
    expect(hasAtlasChain('IQ', 2, ['IQ', 'QA'])).toBe(false)
  })
})

describe('pickAtlasSeed', () => {
  it('only seeds letters with real play', () => {
    const pool = playableWorldCountries(RULES)
    for (let attempt = 0; attempt < 25; attempt++) {
      const seed = pickAtlasSeed(RULES, { minOptions: ATLAS_TABLE_SEED_OPTIONS })
      expect(seed).toBeTruthy()
      expect(
        atlasContinuations(seed!, [seed!], pool).length,
        seed
      ).toBeGreaterThanOrEqual(ATLAS_TABLE_SEED_OPTIONS)
    }
  })

  it('seeds the world pool even in region games', () => {
    const seed = pickAtlasSeed({ ...RULES, variant: 'europe' })
    expect(seed).toBeTruthy()
  })
})

describe('pickAtlasHint', () => {
  it('never hands out a dead end while a live option exists', () => {
    for (let attempt = 0; attempt < 25; attempt++) {
      const hint = pickAtlasHint('NP', ['NP'], WORLD)
      expect(hint).toBeTruthy()
      expect(atlasContinuations(hint!, ['NP', hint!], WORLD).length).toBeGreaterThan(0)
    }
  })

  it('prefers the deepest overlap on hard', () => {
    const hint = pickAtlasHint('NE', ['NE'], WORLD, { overlaps: true })
    expect(hint).toBe('NG') // Niger → Nigeria, overlap 5
  })
})
