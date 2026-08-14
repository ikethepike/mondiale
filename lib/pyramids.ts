import { PYRAMIDS } from '~~/data/pyramids.gen'
import type { PopulationPyramid, PyramidSeries } from '~~/generators/vendors/unwpp/create-wpp'
import type { ISOCountryCode } from '~~/types/geography.types'
import { clamp } from './number'

/**
 * Population pyramids: the one home for reading a country's age structure —
 * frame interpolation, shape distance (what the dealer gates on), the shape
 * family vocabulary and the historical scars the reveal annotates.
 *
 * Both ends of the wire read this: the dealer picks a distinguishable set with
 * `pyramidDistance`, and the views render through `pyramidFrameAt`. A second
 * copy of either would let the deal and the picture disagree.
 */

/** 5-year cohorts, ascending — mirrors PYRAMID_AGE_GROUPS in the generator. */
export const PYRAMID_COHORTS = [
  '0-4',
  '5-9',
  '10-14',
  '15-19',
  '20-24',
  '25-29',
  '30-34',
  '35-39',
  '40-44',
  '45-49',
  '50-54',
  '55-59',
  '60-64',
  '65-69',
  '70-74',
  '75-79',
  '80-84',
  '85-89',
  '90-94',
  '95-99',
  '100+',
] as const

export const pyramidSeries = (isoCode: ISOCountryCode): PyramidSeries | undefined =>
  PYRAMIDS[isoCode]

/** Countries carrying a full frame ladder — the pool every pyramid surface draws from. */
export const PYRAMID_COUNTRIES = Object.keys(PYRAMIDS) as ISOCountryCode[]

/** The ladder's years, read off the data itself so the generator stays the source. */
export const PYRAMID_YEARS: number[] = (PYRAMIDS[PYRAMID_COUNTRIES[0]] ?? []).map(
  frame => frame.year
)

/** The last frame — "today" for every classification and the dealer's gate. */
export const latestPyramid = (isoCode: ISOCountryCode): PopulationPyramid | undefined => {
  const series = PYRAMIDS[isoCode]
  return series?.[series.length - 1]
}

/**
 * The pyramid at any REAL-VALUED position along the ladder, cohort-wise lerped.
 * `position` is in FRAME units (0 … frames-1), so 6.5 is midway between the
 * seventh and eighth snapshots. Views animate on this rather than stepping
 * between snapshots, which reads as a stutter at a 5-year granularity.
 */
export const pyramidFrameAt = (
  isoCode: ISOCountryCode,
  position: number
): PopulationPyramid | undefined => {
  const series = PYRAMIDS[isoCode]
  if (!series?.length) return undefined
  const last = series.length - 1
  const at = clamp(position, 0, last)
  const low = Math.floor(at)
  const high = Math.min(last, low + 1)
  const ratio = at - low
  if (low === high || ratio === 0) return series[low]

  const from = series[low]
  const to = series[high]
  const mix = (a: number, b: number) => a + (b - a) * ratio
  return {
    year: Math.round(mix(from.year, to.year)),
    male: from.male.map((value, index) => mix(value, to.male[index])),
    female: from.female.map((value, index) => mix(value, to.female[index])),
  }
}

/** The year at a real-valued ladder position — what the odometer ticks through. */
export const pyramidYearAt = (position: number): number => {
  if (!PYRAMID_YEARS.length) return 0
  const last = PYRAMID_YEARS.length - 1
  const at = clamp(position, 0, last)
  const first = PYRAMID_YEARS[0]
  return Math.round(first + ((PYRAMID_YEARS[last] - first) * at) / last)
}

/** Peak cohort share across the given countries and every frame — ONE domain, so
 *  a bar's length means the same thing on every card and the morph never rescales. */
export const pyramidPeakShare = (isoCodes: readonly ISOCountryCode[]): number => {
  let peak = 0
  for (const isoCode of isoCodes) {
    for (const frame of PYRAMIDS[isoCode] ?? []) {
      for (let index = 0; index < frame.male.length; index++) {
        peak = Math.max(peak, frame.male[index], frame.female[index])
      }
    }
  }
  return peak || 1
}

// --- Shape distance: what makes a deal readable -----------------------------

/** Total absolute difference across all 42 bins of the latest frame. Two
 *  countries under ~20 apart are the same picture at the size a card allows —
 *  measured over all 18,721 pairs, a quarter of them sit below that. */
export const pyramidDistance = (a: ISOCountryCode, b: ISOCountryCode): number => {
  const left = latestPyramid(a)
  const right = latestPyramid(b)
  if (!left || !right) return 0
  let total = 0
  for (let index = 0; index < left.male.length; index++) {
    total += Math.abs(left.male[index] - right.male[index])
    total += Math.abs(left.female[index] - right.female[index])
  }
  return total
}

/** Every pair in the set clears the floor — the dealer's readability gate. */
export const pyramidsAreDistinct = (
  isoCodes: readonly ISOCountryCode[],
  floor: number
): boolean => {
  for (let i = 0; i < isoCodes.length; i++) {
    for (let j = i + 1; j < isoCodes.length; j++) {
      if (pyramidDistance(isoCodes[i], isoCodes[j]) < floor) return false
    }
  }
  return true
}

/**
 * How the round scales. The floor is the whole difficulty axis: a HIGHER floor
 * means shapes further apart and an easier read, so hard mode lowers it toward
 * the countries that genuinely resemble one another. Subject counts stay small
 * — five pyramids is already a lot of chart to hold in the eye at once.
 */
export const PYRAMID_TUNING = {
  easy: { subjects: 4, floor: 30, durationSeconds: 60 },
  normal: { subjects: 4, floor: 22, durationSeconds: 55 },
  hard: { subjects: 5, floor: 16, durationSeconds: 50 },
} as const satisfies Record<string, { subjects: number; floor: number; durationSeconds: number }>

/** How many random draws the dealer will make before giving the floor up as
 *  unreachable for this board. Measured at ~7 tries for a world board at floor
 *  20, so this is loose enough to never bite in practice. */
export const PYRAMID_DEAL_ATTEMPTS = 400

/**
 * Draw a readable set from `pool`: every pair at least `floor` apart. Returns
 * undefined when the board cannot fill one — a continental variant is a much
 * thinner pool than the world, and the mix should buy another kind rather than
 * deal four pyramids nobody can separate.
 *
 * Both ends read this: the dealer picks with it and the test sweeps it, so the
 * gate the round promises is the gate it actually applies.
 */
export const drawDistinctPyramids = (
  pool: readonly ISOCountryCode[],
  subjects: number,
  floor: number,
  pick: <T>(items: T[]) => T | undefined
): ISOCountryCode[] | undefined => {
  const candidates = pool.filter(isoCode => PYRAMIDS[isoCode])
  if (candidates.length < subjects) return undefined

  for (let attempt = 0; attempt < PYRAMID_DEAL_ATTEMPTS; attempt++) {
    const drawn: ISOCountryCode[] = []
    // Grow one at a time, testing against what is already down: a set that can
    // never be completed dies early instead of after four wasted draws.
    const remaining = [...candidates]
    while (drawn.length < subjects && remaining.length) {
      const next = pick(remaining)
      if (!next) break
      remaining.splice(remaining.indexOf(next), 1)
      if (drawn.every(chosen => pyramidDistance(chosen, next) >= floor)) drawn.push(next)
    }
    if (drawn.length === subjects) return drawn
  }
  return undefined
}

// --- Reading a shape --------------------------------------------------------

const shareBetween = (frame: PopulationPyramid, from: number, to: number): number => {
  let total = 0
  for (let index = from; index < Math.min(to, frame.male.length); index++) {
    total += frame.male[index] + frame.female[index]
  }
  return total
}

/** Share of the country under 15 (cohorts 0-4, 5-9, 10-14). */
export const shareUnder15 = (frame: PopulationPyramid): number => shareBetween(frame, 0, 3)

/** Share of the country 65 and over. */
export const shareOver65 = (frame: PopulationPyramid): number =>
  shareBetween(frame, 13, frame.male.length)

/** Men minus women across the working years (20-49) — the migrant-labour axis.
 *  Measured independent of the age ladder (correlation -0.22), so it is a second
 *  way to tell two pyramids apart, not a restatement of the first. */
export const workingAgeSexSkew = (frame: PopulationPyramid): number => {
  let male = 0
  let female = 0
  for (let index = 4; index < 10; index++) {
    male += frame.male[index]
    female += frame.female[index]
  }
  return male - female
}

/** The shape vocabulary. Naming the family is the transferable lesson — it is
 *  what makes the NEXT pyramid readable, so the reveal always states it. */
export const PYRAMID_FAMILIES = [
  'migrant-slab',
  'expansive',
  'narrowing',
  'coffin',
  'barrel',
] as const
export type PyramidFamily = (typeof PYRAMID_FAMILIES)[number]

export const PYRAMID_FAMILY_LABELS: Record<PyramidFamily, string> = {
  'migrant-slab': 'Migrant-labour slab',
  expansive: 'Expansive triangle',
  narrowing: 'Broad-based, narrowing',
  coffin: 'Constrictive coffin',
  barrel: 'Stationary barrel',
}

/**
 * Most specific first. The coffin test is the under-15 : over-65 RATIO rather
 * than a raw over-65 threshold — a bare threshold filed every rich country as a
 * coffin and the vocabulary stopped discriminating.
 */
export const pyramidFamily = (isoCode: ISOCountryCode): PyramidFamily | undefined => {
  const frame = latestPyramid(isoCode)
  if (!frame) return undefined
  const young = shareUnder15(frame)
  const old = shareOver65(frame)
  if (workingAgeSexSkew(frame) > 12) return 'migrant-slab'
  if (young > 38) return 'expansive'
  if (young > 28) return 'narrowing'
  if (old > young) return 'coffin'
  return 'barrel'
}

// --- The scars: history legible as a dent in a bar chart ---------------------

/**
 * A cohort worth pointing at, and why. `bornFrom` is the year the cohort was
 * born, NOT a fixed bin index: a generation moves up the pyramid one bin per
 * five years, so an index pinned to 2023 points at the wrong bar in 1963.
 * `pyramidScarIndex` resolves it against whichever frame is on screen.
 */
export interface PyramidScar {
  bornFrom: number
  note: string
}

export const PYRAMID_SCARS: Partial<Record<ISOCountryCode, PyramidScar[]>> = {
  DE: [
    {
      bornFrom: 1966,
      note: 'The Pillenknick — the pill arrives in 1965 and births fall off a cliff they never climb back.',
    },
  ],
  CN: [
    {
      bornFrom: 1981,
      note: 'The one-child policy, from 1979: the notch is the generation it prevented.',
    },
  ],
  RU: [
    {
      bornFrom: 1991,
      note: 'An echo of an echo — the thin wartime cohort had few children, who in turn had few.',
    },
  ],
  SY: [
    {
      bornFrom: 2011,
      note: 'War since 2011: a generation displaced, missing from its own country.',
    },
  ],
  RW: [{ bornFrom: 1994, note: 'The 1994 genocide, still legible as a gap in a single cohort.' }],
  JP: [
    {
      bornFrom: 1971,
      note: 'The second post-war boom, and then nothing like it: Japan is fatter at fifty than at five.',
    },
  ],
  KR: [
    {
      bornFrom: 1996,
      note: 'Median age 17.9 to 44.5 in sixty years — the fastest ageing ever recorded.',
    },
  ],
  AE: [
    {
      bornFrom: 1991,
      note: 'Imported labour: through the working years men outnumber women roughly three to one.',
    },
  ],
  QA: [
    {
      bornFrom: 1991,
      note: 'The most male-skewed country on earth — +37 points across ages 20 to 49.',
    },
  ],
  OM: [
    {
      bornFrom: 1991,
      note: 'The Gulf slab: a wall of working-age men, and almost nobody over 65.',
    },
  ],
  SG: [
    {
      bornFrom: 1986,
      note: 'Among the lowest fertility in the world; the base has pulled in beneath the middle.',
    },
  ],
  NE: [{ bornFrom: 2019, note: 'The widest base on earth — nearly half the country is under 15.' }],
  BW: [
    {
      bornFrom: 1971,
      note: 'HIV/AIDS carved into the cohorts who were young adults through the 1990s.',
    },
  ],
  UA: [
    {
      bornFrom: 1996,
      note: 'Births collapsed after 1991, and then came the war: one of Europe’s oldest populations.',
    },
  ],
  IT: [
    {
      bornFrom: 1976,
      note: 'Sixty years of falling births — more Italians are over 65 than under 20.',
    },
  ],
  CU: [
    {
      bornFrom: 1976,
      note: 'A rich-world age structure without the rich-world income: Cuba aged early and fast.',
    },
  ],
}

/** Which bin a scar's cohort occupies in the frame on screen (undefined once it
 *  has aged past the top, or before it was born). */
export const pyramidScarIndex = (scar: PyramidScar, year: number): number | undefined => {
  const index = Math.floor((year - scar.bornFrom) / 5)
  if (index < 0 || index >= PYRAMID_COHORTS.length) return undefined
  return index
}

export const pyramidScar = (isoCode: ISOCountryCode): PyramidScar | undefined =>
  PYRAMID_SCARS[isoCode]?.[0]
