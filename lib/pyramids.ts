import { PYRAMIDS } from '~~/data/pyramids.gen'
import type { PopulationPyramid, PyramidSeries } from '~~/generators/vendors/unwpp/create-wpp'
import type { GameDifficulty } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'
import { sample, weightedPick } from './arrays'
import { clamp } from './number'

/**
 * Population pyramids: the one home for reading a country's age structure —
 * frame interpolation, shape distance (what the dealer's decoys are measured
 * by), the shape family vocabulary, the derived facts and the historical scars
 * the reveal annotates.
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

// --- Shape distance: what the decoys are measured by -----------------------

const frameDistance = (left: PopulationPyramid, right: PopulationPyramid): number => {
  let total = 0
  for (let index = 0; index < left.male.length; index++) {
    total += Math.abs(left.male[index] - right.male[index])
    total += Math.abs(left.female[index] - right.female[index])
  }
  return total
}

/** Total absolute difference across all 42 bins of the latest frame. */
export const pyramidDistance = (a: ISOCountryCode, b: ISOCountryCode): number => {
  const left = latestPyramid(a)
  const right = latestPyramid(b)
  return left && right ? frameDistance(left, right) : 0
}

/** The widest the readout's two shares (under 15, 65 and over) stand apart
 *  in any one frame, in percentage points. */
export const pyramidReadoutGap = (a: ISOCountryCode, b: ISOCountryCode): number => {
  const left = PYRAMIDS[a]
  const right = PYRAMIDS[b]
  if (!left || !right) return 0
  let widest = 0
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    const gap =
      Math.abs(shareUnder15(left[index]) - shareUnder15(right[index])) +
      Math.abs(shareOver65(left[index]) - shareOver65(right[index]))
    widest = Math.max(widest, gap)
  }
  return widest
}

/** The median age that dates a country's demographic transition. */
export const PYRAMID_AGED_MEDIAN = 25

/** When the median age first reached `PYRAMID_AGED_MEDIAN`: already `before`
 *  the sweep, in a frame's year, or `never` within it. */
export type PyramidAgedAt = number | 'before' | 'never'

export const pyramidAgedAt = (isoCode: ISOCountryCode): PyramidAgedAt | undefined => {
  const series = PYRAMIDS[isoCode]
  if (!series?.length) return undefined
  const index = series.findIndex(frame => medianAge(frame) >= PYRAMID_AGED_MEDIAN)
  if (index < 0) return 'never'
  return index === 0 ? 'before' : series[index].year
}

/** The aged moment on one axis: a step outside the sweep at either end. */
const agedYear = (aged: PyramidAgedAt): number => {
  const step = PYRAMID_YEARS[1] - PYRAMID_YEARS[0]
  if (aged === 'before') return PYRAMID_YEARS[0] - step
  if (aged === 'never') return PYRAMID_YEARS[PYRAMID_YEARS.length - 1] + step
  return aged
}

export const pyramidAgedLabel = (aged: PyramidAgedAt): string => {
  if (aged === 'before') return `Median ${PYRAMID_AGED_MEDIAN}+ before ${PYRAMID_YEARS[0]}`
  if (aged === 'never') return `Median still under ${PYRAMID_AGED_MEDIAN}`
  return `Median hit ${PYRAMID_AGED_MEDIAN} in ${aged}`
}

export const pyramidAgedApart = (a: ISOCountryCode, b: ISOCountryCode): number => {
  const left = pyramidAgedAt(a)
  const right = pyramidAgedAt(b)
  return left === undefined || right === undefined ? 0 : Math.abs(agedYear(left) - agedYear(right))
}

/** How alike a decoy may be to the subject: `today*` in `pyramidDistance`
 *  units, `agedApart` in years, `readoutFrom` in `pyramidReadoutGap` points. */
export interface PyramidDecoyBand {
  todayFrom?: number
  todayBelow?: number
  agedApart?: number
  readoutFrom?: number
}

/**
 * The decoys are the difficulty axis: far from the subject on easy, the same
 * broad family on normal, and on hard lookalikes that aged years apart, so the
 * sweep carries the clue. Measured against the subject only — a pairwise floor
 * between the options looks equivalent but deals nothing but outliers.
 */
export const PYRAMID_TUNING = {
  easy: { options: 4, attempts: 2, durationSeconds: 40, decoys: { todayFrom: 25 } },
  normal: {
    options: 4,
    attempts: 2,
    durationSeconds: 40,
    decoys: { todayFrom: 12, todayBelow: 25 },
  },
  hard: {
    options: 4,
    attempts: 2,
    durationSeconds: 45,
    decoys: { todayBelow: 14, agedApart: 15, readoutFrom: 6 },
  },
} as const satisfies Record<
  GameDifficulty,
  { options: number; attempts: number; durationSeconds: number; decoys: PyramidDecoyBand }
>

export const pyramidDecoyFits = (
  subject: ISOCountryCode,
  candidate: ISOCountryCode,
  band: PyramidDecoyBand
): boolean => {
  if (candidate === subject || !PYRAMIDS[candidate]) return false
  const today = pyramidDistance(subject, candidate)
  if (band.todayFrom !== undefined && today < band.todayFrom) return false
  if (band.todayBelow !== undefined && today >= band.todayBelow) return false
  if (band.agedApart !== undefined && pyramidAgedApart(subject, candidate) < band.agedApart) {
    return false
  }
  return band.readoutFrom === undefined || pyramidReadoutGap(subject, candidate) >= band.readoutFrom
}

/** How many guesses a deal allows. A hard table that had to borrow an easier
 *  band keeps hard's bite another way: one guess, all or nothing. */
export const pyramidAttempts = (difficulty: GameDifficulty, band: GameDifficulty): number =>
  difficulty === 'hard' && band !== 'hard' ? 1 : PYRAMID_TUNING[difficulty].attempts

/** A band that leaves a board fewer subjects than this (or than half the
 *  board, on a small one) borrows a neighbour on `BAND_LADDER`. */
const PYRAMID_MIN_SUBJECTS = 12

/** How far a country may be shown beyond what its chance of being the answer
 *  justifies, as a share of deals — past it, its presence alone says "not
 *  this one". A fair country sits in `options` deals for every one it answers. */
const PYRAMID_MAX_TELL = 0.1

/** Which bands a difficulty may borrow, nearest first. */
const BAND_LADDER: Record<GameDifficulty, GameDifficulty[]> = {
  easy: ['easy', 'normal'],
  normal: ['normal', 'easy', 'hard'],
  hard: ['hard', 'normal'],
}

interface PyramidTable {
  country: ISOCountryCode
  candidates: ISOCountryCode[]
}

/** How many subjects list each candidate; a decoy is drawn by its inverse. */
const listingsOf = (tables: PyramidTable[]): Map<ISOCountryCode, number> => {
  const listings = new Map<ISOCountryCode, number>()
  for (const { candidates } of tables) {
    for (const isoCode of candidates) listings.set(isoCode, (listings.get(isoCode) ?? 0) + 1)
  }
  return listings
}

/** How much the options alone give away: the largest share of deals any
 *  country is shown beyond `options` times its share as the answer. */
const tellOf = (tables: PyramidTable[], wanted: number): number => {
  const listings = listingsOf(tables)
  const deals = tables.length || 1
  const excess = new Map<ISOCountryCode, number>()
  const add = (isoCode: ISOCountryCode, share: number) =>
    excess.set(isoCode, (excess.get(isoCode) ?? 0) + share / deals)
  for (const { country, candidates } of tables) {
    add(country, 1 - (wanted + 1))
    const total = candidates.reduce((sum, isoCode) => sum + 1 / listings.get(isoCode)!, 0)
    for (const isoCode of candidates) {
      add(isoCode, Math.min(1, wanted / listings.get(isoCode)! / total))
    }
  }
  return Math.max(0, ...excess.values())
}

const pickTable = (
  tables: PyramidTable[],
  wanted: number,
  random: () => number
): { country: ISOCountryCode; decoys: ISOCountryCode[] } | undefined => {
  const table = sample(tables, random)
  if (!table) return undefined
  const listings = listingsOf(tables)
  const remaining = [...table.candidates]
  const decoys: ISOCountryCode[] = []
  while (decoys.length < wanted && remaining.length) {
    const decoy = weightedPick(
      remaining.map(isoCode => [isoCode, 1 / listings.get(isoCode)!] as const),
      random
    )!
    decoys.push(decoy)
    remaining.splice(remaining.indexOf(decoy), 1)
  }
  return { country: table.country, decoys }
}

const dealFrom = (
  { band, wanted, tables }: { band: GameDifficulty; wanted: number; tables: PyramidTable[] },
  random: () => number
) => {
  const deal = pickTable(tables, wanted, random)
  return deal && { ...deal, band }
}

/**
 * A subject, uniformly, and its decoys from the board's own countries — never
 * the wider world, since an off-board option can never be the answer. A band
 * too thin for the board or past `PYRAMID_MAX_TELL` borrows the next on
 * `BAND_LADDER`; where none clears both, the least telling band with enough
 * subjects deals. Subjects with a spare decoy come first, or one with exactly
 * three is dealt the same trio every time. `band` is the one actually dealt.
 */
export const drawPyramidDeal = (
  pool: readonly ISOCountryCode[],
  difficulty: GameDifficulty,
  random: () => number = Math.random
): { country: ISOCountryCode; decoys: ISOCountryCode[]; band: GameDifficulty } | undefined => {
  const board = pool.filter(isoCode => PYRAMIDS[isoCode])
  const enough = Math.min(PYRAMID_MIN_SUBJECTS, Math.ceil(board.length / 2))
  const bands: { band: GameDifficulty; wanted: number; tables: PyramidTable[]; tell: number }[] = []
  for (const band of BAND_LADDER[difficulty]) {
    const wanted = PYRAMID_TUNING[band].options - 1
    const listed = board.flatMap(country => {
      const candidates = board.filter(isoCode =>
        pyramidDecoyFits(country, isoCode, PYRAMID_TUNING[band].decoys)
      )
      return candidates.length < wanted ? [] : [{ country, candidates }]
    })
    const spare = listed.filter(table => table.candidates.length > wanted)
    for (const tables of [spare, listed]) {
      const tell = tellOf(tables, wanted)
      const deal = { band, wanted, tables, tell }
      if (tables.length >= enough && tell <= PYRAMID_MAX_TELL) return dealFrom(deal, random)
      bands.push(deal)
    }
  }
  const chosen =
    bands.filter(band => band.tables.length >= enough).sort((a, b) => a.tell - b.tell)[0] ??
    [...bands].sort((a, b) => b.tables.length - a.tables.length)[0]
  return chosen && dealFrom(chosen, random)
}

// --- Reading a shape --------------------------------------------------------

const shareBetween = (frame: PopulationPyramid, from: number, to: number): number => {
  let total = 0
  for (let index = from; index < Math.min(to, frame.male.length); index++) {
    total += frame.male[index] + frame.female[index]
  }
  return total
}

/** The cohort boundaries the shape families are read on: the first
 *  `PYRAMID_CHILD_COHORTS` bins are under 15, bins from `PYRAMID_ELDER_COHORT`
 *  on are 65 and over. */
export const PYRAMID_CHILD_COHORTS = 3
export const PYRAMID_ELDER_COHORT = 13
/** The age a cohort starts at, read off its label. */
export const pyramidCohortAge = (cohort: number): number =>
  Number.parseInt(PYRAMID_COHORTS[cohort] ?? '', 10)

/** The chart's viewBox: bars in `width` by `height`, taller than wide so 21
 *  cohorts read, with the age ticks in a gutter to the left when annotated. */
export const PYRAMID_CHART = { width: 100, height: 88, ageGutter: 7 } as const
/** Ages 20-49: the working years a migrant-labour slab swells. */
const WORKING_COHORTS = [4, 10] as const

export const shareUnder15 = (frame: PopulationPyramid): number =>
  shareBetween(frame, 0, PYRAMID_CHILD_COHORTS)

export const shareOver65 = (frame: PopulationPyramid): number =>
  shareBetween(frame, PYRAMID_ELDER_COHORT, frame.male.length)

const workingAgeSexes = (frame: PopulationPyramid): { male: number; female: number } => {
  let male = 0
  let female = 0
  for (let index = WORKING_COHORTS[0]; index < WORKING_COHORTS[1]; index++) {
    male += frame.male[index]
    female += frame.female[index]
  }
  return { male, female }
}

/** Men minus women across the working years — the migrant-labour axis, and
 *  independent of the age ladder, so a second way to tell shapes apart. */
export const workingAgeSexSkew = (frame: PopulationPyramid): number => {
  const { male, female } = workingAgeSexes(frame)
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

/** What each shape says about the country wearing it — the sentence that
 *  makes the next pyramid readable. */
export const PYRAMID_FAMILY_LESSONS: Record<PyramidFamily, string> = {
  'migrant-slab':
    'Imported workers, mostly men, swell the working ages while the base and the top stay thin.',
  expansive:
    'Many births and short lives: every cohort outnumbers the one above it. The start of the demographic transition.',
  narrowing: 'Births have begun to fall. The base is still broad, but it has stopped widening.',
  coffin:
    'A generation of low births: fewer children than pensioners, and a heavy middle on a narrow base.',
  barrel:
    'Births near replacement for a generation, so the cohorts stack up almost straight-sided.',
}

/**
 * Most specific first. The coffin test is the under-15 : over-65 RATIO rather
 * than a raw over-65 threshold — a bare threshold filed every rich country as a
 * coffin and the vocabulary stopped discriminating.
 */
export const frameFamily = (frame: PopulationPyramid): PyramidFamily => {
  const young = shareUnder15(frame)
  const old = shareOver65(frame)
  if (workingAgeSexSkew(frame) > 12) return 'migrant-slab'
  if (young > 38) return 'expansive'
  if (young > 28) return 'narrowing'
  if (old > young) return 'coffin'
  return 'barrel'
}

export const pyramidFamily = (isoCode: ISOCountryCode): PyramidFamily | undefined => {
  const frame = latestPyramid(isoCode)
  return frame && frameFamily(frame)
}

/** The age half the country is younger than, interpolated inside its cohort. */
export const medianAge = (frame: PopulationPyramid): number => {
  const total = shareBetween(frame, 0, frame.male.length)
  let below = 0
  for (let index = 0; index < frame.male.length; index++) {
    const cohort = frame.male[index] + frame.female[index]
    if (below + cohort >= total / 2) return 5 * index + (5 * (total / 2 - below)) / (cohort || 1)
    below += cohort
  }
  return 5 * frame.male.length
}

/** Men per 100 women across the working years. */
const workingAgeSexRatio = (frame: PopulationPyramid): number => {
  const { male, female } = workingAgeSexes(frame)
  return female ? (100 * male) / female : 100
}

export interface PyramidFacts {
  then: PopulationPyramid
  now: PopulationPyramid
  /** The roster's nearest shape today. */
  twin: ISOCountryCode | undefined
}

export const pyramidFacts = (isoCode: ISOCountryCode): PyramidFacts | undefined => {
  const series = PYRAMIDS[isoCode]
  if (!series?.length) return undefined
  let twin: ISOCountryCode | undefined
  let nearest = Number.POSITIVE_INFINITY
  for (const other of PYRAMID_COUNTRIES) {
    if (other === isoCode) continue
    const distance = pyramidDistance(isoCode, other)
    if (distance < nearest) [nearest, twin] = [distance, other]
  }
  return {
    then: series[0],
    now: series[series.length - 1],
    twin,
  }
}

export interface PyramidFactRow {
  label: string
  then: string
  now: string
}

/** Below this, or above its mirror, the working years are visibly lopsided. */
const SEX_RATIO_NOTABLE = { below: 92, above: 110 }

const percent = (value: number) => `${Math.round(value)}%`
const READOUT: { label: string; read: (frame: PopulationPyramid) => string }[] = [
  { label: 'Median age', read: frame => String(Math.round(medianAge(frame))) },
  { label: 'Under 15', read: frame => percent(shareUnder15(frame)) },
  { label: '65 and over', read: frame => percent(shareOver65(frame)) },
]

/** One frame's headline numbers, as the round's live readout prints them. */
export const pyramidReadout = (frame: PopulationPyramid): { label: string; value: string }[] =>
  READOUT.map(({ label, read }) => ({ label, value: read(frame) }))

/** The then → now numbers a reveal prints, every one read off the frames. */
export const pyramidFactRows = ({ then, now }: PyramidFacts): PyramidFactRow[] => {
  const rows: PyramidFactRow[] = READOUT.map(({ label, read }) => ({
    label,
    then: read(then),
    now: read(now),
  }))
  const ratio = workingAgeSexRatio(now)
  if (ratio < SEX_RATIO_NOTABLE.below || ratio > SEX_RATIO_NOTABLE.above) {
    rows.push({
      label: 'Men per 100 women, 20–49',
      then: String(Math.round(workingAgeSexRatio(then))),
      now: String(Math.round(ratio)),
    })
  }
  return rows
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
  FR: [
    {
      bornFrom: 1915,
      note: 'The First World War’s missing births, 1915–19 — a hollow France carried to the top of its pyramid.',
    },
  ],
  HU: [
    {
      bornFrom: 1956,
      note: 'The Ratkó era: abortion was banned from 1950 to 1956, and the births still bulge seventy years on.',
    },
  ],
  RO: [
    {
      bornFrom: 1971,
      note: 'Decree 770 banned abortion in 1966, and births almost doubled the following year.',
    },
  ],
  KH: [
    {
      bornFrom: 1975,
      note: 'The Khmer Rouge years, 1975–79: famine, killing and forced labour left a cohort barely born.',
    },
  ],
  IE: [
    {
      bornFrom: 1980,
      note: 'A late baby boom — Irish births peaked in 1980, long after the rest of Western Europe’s.',
    },
  ],
  ES: [
    {
      bornFrom: 1976,
      note: 'Births peaked in 1976; by the late 1990s Spain had some of the lowest fertility ever recorded.',
    },
  ],
  PL: [
    {
      bornFrom: 1983,
      note: 'An echo boom: the children of the post-war generation, peaking in 1983.',
    },
  ],
  FI: [
    {
      bornFrom: 1946,
      note: 'One of Europe’s sharpest post-war booms — over 100,000 births a year from 1946 to 1950.',
    },
  ],
  AM: [
    {
      bornFrom: 1993,
      note: 'The last big Soviet cohort: after independence, births more than halved within a decade.',
    },
  ],
  DE: [
    {
      bornFrom: 1966,
      note: 'The Pillenknick — the pill arrives in 1965 and births fall off a cliff they never climb back.',
    },
  ],
  CN: [
    {
      bornFrom: 1961,
      note: 'The Great Leap Forward famine, 1959–61: tens of millions died and births collapsed.',
    },
    {
      bornFrom: 1981,
      note: 'The one-child policy, from 1979: the notch is the generation it prevented.',
    },
  ],
  RU: [
    {
      bornFrom: 1946,
      note: 'The births the Second World War never allowed — a notch that climbs the whole sweep.',
    },
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
      bornFrom: 1951,
      note: 'The dankai generation: the post-war boom of 1947–49, now Japan’s great wave of pensioners.',
    },
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
      bornFrom: 1946,
      note: 'The Second World War’s missing births, carried up the pyramid for sixty years.',
    },
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

export const pyramidScars = (isoCode: ISOCountryCode): PyramidScar[] => PYRAMID_SCARS[isoCode] ?? []
