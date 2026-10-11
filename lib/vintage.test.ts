import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { VINTAGE_REGIONS } from '~~/data/vintage.gen'
import { VINTAGE_YEARS } from '~~/data/vintage-years.gen'
import {
  VINTAGE_TUNING,
  pickVintage,
  scoreVintage,
  vintageRuns,
  vintageStory,
  yearsOff,
} from '~~/lib/events/server/vintage-grade'
import {
  VINTAGE_GUESS_SECONDS,
  VINTAGE_LEAD_MS,
  VINTAGE_REWIND_BUDGET_MS,
  VINTAGE_STEP_MAX_MS,
  vintageRewindMs,
  vintageSchedule,
  vintageSeconds,
} from '~~/lib/round-beats'
import {
  arcPoints,
  finalScene,
  sceneAt,
  sceneCount,
  slideOverrides,
  slideTrack,
  stepScene,
} from '~~/lib/vintage'
import { bookends, changelog, clues, dealtRun, vintageVerdict } from '~~/lib/vintage-story'
import type { Game, GameDifficulty } from '~~/types/game.types'
import { VINTAGE_REGION_IDS } from '~~/types/vintage.types'

const sameScene = (a: ReturnType<typeof sceneAt>, b: ReturnType<typeof sceneAt>) => {
  expect([...a.borders].sort((x, y) => x - y)).toEqual([...b.borders].sort((x, y) => x - y))
  expect(a.looks).toEqual(b.looks)
}

const gameOn = (difficulty: GameDifficulty, variant: Game['variant']) =>
  ({ difficulty, variant }) as Game

describe.each(VINTAGE_REGION_IDS)('vintage data: %s', region => {
  const geometry = VINTAGE_REGIONS[region]
  const years = VINTAGE_YEARS[region]

  it('spans every year from the first to 2019 with no gap or overlap', () => {
    expect(years.spans[0][0]).toBe(years.firstYear)
    expect(years.spans[years.spans.length - 1][1]).toBe(2019)
    years.spans.forEach(([from, to], index) => {
      expect(to).toBeGreaterThanOrEqual(from)
      if (index) expect(from).toBe(years.spans[index - 1][1] + 1)
    })
    expect(years.states).toHaveLength(2019 - years.firstYear + 1)
  })

  it('keeps one step between each pair of scenes', () => {
    expect(sceneCount(geometry)).toBe(years.spans.length)
    for (const mode of ['labelled', 'bare'] as const) {
      expect(years.weights[mode]).toHaveLength(geometry.steps.length)
      expect(years.classes[mode]).toHaveLength(years.spans.length)
    }
  })

  it('walks back from 2019 to the first scene and forward again unchanged', () => {
    let scene = sceneAt(geometry, finalScene(geometry))
    for (let index = finalScene(geometry); index > 0; index--)
      scene = stepScene(geometry, scene, index, index - 1)
    sameScene(scene, sceneAt(geometry, 0))
    for (let index = 0; index < finalScene(geometry); index++)
      scene = stepScene(geometry, scene, index, index + 1)
    sameScene(scene, sceneAt(geometry, finalScene(geometry)))
  })

  it('pins every slide to its junctions at both ends', () => {
    for (const step of geometry.steps)
      for (const slide of step.slides) {
        const track = slideTrack(geometry, slide)
        const first = arcPoints(geometry, slide.from[0])[0]
        const toLast = arcPoints(geometry, slide.to[slide.to.length - 1]).at(-1)!
        for (const t of [0, 1]) {
          const overrides = slideOverrides(track, t)
          const lead = slide.from[0]
          const leadPoints = overrides.get(lead < 0 ? ~lead : lead)!
          const start = lead < 0 ? leadPoints.at(-1)! : leadPoints[0]
          expect(start[0]).toBeCloseTo(first[0], 1)
          expect(start[1]).toBeCloseTo(first[1], 1)
        }
        const end = track.to.at(-1)!
        expect(end[0]).toBeCloseTo(toLast[0], 1)
        expect(end[1]).toBeCloseTo(toLast[1], 1)
      }
  })

  it('changes at least one unit at every step, so every step can be told', () => {
    for (const step of geometry.steps) expect(step.units.length).toBeGreaterThan(0)
  })

  it('names and washes every unit it draws', () => {
    for (const step of geometry.steps)
      for (const [, , beforeEra, afterShape, afterEra] of step.units) {
        if (afterShape >= 0) expect(geometry.eras[afterEra]?.name).toBeTruthy()
        if (beforeEra >= 0) expect(geometry.eras[beforeEra]).toBeDefined()
      }
  })
})

describe('vintage answer key boundary', () => {
  it('ships the client geometry without a single year', () => {
    for (const region of VINTAGE_REGION_IDS)
      expect(Object.keys(VINTAGE_REGIONS[region]).sort()).toEqual([
        'arcs',
        'eras',
        'first',
        'frame',
        'shapes',
        'steps',
        'units',
      ])
  })

  it('is imported only by the server grader and the answer loader', () => {
    const root = join(__dirname, '..')
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (
          ['node_modules', '.nuxt', '.output', '.git', '.claude', 'data', 'public'].includes(entry)
        )
          continue
        const path = join(dir, entry)
        if (statSync(path).isDirectory()) walk(path)
        else if (
          /\.(ts|vue)$/.test(entry) &&
          /(from|import\()\s*['"][^'"]*vintage-years\.gen['"]/.test(readFileSync(path, 'utf-8'))
        ) {
          const relative = path.slice(root.length + 1)
          if (
            relative !== 'lib/events/server/vintage-grade.ts' &&
            relative !== 'lib/vintage.test.ts' &&
            !relative.startsWith('generators/')
          )
            offenders.push(relative)
        }
      }
    }
    walk(root)
    expect(offenders).toEqual([])
  })
})

describe('vintage dealer and grader', () => {
  it.each(['easy', 'normal', 'hard'] as const)(
    'never deals below the %s tell floor',
    difficulty => {
      const tuning = VINTAGE_TUNING[difficulty]
      for (const region of VINTAGE_REGION_IDS)
        for (let trial = 0; trial < 60; trial++) {
          const challenge = pickVintage(gameOn(difficulty, region), 10)!
          expect(challenge.region).toBe(region)
          const mode = tuning.labelled ? 'labelled' : 'bare'
          expect(VINTAGE_YEARS[region].tells[mode][challenge.scene]).toBeGreaterThanOrEqual(
            tuning.minTells
          )
          expect(challenge.scene).toBeLessThan(VINTAGE_YEARS[region].spans.length - 1)
          expect(challenge.durationSeconds).toBe(vintageSeconds(challenge.stepWeights))
        }
    }
  )

  it('deals a region at random on a world board', () => {
    const regions = new Set(
      Array.from({ length: 40 }, () => pickVintage(gameOn('normal', 'world'), 10)!.region)
    )
    expect(regions.size).toBe(2)
  })

  it('pays in full inside the runs and tapers monotonically outside', () => {
    const challenge = pickVintage(gameOn('normal', 'africa'), 10)!
    const runs = vintageRuns(challenge)
    expect(runs.length).toBeGreaterThan(0)
    const [from, to] = runs[0]
    const score = (year: number | undefined) =>
      scoreVintage({ challenge, difficulty: 'normal', year }).scored
    expect(score(from)).toBe(10)
    expect(score(to)).toBe(10)
    expect(score(undefined)).toBe(0)
    let previous = 10
    for (let off = 1; off < 40; off++) {
      const year = to + off
      if (yearsOff(runs, year) !== off) break
      const scored = score(year)
      expect(scored).toBeLessThanOrEqual(previous)
      previous = scored
    }
    expect(previous).toBeLessThan(10)
  })

  it('merges look-alike scenes into the runs a bare map cannot tell apart', () => {
    for (const region of VINTAGE_REGION_IDS) {
      const years = VINTAGE_YEARS[region]
      years.spans.forEach((span, scene) => {
        const labelled = vintageRuns({ region, scene, labelled: true } as never)
        const bare = vintageRuns({ region, scene, labelled: false } as never)
        const covered = (runs: [number, number][]) =>
          runs.reduce((sum, [a, b]) => sum + b - a + 1, 0)
        expect(covered(bare)).toBeGreaterThanOrEqual(covered(labelled))
        expect(labelled.some(([a, b]) => span[0] >= a && span[1] <= b)).toBe(true)
      })
    }
  })
})

describe('vintage pacing', () => {
  it('shares the budget by weight, skips weightless steps, and caps each step', () => {
    const schedule = vintageSchedule([1, 0, 3, ...Array.from({ length: 30 }, () => 1)])
    expect(schedule[1][1]).toBe(0)
    expect(schedule[2][1]).toBeGreaterThan(schedule[0][1])
    for (const [, length] of schedule) expect(length).toBeLessThanOrEqual(VINTAGE_STEP_MAX_MS)
    schedule.forEach(([start], index) => {
      if (index) expect(start).toBeCloseTo(schedule[index - 1][0] + schedule[index - 1][1])
    })
  })

  it('never runs far past its budget however many steps it crosses', () => {
    const crowded = Array.from({ length: 120 }, () => 1)
    expect(vintageRewindMs(crowded)).toBeLessThanOrEqual(VINTAGE_REWIND_BUDGET_MS * 1.25 + 1)
  })

  it('leaves the full guess window after the lead and the rewind', () => {
    const weights = VINTAGE_YEARS.europe.weights.labelled
    const seconds = vintageSeconds(weights)
    expect(seconds * 1000 - VINTAGE_LEAD_MS - vintageRewindMs(weights)).toBeGreaterThanOrEqual(
      VINTAGE_GUESS_SECONDS * 1000
    )
  })
})

describe('vintage story', () => {
  const region = 'africa'
  const geometry = VINTAGE_REGIONS[region]

  const dealt = (labelled: boolean) => {
    const challenge = pickVintage(gameOn(labelled ? 'normal' : 'hard', region), 10)!
    const outcome = vintageStory(challenge, labelled ? 'normal' : 'hard')
    return { challenge, outcome, run: dealtRun(outcome, challenge.scene) }
  }

  it('brackets the band with the changes at its edges', () => {
    for (let trial = 0; trial < 30; trial++) {
      const { outcome, run } = dealt(true)
      const { already, notYet } = bookends(geometry, outcome, run, true)
      if (already) expect(already.year).toBe(run[0])
      if (notYet) expect(notYet.year).toBe(run[1] + 1)
    }
  })

  it('names the bookend that rules out a guess on either side', () => {
    for (let trial = 0; trial < 30; trial++) {
      const { outcome, run } = dealt(true)
      const early = vintageVerdict(geometry, outcome, run, true, run[0] - 5)
      const late = vintageVerdict(geometry, outcome, run, true, run[1] + 5)
      const { already, notYet } = bookends(geometry, outcome, run, true)
      if (early.kind === 'early') expect(early.because).toEqual(already)
      if (late.kind === 'late') expect(late.because).toEqual(notYet)
      expect(vintageVerdict(geometry, outcome, run, true, run[0]).kind).toBe('inside')
    }
  })

  it('bounds every clue on the side of the band it sits', () => {
    const { outcome, run } = dealt(true)
    for (const { change, bound } of clues(geometry, outcome, run, true))
      if (bound === 'after') expect(change.year).toBeLessThan(run[0])
      else expect(change.year).toBeGreaterThan(run[1] + 1)
  })

  it('tells everything since the band, oldest first', () => {
    const { outcome, run } = dealt(true)
    const log = changelog(geometry, outcome, run, true)
    expect(log.every(change => change.year > run[1])).toBe(true)
    log.forEach((change, index) => {
      if (index) expect(change.year).toBeGreaterThanOrEqual(log[index - 1].year)
    })
  })

  it('drops renames a bare map cannot show', () => {
    const { outcome, run } = dealt(false)
    for (const change of changelog(geometry, outcome, run, false))
      expect(change.kind).not.toBe('renamed')
  })
})
