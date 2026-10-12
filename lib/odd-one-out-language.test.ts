import { afterEach, describe, expect, it, vi } from 'vitest'
import { COUNTRIES } from '~~/data/countries.gen'
import { getIndividualChallenge } from '~~/lib/challenges'
import { speaksLanguage } from '~~/lib/language-rounds'
import type { ISOCountryCode } from '~~/types/geography.types'

/** Steers every random draw: anything named here is drawn first, the rest keep their order. */
const preferred = vi.hoisted(() => new Set<unknown>())

vi.mock('~~/lib/arrays', async importOriginal => {
  const original = await importOriginal<typeof import('~~/lib/arrays')>()
  const rank = (item: unknown) => (preferred.has(Array.isArray(item) ? item[0] : item) ? 0 : 1)
  const steer = <T>(array: T[]) => array.sort((a, b) => rank(a) - rank(b))
  return {
    ...original,
    shuffleArray: steer,
    sample: <T>(array: readonly T[]) => steer([...array])[0],
    sampleMany: <T>(array: readonly T[], count: number) => steer([...array]).slice(0, count),
  }
})

describe('odd-one-out language lineups', () => {
  afterEach(() => {
    preferred.clear()
    delete process.env.FORCE_INDIVIDUAL_VARIANT
  })

  // Each impostor makes the language official without the spoken list carrying it.
  const officialOnly: [string, ISOCountryCode][] = [
    ['Swahili', 'RW'],
    ['English', 'BI'],
    ['Portuguese', 'GQ'],
    ['Guarani', 'BO'],
  ]

  it.each(officialOnly)('never deals a %s speaker (%s) as the impostor', async (language, iso) => {
    expect(COUNTRIES[iso].languages).not.toContain(language)
    process.env.FORCE_INDIVIDUAL_VARIANT = 'odd-one-out'
    for (const pick of ['language', language, iso]) preferred.add(pick)

    const dealt = await getIndividualChallenge({ accessorId: 'isoCode' })
    expect(dealt.oddOneOut?.kind).toBe('language')
    expect(dealt.oddOneOut?.value).toBe(language)
    expect(speaksLanguage(dealt.country, language), dealt.country).toBe(false)
    for (const isoCode of dealt.oddOneOut!.countries) {
      if (isoCode === dealt.country) continue
      expect(speaksLanguage(isoCode, language), isoCode).toBe(true)
    }
  })
})
