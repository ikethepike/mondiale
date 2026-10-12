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

/** Total absolute difference across all 42 bins of the latest frame. Two
 *  countries under ~12 apart are the same picture at a glance — measured over
 *  all 18,721 pairs, 172 of 194 countries have a twin that close. */
export const pyramidDistance = (a: ISOCountryCode, b: ISOCountryCode): number => {
  const left = latestPyramid(a)
  const right = latestPyramid(b)
  return left && right ? frameDistance(left, right) : 0
}

/** The widest the readout's two shares (under 15, 65 and over) ever stood
 *  apart in one frame, in percentage points — what a player can actually see
 *  separate a pair while scrubbing. */
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

/** The median age a country has aged past: the demographic transition as one
 *  dated moment a player can reason about. */
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

/** Years between two countries ageing — wide when the sweep tells their story apart. */
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
 * The decoys are the difficulty axis. Easy deals shapes far from the subject
 * (read the family), normal deals the same broad family (read the
 * proportions), and hard deals lookalikes that aged at least fifteen years
 * apart — so on hard the history IS the clue, and it is a story ("France was
 * already old in 1963; the Balkans caught up by 1978") rather than noise. A
 * bare shape gap in some frame left a quarter of hard deals unreadable by the
 * readout in every year.
 *
 * The band is measured against the subject only, never pairwise between the
 * options: a pairwise floor is what forced every easy deal onto the seven Gulf
 * outliers and starved the continental boards.
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

/** A band that leaves a board fewer subjects than this (or than half the
 *  board, on a small one) borrows a neighbour: most of Africa has not aged
 *  yet, so its hard table alone held five subjects and dealt them every game. */
export const PYRAMID_MIN_SUBJECTS = 12

/**
 * How far a country may be shown beyond what its chance of being the answer
 * justifies, as a share of deals. A fair country sits in `options` deals for
 * every one it answers; Montenegro sat in three hard Europe deals of four and
 * answered one in eleven, so its mere presence said "not this one".
 */
export const PYRAMID_MAX_TELL = 0.1

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

/** How many subjects list each candidate — a decoy's weight is its inverse,
 *  so one that fits half the board is spread across it rather than dealt in
 *  most of its deals. */
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

/**
 * Pick a subject and its decoys from the board's own countries — never the
 * wider world: an off-board option can never be the answer, so on Europe's
 * easy table the one European name gave the round away. A band too thin for
 * the board, or one that would lean on the same decoy deal after deal,
 * borrows the next on `BAND_LADDER`; where none clears both, the least
 * exposed band that still has enough subjects deals. Subjects are drawn
 * uniformly, so no shape is dealt more often than its share of the board.
 * Subjects with a spare decoy come first — one with exactly three was dealt
 * the same trio every time it came up — and a small board that cannot afford
 * that keeps them all.
 */
export const drawPyramidDeal = (
  pool: readonly ISOCountryCode[],
  difficulty: GameDifficulty,
  random: () => number = Math.random
): { country: ISOCountryCode; decoys: ISOCountryCode[] } | undefined => {
  const board = pool.filter(isoCode => PYRAMIDS[isoCode])
  const enough = Math.min(PYRAMID_MIN_SUBJECTS, Math.ceil(board.length / 2))
  const bands: { wanted: number; tables: PyramidTable[]; tell: number }[] = []
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
      if (tables.length >= enough && tell <= PYRAMID_MAX_TELL) {
        return pickTable(tables, wanted, random)
      }
      bands.push({ wanted, tables, tell })
    }
  }
  const chosen =
    bands.filter(band => band.tables.length >= enough).sort((a, b) => a.tell - b.tell)[0] ??
    [...bands].sort((a, b) => b.tables.length - a.tables.length)[0]
  return chosen && pickTable(chosen.tables, chosen.wanted, random)
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

/** Men per 100 women across the working years (20-49). */
export const workingAgeSexRatio = (frame: PopulationPyramid): number => {
  let male = 0
  let female = 0
  for (let index = 4; index < 10; index++) {
    male += frame.male[index]
    female += frame.female[index]
  }
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

/** The then → now numbers a reveal prints, every one read off the frames. */
export const pyramidFactRows = ({ then, now }: PyramidFacts): PyramidFactRow[] => {
  const percent = (value: number) => `${Math.round(value)}%`
  const rows: PyramidFactRow[] = [
    {
      label: 'Median age',
      then: String(Math.round(medianAge(then))),
      now: String(Math.round(medianAge(now))),
    },
    { label: 'Under 15', then: percent(shareUnder15(then)), now: percent(shareUnder15(now)) },
    { label: '65 and over', then: percent(shareOver65(then)), now: percent(shareOver65(now)) },
  ]
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
