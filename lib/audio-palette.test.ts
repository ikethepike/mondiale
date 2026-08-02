import { describe, expect, it } from 'vitest'
import { COUNTRIES } from '~~/data/countries.gen'
import { audioFieldPalette, MAX_FIELD_COLORS, NEUTRAL_FIELD, toHsl } from './audio-palette'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * The field's colours are a HINT, so they have to survive two hostile inputs:
 * crest-heavy flags whose raw palette is a hundred near-identical shades, and
 * flags whose colours would swallow the lyric text drawn over them.
 */

/** The milk tone that stands in for a flag's white — the page's own surface,
 *  exempt from the chroma and band checks by construction. */
const MILK = NEUTRAL_FIELD[0]

// THE module's own conversion, not a re-typed copy — a shadow implementation
// here would silently vouch for different maths than the ones under test.
const saturationOf = (hex: string): number => toHsl(hex).s
const lightnessOf = (hex: string): number => toHsl(hex).l
const hueOf = (hex: string): number => toHsl(hex).h

describe('audioFieldPalette', () => {
  it('clamps a crest dump to the flag primaries', () => {
    // El Salvador stores 162 colours, but the flag is blue-white-blue: the
    // crest's 59 red shades and 19 golds are detail, not identity. The field
    // must show cobalt and white — nothing else.
    const palette = audioFieldPalette(['SV'] as ISOCountryCode[])
    expect(palette).toHaveLength(2)
    const [blue, milk] = palette
    expect(hueOf(blue)).toBeGreaterThan(190)
    expect(hueOf(blue)).toBeLessThan(250)
    expect(milk).toBe(MILK)
  })

  it('tames every crest-heavy flag rather than turning it to mud', () => {
    for (const isoCode of ['SV', 'MX', 'BZ', 'BO', 'NI'] as ISOCountryCode[]) {
      const palette = audioFieldPalette([isoCode])
      expect(palette.length, isoCode).toBeLessThanOrEqual(MAX_FIELD_COLORS)
      expect(palette.length, isoCode).toBeGreaterThan(0)
      // A dump trusts only clusters its first entries open, plus the white.
      expect(palette.filter(hex => hex !== MILK).length, isoCode).toBeLessThanOrEqual(3)
      // Nothing chromatic that survives may be a grey — that is the mud.
      for (const hex of palette) {
        if (hex === MILK) continue
        expect(saturationOf(hex), `${isoCode} ${hex}`).toBeGreaterThan(0.15)
      }
    }
  })

  it('keeps a simple flag recognisable', () => {
    // Sweden is blue and gold; both should still be there, and still read as
    // blue and gold rather than as two washed-out cousins.
    const palette = audioFieldPalette(['SE'] as ISOCountryCode[])
    expect(palette).toHaveLength(2)
    for (const hex of palette) expect(saturationOf(hex)).toBeGreaterThan(0.3)
  })

  it('honours white as a primary where the flag leads with it', () => {
    // Japan is a red disc on white — a red-only field would be half a flag.
    const palette = audioFieldPalette(['JP'] as ISOCountryCode[])
    expect(palette).toContain(MILK)
    expect(palette.some(hex => hex !== MILK && saturationOf(hex) > 0.3)).toBe(true)
  })

  it('holds every derived colour inside the legibility band', () => {
    // The lyric wall is drawn over this field. A colour outside the band would
    // either swallow the verse or fight it. Milk and the neutral fallback are
    // exempt: they ARE the page surface the wall already sits on.
    const everyCountry = Object.keys(COUNTRIES) as ISOCountryCode[]
    const offenders = everyCountry
      .map(isoCode => [isoCode, audioFieldPalette([isoCode])] as const)
      .filter(([, palette]) => palette.join() !== NEUTRAL_FIELD.join())
      .flatMap(([isoCode, palette]) =>
        palette
          .filter(hex => hex !== MILK)
          .filter(
            hex => saturationOf(hex) > 0.56 || lightnessOf(hex) < 0.41 || lightnessOf(hex) > 0.79
          )
          .map(hex => `${isoCode}: ${hex}`)
      )
    expect(offenders).toEqual([])
  })

  it('keeps the colours the extraction used to lose to named fills', () => {
    // These flags paint with `fill="red"`/`fill="gold"`, which the generator
    // once dropped — Ukraine shipped blue-only. Pin the repaired truths.
    const redBand = (hex: string) => hueOf(hex) < 30 || hueOf(hex) > 330
    const ukraine = audioFieldPalette(['UA'] as ISOCountryCode[])
    expect(ukraine).toHaveLength(2)
    expect(ukraine.some(hex => hueOf(hex) > 40 && hueOf(hex) < 70), 'UA gold').toBe(true)
    expect(ukraine.some(hex => hueOf(hex) > 190 && hueOf(hex) < 250), 'UA blue').toBe(true)

    // Switzerland: red field, white cross.
    const swiss = audioFieldPalette(['CH'] as ISOCountryCode[])
    expect(swiss.some(redBand), 'CH red').toBe(true)
    expect(swiss).toContain(MILK)

    // Albania: red field (its black eagle is ink, deliberately dropped).
    expect(audioFieldPalette(['AL'] as ISOCountryCode[]).some(redBand), 'AL red').toBe(true)
  })

  it('blends across every speaker country rather than following the first', () => {
    // Mother Tongue must never drift toward ONE flag. Switzerland is the
    // honest witness in the German set: its white appears in no German or
    // Austrian colour, so a blend that ignored later speakers would lack milk.
    const german = ['DE', 'AT', 'CH'] as ISOCountryCode[]
    expect(audioFieldPalette(['DE'] as ISOCountryCode[])).not.toContain(MILK)
    expect(audioFieldPalette(german)).toContain(MILK)
  })

  it('keeps a language blend inside the same cap as a single flag', () => {
    // A 55-speaker language must not arrive as 55 flags' worth of colour.
    const anglophone = ['GB', 'US', 'IE', 'AU', 'NZ', 'ZA', 'IN', 'NG', 'KE', 'JM'] as ISOCountryCode[]
    expect(audioFieldPalette(anglophone).length).toBeLessThanOrEqual(MAX_FIELD_COLORS)
  })

  it('falls back to neutral rather than to noise', () => {
    expect(audioFieldPalette([])).toEqual([...NEUTRAL_FIELD])
  })

  it('never returns more colours than a field can read', () => {
    const everyCountry = Object.keys(COUNTRIES) as ISOCountryCode[]
    const tooMany = everyCountry.filter(
      isoCode => audioFieldPalette([isoCode]).length > MAX_FIELD_COLORS
    )
    expect(tooMany).toEqual([])
  })
})
