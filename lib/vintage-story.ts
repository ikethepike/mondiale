import type { VintageOutcome } from '~~/types/challenges/group-modes.type'
import type { ISOCountryCode } from '~~/types/geography.types'
import type { VintageEra, VintageRegion, VintageWash } from '~~/types/vintage.types'

/**
 * How a Vintage scorecard tells what happened: each step's changes in words,
 * the facts that bracket the dealt map, and the verdict that names the one
 * fact a wrong guess missed. Pure functions over the yearless geometry and
 * the outcome the grader published.
 */

export const WASH_RULERS: Record<VintageWash, string> = {
  gb: 'British',
  fr: 'French',
  pt: 'Portuguese',
  be: 'Belgian',
  es: 'Spanish',
  it: 'Italian',
  de: 'German',
  za: 'South African',
  dk: 'Danish',
  'at-hu': 'Austro-Hungarian',
  ru: 'Russian',
  su: 'Soviet',
  tr: 'Ottoman',
  us: 'American',
  nl: 'Dutch',
  jp: 'Japanese',
  qing: 'Qing',
  contested: 'disputed',
}

export type VintageChangeKind = 'independence' | 'renamed' | 'formed' | 'gone' | 'ruler' | 'moved'

/** Which kind reads clearest when a step holds several — the verdict and the
 *  bookends lead with it. */
const LEGIBILITY: VintageChangeKind[] = [
  'renamed',
  'independence',
  'formed',
  'gone',
  'ruler',
  'moved',
]

export interface VintageChange {
  step: number
  year: number
  unit: number
  gwcode: number
  iso?: ISOCountryCode
  kind: VintageChangeKind
  before?: VintageEra
  after?: VintageEra
  note?: string
}

export const formatYears = ([from, to]: readonly [number, number]) =>
  from === to ? `${from}` : `${from}–${to}`

export const formatRuns = (runs: readonly (readonly [number, number])[]) =>
  runs.map(formatYears).join(', ')

const kindOf = (
  before: VintageEra | undefined,
  after: VintageEra | undefined,
  moved: boolean
): VintageChangeKind | undefined => {
  if (!before) return 'formed'
  if (!after) return 'gone'
  if (!before.sovereign && after.sovereign) return 'independence'
  if (before.name !== after.name) return 'renamed'
  if (before.wash !== after.wash) return 'ruler'
  return moved ? 'moved' : undefined
}

/** Every unit a step changes, in words. `labelled` drops what a bare map
 *  cannot show — a rename alone is invisible without names. */
export const stepChanges = (
  region: VintageRegion,
  outcome: VintageOutcome,
  step: number,
  labelled = true
): VintageChange[] =>
  region.steps[step].units.flatMap(([unit, beforeShape, beforeEra, afterShape, afterEra]) => {
    const before = beforeShape >= 0 ? region.eras[beforeEra] : undefined
    const after = afterShape >= 0 ? region.eras[afterEra] : undefined
    const moved = beforeShape !== afterShape
    let kind = kindOf(before, after, moved)
    if (!labelled && kind === 'renamed') kind = moved ? 'moved' : undefined
    if (!kind) return []
    const { gwcode, iso } = region.units[unit]
    const year = outcome.stepYears[step]
    const note = outcome.notes[`${gwcode}:${year}`]
    return [
      {
        step,
        year,
        unit,
        gwcode,
        ...(iso ? { iso } : {}),
        kind,
        before,
        after,
        ...(note ? { note } : {}),
      },
    ]
  })

const byLegibility = (a: VintageChange, b: VintageChange) =>
  LEGIBILITY.indexOf(a.kind) - LEGIBILITY.indexOf(b.kind) || (b.note ? 1 : 0) - (a.note ? 1 : 0)

export const leadChange = (changes: VintageChange[]) => [...changes].sort(byLegibility)[0]

/** One change as a sentence, in the past tense. */
export const describeChange = ({ kind, before, after }: VintageChange): string => {
  switch (kind) {
    case 'independence':
      return before && after && before.name !== after.name
        ? `${before.name} became independent as ${after.name}`
        : before?.wash && before.wash !== 'contested'
          ? `${after!.name} won independence from ${WASH_RULERS[before.wash]} rule`
          : `${after!.name} became independent`
    case 'renamed':
      return `${before!.name} became ${after!.name}`
    case 'formed':
      return `${after!.name} appeared on the map`
    case 'gone':
      return `${before!.name} vanished from the map`
    case 'ruler':
      return after!.wash
        ? after!.wash === 'contested'
          ? `${after!.name} fell under occupation or dispute`
          : `${after!.name} came under ${WASH_RULERS[after!.wash]} rule`
        : `${after!.name} threw off ${WASH_RULERS[before!.wash!]} rule`
    case 'moved':
      return `${after!.name}'s borders moved`
  }
}

/** The dealt scene's own run — the band the scorecard draws. */
export const dealtRun = (outcome: VintageOutcome, scene: number): [number, number] => {
  const from = scene ? outcome.stepYears[scene - 1] : outcome.firstYear
  return outcome.runs.find(([start, end]) => from >= start && from <= end) ?? outcome.runs[0]
}

export const lastYear = (outcome: VintageOutcome) => outcome.firstYear + outcome.states.length - 1

/** The steps at the band's edges: the latest change already on the map, and
 *  the next one still to come. Either is absent at the timeline's ends. */
export const bookends = (
  region: VintageRegion,
  outcome: VintageOutcome,
  run: [number, number],
  labelled: boolean
) => {
  const stepAt = (year: number) => outcome.stepYears.findIndex(stepYear => stepYear === year)
  const entering = stepAt(run[0])
  const leaving = stepAt(run[1] + 1)
  const lead = (step: number) =>
    step >= 0 ? leadChange(stepChanges(region, outcome, step, labelled)) : undefined
  return { already: lead(entering), notYet: lead(leaving) }
}

export interface VintageClue {
  change: VintageChange
  /** 'after': the map shows it, so the year is at least `change.year`;
   *  'before': the map does not yet, so the year is below it. */
  bound: 'after' | 'before'
}

/** The tells beyond the bookends, closest to the band first. */
export const clues = (
  region: VintageRegion,
  outcome: VintageOutcome,
  run: [number, number],
  labelled: boolean
): VintageClue[] =>
  outcome.stepYears
    .map((year, step) => ({ year, step }))
    .filter(({ year }) => year !== run[0] && year !== run[1] + 1)
    .flatMap(({ year, step }) => {
      const change = leadChange(stepChanges(region, outcome, step, labelled))
      if (!change) return []
      return [{ change, bound: year <= run[0] ? ('after' as const) : ('before' as const) }]
    })
    .sort(
      (a, b) =>
        Math.min(Math.abs(a.change.year - run[0]), Math.abs(a.change.year - run[1])) -
        Math.min(Math.abs(b.change.year - run[0]), Math.abs(b.change.year - run[1]))
    )

/** Everything from the band to 2019, oldest first. */
export const changelog = (
  region: VintageRegion,
  outcome: VintageOutcome,
  run: [number, number],
  labelled: boolean
): VintageChange[] =>
  outcome.stepYears.flatMap((year, step) =>
    year > run[1] ? stepChanges(region, outcome, step, labelled).sort(byLegibility) : []
  )

export type VintageVerdict =
  | { kind: 'inside' }
  /** Outside the band but within the grace that still pays in full. */
  | { kind: 'close'; off: number }
  | { kind: 'early' | 'late'; off: number; because?: VintageChange }
  | { kind: 'none' }

/** Where a guess landed against the dealt map's years — and, for a miss, the
 *  one change that rules it out. */
export const vintageVerdict = (
  region: VintageRegion,
  outcome: VintageOutcome,
  run: [number, number],
  labelled: boolean,
  year: number | undefined
): VintageVerdict => {
  if (year === undefined) return { kind: 'none' }
  const off = Math.min(
    ...outcome.runs.map(([from, to]) => (year < from ? from - year : year > to ? year - to : 0))
  )
  if (!off) return { kind: 'inside' }
  if (off <= outcome.grace) return { kind: 'close', off }
  const { already, notYet } = bookends(region, outcome, run, labelled)
  return year < run[0]
    ? { kind: 'early', off, ...(already ? { because: already } : {}) }
    : { kind: 'late', off, ...(notYet ? { because: notYet } : {}) }
}
