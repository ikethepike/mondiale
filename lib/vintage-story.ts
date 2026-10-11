import { sentenceCase, withArticle as the } from '~~/lib/strings'
import { yearsOff } from '~~/lib/vintage-tuning'
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
  habsburg: 'Habsburg',
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

/** Where a round's story sits in the store: stories arrive per socket, and a
 *  later game's round 3 must never read an earlier one's. */
export const vintageStoryKey = (gameId: string, round: number) => `${gameId}:${round}`

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

/** A change as the yearless client can know it — mid-rewind, before any
 *  answer has been published. */
export type VintageUnitChange = Omit<VintageChange, 'year' | 'note'>

/** Every unit a step changes, in words. `labelled` drops what a bare map
 *  cannot show — a rename alone is invisible without names. */
export const unitChanges = (
  region: VintageRegion,
  step: number,
  labelled = true
): VintageUnitChange[] =>
  region.steps[step].units.flatMap(([unit, beforeShape, beforeEra, afterShape, afterEra]) => {
    const before = beforeShape >= 0 ? region.eras[beforeEra] : undefined
    const after = afterShape >= 0 ? region.eras[afterEra] : undefined
    const moved = beforeShape !== afterShape
    let kind = kindOf(before, after, moved)
    if (!labelled && kind === 'renamed') kind = moved ? 'moved' : undefined
    if (!kind) return []
    const { gwcode, iso } = region.units[unit]
    return [{ step, unit, gwcode, ...(iso ? { iso } : {}), kind, before, after }]
  })

export const stepChanges = (
  region: VintageRegion,
  outcome: VintageOutcome,
  step: number,
  labelled = true
): VintageChange[] =>
  unitChanges(region, step, labelled).map(change => {
    const year = outcome.stepYears[step]
    const note = outcome.notes[`${change.gwcode}:${year}`]
    return { ...change, year, ...(note ? { note } : {}) }
  })

const byLegibility = (
  a: VintageUnitChange & { note?: string },
  b: VintageUnitChange & { note?: string }
) => LEGIBILITY.indexOf(a.kind) - LEGIBILITY.indexOf(b.kind) || (b.note ? 1 : 0) - (a.note ? 1 : 0)

export const leadChange = <Change extends VintageUnitChange & { note?: string }>(
  changes: Change[]
): Change | undefined => [...changes].sort(byLegibility)[0]

/** One change as a clause, in the past tense — it may open with "the", so a
 *  line that starts with it wraps it in `sentenceCase`. */
export const describeChange = ({ kind, before, after }: VintageUnitChange): string => {
  switch (kind) {
    case 'independence':
      return before && after && before.name !== after.name
        ? `${the(before.name)} became independent as ${the(after.name)}`
        : before?.wash && before.wash !== 'contested'
          ? `${the(after!.name)} won independence from ${WASH_RULERS[before.wash]} rule`
          : `${the(after!.name)} became independent`
    case 'renamed':
      return `${the(before!.name)} became ${the(after!.name)}`
    case 'formed':
      return `${the(after!.name)} appeared on the map`
    case 'gone':
      return `${the(before!.name)} vanished from the map`
    case 'ruler':
      return after!.wash
        ? after!.wash === 'contested'
          ? `${the(after!.name)} fell under occupation or dispute`
          : `${the(after!.name)} came under ${WASH_RULERS[after!.wash]} rule`
        : `${the(after!.name)} threw off ${WASH_RULERS[before!.wash!]} rule`
    case 'moved':
      return `${the(after!.name)}'s borders moved`
  }
}

/** The same change undone, as the rewind plays it: present tense, named the
 *  way the map is about to read. */
export const describeRewind = (change: VintageUnitChange): string => sentenceCase(rewound(change))

const rewound = ({ kind, before, after }: VintageUnitChange): string => {
  const ruler = (wash: VintageWash | undefined) =>
    wash && wash !== 'contested' ? WASH_RULERS[wash] : undefined
  switch (kind) {
    case 'independence': {
      const renamed = before!.name !== after!.name
      const under = ruler(before!.wash)
      if (under)
        return renamed
          ? `${the(after!.name)} is ${the(before!.name)} again, under ${under} rule`
          : `${the(after!.name)} returns to ${under} rule`
      return renamed
        ? `${the(after!.name)} is ${the(before!.name)} again`
        : `${the(after!.name)} is not yet independent`
    }
    case 'renamed':
      return `${the(after!.name)} is ${the(before!.name)} again`
    case 'formed':
      return `${the(after!.name)} disappears from the map`
    case 'gone':
      return `${the(before!.name)} returns to the map`
    case 'ruler': {
      if (before!.wash === 'contested') return `${the(before!.name)} is occupied or disputed again`
      const was = ruler(before!.wash)
      if (was) return `${the(before!.name)} returns to ${was} rule`
      return after!.wash === 'contested'
        ? `${the(before!.name)} is no longer occupied or disputed`
        : `${the(before!.name)} leaves ${ruler(after!.wash)} rule`
    }
    case 'moved':
      return `${the(before!.name)}'s borders shift`
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

/** Each change kind as a label — the changelog's chips, the dossier's eyebrow. */
export const CHANGE_LABELS: Record<VintageChangeKind, string> = {
  independence: 'Independence',
  renamed: 'Renamed',
  formed: 'New on the map',
  gone: 'Gone from the map',
  ruler: 'New rule',
  moved: 'Border moved',
}

export const yearsWord = (count: number) => `${count} ${count === 1 ? 'year' : 'years'}`

/** The fact that rules a miss out, as a clause: the change the map had not
 *  made yet, or had already made. Empty for anything but a miss. */
export const verdictReason = (verdict: VintageVerdict): string => {
  if ((verdict.kind !== 'early' && verdict.kind !== 'late') || !verdict.because) return ''
  const sentence = describeChange(verdict.because)
  return verdict.kind === 'late'
    ? `the map hadn't changed yet: ${sentence} only in ${verdict.because.year}.`
    : `that had already happened: ${sentence} in ${verdict.because.year}.`
}

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
  const off = yearsOff(outcome.runs, year)
  if (!off) return { kind: 'inside' }
  if (off <= outcome.grace) return { kind: 'close', off }
  const { already, notYet } = bookends(region, outcome, run, labelled)
  return year < run[0]
    ? { kind: 'early', off, ...(already ? { because: already } : {}) }
    : { kind: 'late', off, ...(notYet ? { because: notYet } : {}) }
}
