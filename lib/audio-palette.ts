import { COUNTRIES } from '~~/data/countries.gen'
import { hexToRgb } from './palette'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * The colours the audio rounds' backdrop drifts toward.
 *
 * Both buzz modes fade an ambient field from the game's own hues into the
 * answer's, so the palette IS the hint — half-noticing Sweden's blue and gold
 * before you can name why. That only works if the colours are legible and
 * few; fed raw, flag data is neither.
 *
 * One home for the derivation so the views and any reveal resolve it
 * identically — two copies of a colour rule drift the moment one is tuned.
 */

/** The page's own milk surface (--sour-milk), in literal hex because Sass
 *  functions do not survive the trip into a shader uniform. Doubles as the
 *  stand-in for a flag's white, so the two uses can never drift. */
const MILK = '#fffbf5'

/** Where the field starts, before any country's colours arrive. Mirrors
 *  --sour-milk, --warm-sand and --soft-mint in
 *  `assets/scss/rules/_palette.scss` — keep in step with them. Deliberately
 *  NOT --soft-blue: at 51% saturation it is the map's fill colour and reads
 *  as a statement, where the idle field should read as paper. */
export const NEUTRAL_FIELD: readonly string[] = [MILK, '#f1b982', '#90bcb5']

/**
 * How many colours reach the field. Deliberately tighter than
 * `MAX_FLAG_COLORS` (6) in `lib/palette.ts`, which answers a different
 * question — that one decides whether a flag may play a palette round at all.
 * Four blobs read as a palette; eight read as mud.
 */
export const MAX_FIELD_COLORS = 4

/** Hues within this many degrees are the same colour for our purposes, so a
 *  crest's twelve golds collapse to one gold. */
const HUE_CLUSTER_DEGREES = 30

/** Legibility band. The lyric wall sits at ink(0.24) over this field, so the
 *  backdrop may never go so dark or so saturated that the verse disappears
 *  into it. Values are the ceiling/floor the clamp pulls colours into. */
const MAX_SATURATION = 0.55
const MIN_LIGHTNESS = 0.42
const MAX_LIGHTNESS = 0.78

/** Below this saturation a colour is a grey — emblem fill or page white, not
 *  flag identity. Dropping them is what stops a busy crest turning to mud. */
const GREY_SATURATION = 0.16

/** Near-black and near-white carry no usable hue however saturated they compute
 *  as: Albania stores `#000001`, whose single blue bit reads as fully-saturated
 *  240°. Clamped into the legible band that becomes a confident, wrong blue on
 *  a red-and-black flag. Judge chroma by lightness as well as saturation. */
const INK_LIGHTNESS = 0.06
const PAPER_LIGHTNESS = 0.94

/**
 * `identity.colors` holds two very different kinds of list. Curated ones are
 * short — Sweden's 2, South Africa's 6 — and every entry is flag identity.
 * Extracted dumps run to dozens or hundreds (El Salvador 162), and past the
 * first entries it is all crest gradient. Measured on the dumps, support can't
 * tell the two apart (SV's crest red spans 59 shades to the field blue's 60),
 * but ORDER can: the field colours lead the list. So a list longer than this
 * is treated as a dump and only its leading clusters are trusted.
 */
const CURATED_MAX = 8

/** In a dump, only entries this early may OPEN a colour cluster — the field
 *  colours lead the extraction, and everything from here on is crest (SV: the
 *  crest red first appears at index 3, right behind blue @0 and white @1).
 *  Later shades may still deepen a cluster already open. */
const DUMP_HEAD = 3

/** A flag's white is a PRIMARY, not a grey — El Salvador is blue-white-blue,
 *  Japan a red disc on white. A near-white inside this many leading entries
 *  joins the palette as the milk tone rather than being dropped. */
const WHITE_LOOKAHEAD = 3
const WHITE_LIGHTNESS = 0.85


interface Hsl {
  h: number
  s: number
  l: number
}

/** Exported for the test suite — a re-typed HSL conversion there would be a
 *  shadow implementation of exactly the maths under test. */
export const toHsl = (hex: string): Hsl => {
  const [r, g, b] = hexToRgb(hex).map(channel => channel / 255) as [number, number, number]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const delta = max - min
  if (!delta) return { h: 0, s: 0, l }

  const s = delta / (1 - Math.abs(2 * l - 1))
  const h =
    max === r
      ? ((g - b) / delta + (g < b ? 6 : 0)) * 60
      : max === g
        ? ((b - r) / delta + 2) * 60
        : ((r - g) / delta + 4) * 60
  return { h, s, l }
}

const toHex = ({ h, s, l }: Hsl): string => {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const sector = Math.floor(h / 60) % 6
  const [r, g, b] = (
    [
      [c, x, 0],
      [x, c, 0],
      [0, c, x],
      [0, x, c],
      [x, 0, c],
      [c, 0, x],
    ] as [number, number, number][]
  )[sector]
  return `#${[r, g, b]
    .map(channel =>
      Math.round((channel + m) * 255)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`
}

/** Pull a colour into the band the text above it can survive. */
const clampForLegibility = ({ h, s, l }: Hsl): Hsl => ({
  h,
  s: Math.min(s, MAX_SATURATION),
  l: Math.min(Math.max(l, MIN_LIGHTNESS), MAX_LIGHTNESS),
})

/**
 * The field's target colours for one or more countries.
 *
 * Tongues passes EVERY speaker country, not one: English is official in
 * 55 of them, so drifting toward a single flag would finger a nation rather
 * than hint a language. Blending says "these colours" and leaks nobody.
 *
 * Falls back to the neutral palette when nothing usable survives — a hostile
 * flag degrades to "no hint", which is honest, rather than to noise.
 */
/** One flag's trustworthy colours: its leading chromatic clusters, plus
 *  whether an early near-white marks white as a true primary. */
const singleFlagColours = (colors: readonly string[]): { chromatics: Hsl[]; white: boolean } => {
  const dump = colors.length > CURATED_MAX
  const clusters: { hue: number; colour: Hsl }[] = []
  let white = false

  colors.forEach((hex, index) => {
    const hsl = toHsl(hex)
    const chromatic =
      hsl.s >= GREY_SATURATION && hsl.l >= INK_LIGHTNESS && hsl.l <= PAPER_LIGHTNESS
    if (!chromatic) {
      if (index < WHITE_LOOKAHEAD && hsl.l >= WHITE_LIGHTNESS) white = true
      return
    }

    const existing = clusters.find(cluster => {
      const gap = Math.abs(cluster.hue - hsl.h)
      return Math.min(gap, 360 - gap) < HUE_CLUSTER_DEGREES
    })
    // Keep the most saturated member of a cluster: it reads as the real colour,
    // where a washed-out shade of it reads as an accident.
    if (existing) {
      if (hsl.s > existing.colour.s) existing.colour = hsl
      return
    }
    // A dump's later entries are crest, never field — they may deepen an
    // existing cluster but not open one.
    if (dump && index >= DUMP_HEAD) return
    clusters.push({ hue: hsl.h, colour: hsl })
  })

  return { chromatics: clusters.map(cluster => cluster.colour), white }
}

export const audioFieldPalette = (isoCodes: ISOCountryCode[]): string[] => {
  const flags = isoCodes
    .map(isoCode => COUNTRIES[isoCode]?.identity.colors ?? [])
    .filter(colors => colors.length)
    .map(singleFlagColours)
  if (!flags.length) return [...NEUTRAL_FIELD]

  // Merge across countries by hue, order preserved: a flag lists its dominant
  // colours first, so an earlier entry wins its cluster.
  const merged: { hue: number; colour: Hsl }[] = []
  for (const flag of flags) {
    for (const hsl of flag.chromatics) {
      const existing = merged.find(cluster => {
        const gap = Math.abs(cluster.hue - hsl.h)
        return Math.min(gap, 360 - gap) < HUE_CLUSTER_DEGREES
      })
      if (existing) {
        if (hsl.s > existing.colour.s) existing.colour = hsl
        continue
      }
      merged.push({ hue: hsl.h, colour: hsl })
    }
  }

  const palette = merged
    .slice(0, MAX_FIELD_COLORS)
    .map(cluster => toHex(clampForLegibility(cluster.colour)))

  // The flag's own white joins as milk — never clamped, and only where a slot
  // remains: a four-colour flag's chromatics outrank it.
  if (flags.some(flag => flag.white) && palette.length < MAX_FIELD_COLORS) palette.push(MILK)

  return palette.length ? palette : [...NEUTRAL_FIELD]
}

/**
 * The swatch-dot hint for the anthem round: the flag's trusted colours AS
 * THEMSELVES. Same head-trust rules as the field (a crest dump contributes
 * only the clusters its first entries open, white counts as a primary), but
 * UNCLAMPED — dots on a milk chip need the flag's real saturation, where the
 * field's clamp exists for text drawn over it. Raw `identity.colors.slice()`
 * is never acceptable here: on El Salvador that shipped six entries of crest
 * gradient as "the flag".
 */
export const flagSwatches = (isoCode: ISOCountryCode): string[] => {
  const colors = COUNTRIES[isoCode]?.identity.colors ?? []
  if (!colors.length) return []
  const { chromatics, white } = singleFlagColours(colors)
  const swatches = chromatics.slice(0, MAX_FIELD_COLORS).map(toHex)
  if (white && swatches.length < MAX_FIELD_COLORS) swatches.push('#fff')
  return swatches
}
