import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { beforeAll, describe, expect, it } from 'vitest'
import { VINTAGE_YEARS } from '~~/data/vintage-years.gen'
import {
  dealableScenes,
  pickVintage,
  vintageChallengeFor,
  scoreVintage,
  vintageRuns,
  vintageStory,
  yearsOff,
} from '~~/lib/events/server/vintage-grade'
import {
  VINTAGE_CAPTION_MS,
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
  loadVintageRegion,
  passCaptions,
  passLengthMs,
  passStep,
  sceneAt,
  sceneCount,
  shapePath,
  slideLine,
  slideOverrides,
  slideTrack,
  stepScene,
  type ArcOverrides,
} from '~~/lib/vintage'
import {
  bookends,
  changelog,
  clues,
  dealtRun,
  describeRewind,
  leadChange,
  unitChanges,
  vintageVerdict,
} from '~~/lib/vintage-story'
import {
  VINTAGE_TUNING,
  legibleFame,
  sceneLegibility,
  vintageFameWeight,
} from '~~/lib/vintage-tuning'
import { isFameDealable } from '~~/types/fame.types'
import { withArticle } from '~~/lib/strings'
import type { Game, GameDifficulty } from '~~/types/game.types'
import {
  VINTAGE_REGION_IDS,
  VINTAGE_REGIONS_BY_VARIANT,
  type VintageRegion,
  type VintageRegionId,
} from '~~/types/vintage.types'

const VINTAGE_REGIONS = {} as Record<VintageRegionId, VintageRegion>
beforeAll(async () => {
  for (const id of VINTAGE_REGION_IDS) VINTAGE_REGIONS[id] = await loadVintageRegion(id)
})

const sameScene = (a: ReturnType<typeof sceneAt>, b: ReturnType<typeof sceneAt>) => {
  expect([...a.borders].sort((x, y) => x - y)).toEqual([...b.borders].sort((x, y) => x - y))
  expect(a.looks).toEqual(b.looks)
}

const gameOn = (difficulty: GameDifficulty, variant: Game['variant']) =>
  ({ difficulty, variant, rounds: [] }) as unknown as Game

describe.each(VINTAGE_REGION_IDS)('vintage data: %s', region => {
  let geometry: VintageRegion
  beforeAll(() => {
    geometry = VINTAGE_REGIONS[region]
  })
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

  it('slides start on the old border and land exactly on the new one', () => {
    const near = (a: [number, number], b: [number, number]) => {
      expect(a[0]).toBeCloseTo(b[0], 1)
      expect(a[1]).toBeCloseTo(b[1], 1)
    }
    for (const step of geometry.steps)
      for (const slide of step.slides) {
        const track = slideTrack(geometry, slide)
        const fromStart = arcPoints(geometry, slide.from[0])[0]!
        const fromEnd = arcPoints(geometry, slide.from[slide.from.length - 1]).at(-1)!
        const toStart = arcPoints(geometry, slide.to[0])[0]!
        const toEnd = arcPoints(geometry, slide.to[slide.to.length - 1]).at(-1)!
        near(slideLine(track, 0)[0]!, fromStart)
        near(slideLine(track, 0).at(-1)!, fromEnd)
        near(slideLine(track, 1)[0]!, toStart)
        near(slideLine(track, 1).at(-1)!, toEnd)
      }
  })

  it('builds cached and bent fills exactly as the arcs spell them out', () => {
    const spelled = (shape: number, overrides?: ArcOverrides) =>
      geometry.shapes[shape].rings
        .map(ring => {
          const points = ring.flatMap((signed, index) => {
            const own = overrides?.get(signed < 0 ? ~signed : signed)
            const run = own ? (signed < 0 ? [...own].reverse() : own) : arcPoints(geometry, signed)
            return index ? run.slice(1) : run
          })
          return `${points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join('')}Z`
        })
        .join('')
    geometry.shapes.forEach((_, shape) => expect(shapePath(geometry, shape)).toBe(spelled(shape)))
    for (const step of geometry.steps) {
      if (!step.slides.length) continue
      const overrides: ArcOverrides = new Map()
      for (const slide of step.slides) slideOverrides(slideTrack(geometry, slide), 0.5, overrides)
      for (const [, beforeShape] of step.units)
        if (beforeShape >= 0)
          expect(shapePath(geometry, beforeShape, overrides)).toBe(spelled(beforeShape, overrides))
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

describe('vintage rewind captions', () => {
  it('words every change the rewind can undo', () => {
    for (const id of VINTAGE_REGION_IDS) {
      const region = VINTAGE_REGIONS[id]
      region.steps.forEach((_, step) => {
        const lead = leadChange(unitChanges(region, step))
        expect(lead, `${id} step ${step}`).toBeDefined()
        const line = describeRewind(lead!)
        expect(line).not.toMatch(/undefined|null/)
      })
    }
  })

  it('names a polity the way prose does', () => {
    expect(withArticle('Soviet Union')).toBe('the Soviet Union')
    expect(withArticle('Gold Coast')).toBe('the Gold Coast')
    expect(withArticle('Empire of Japan')).toBe('the Empire of Japan')
    expect(withArticle('Ghana')).toBe('Ghana')
    expect(withArticle('Allied-occupied Germany')).toBe('Allied-occupied Germany')
  })

  it('holds each line long enough to read and never runs ahead of its step', () => {
    for (const id of VINTAGE_REGION_IDS) {
      const region = VINTAGE_REGIONS[id]
      const pass = {
        from: finalScene(region),
        to: 0,
        weights: VINTAGE_YEARS[id].weights.labelled.slice().reverse(),
        budgetMs: VINTAGE_REWIND_BUDGET_MS,
        leadMs: VINTAGE_LEAD_MS,
      }
      const schedule = vintageSchedule(pass.weights, pass.budgetMs)
      const captions = passCaptions(pass, VINTAGE_CAPTION_MS)
      expect(captions.length).toBeGreaterThan(0)
      captions.forEach(({ atMs, crossing }, index) => {
        expect(atMs).toBeGreaterThanOrEqual(pass.leadMs + schedule[crossing][0])
        expect(atMs).toBeLessThan(passLengthMs(pass))
        if (index) {
          expect(atMs - captions[index - 1].atMs).toBeGreaterThanOrEqual(VINTAGE_CAPTION_MS)
          expect(crossing).toBeGreaterThan(captions[index - 1].crossing)
        }
        const step = passStep(pass, crossing)
        expect(step).toBe(pass.from - crossing - 1)
      })
    }
  })
})

describe('vintage legibility', () => {
  const spans: [number, number][] = [
    [1900, 1949],
    [1950, 1959],
    [1960, 2019],
  ]
  const classes = [0, 1, 2]

  it('pays a scene bracketed by landmarks in full', () => {
    const [, middle] = sceneLegibility({ spans, classes, salience: [0.2, 0.2] })
    expect(legibleFame(middle)).toBe('major')
    expect(middle).toBeCloseTo(1, 5)
  })

  it('sinks a scene whose only tells are too small to see', () => {
    const [, middle] = sceneLegibility({ spans, classes, salience: [0.001, 0.001] })
    expect(legibleFame(middle)).toBe('obscure')
  })

  it('lets a faint edge widen the window on one side only', () => {
    const [, sharp] = sceneLegibility({ spans, classes, salience: [0.2, 0.2] })
    const [, faint] = sceneLegibility({ spans, classes, salience: [0.2, 0.001] })
    expect(faint).toBeLessThan(sharp)
    expect(faint).toBeGreaterThan(sceneLegibility({ spans, classes, salience: [0.001, 0.001] })[1])
  })

  it('stamps a tier on every scene of every region', () => {
    for (const region of VINTAGE_REGION_IDS)
      expect(VINTAGE_YEARS[region].fame).toHaveLength(VINTAGE_YEARS[region].spans.length)
  })
})

describe('vintage dealer and grader', () => {
  it.each(['easy', 'normal', 'hard'] as const)(
    'never deals below the %s tell floor',
    difficulty => {
      const tuning = VINTAGE_TUNING[difficulty]
      const mode = tuning.labelled ? 'labelled' : 'bare'
      for (const region of VINTAGE_REGION_IDS)
        for (const scene of dealableScenes(region, difficulty)) {
          expect(VINTAGE_YEARS[region].tells[mode][scene]).toBeGreaterThanOrEqual(tuning.minTells)
          expect(isFameDealable(VINTAGE_YEARS[region].fame[scene], difficulty)).toBe(true)
          expect(scene).toBeLessThan(VINTAGE_YEARS[region].spans.length - 1)
          const challenge = vintageChallengeFor(region, scene, difficulty, 10)
          expect(challenge.durationSeconds).toBe(vintageSeconds(challenge.stepWeights))
        }
    }
  )

  it('gives every region something to deal on hard', () => {
    for (const region of VINTAGE_REGION_IDS)
      expect(dealableScenes(region, 'hard').length, region).toBeGreaterThan(0)
  })

  it('keeps every board but the sparse ones dealing at every difficulty', () => {
    for (const variant of Object.keys(VINTAGE_REGIONS_BY_VARIANT) as Game['variant'][])
      for (const difficulty of ['easy', 'normal', 'hard'] as const) {
        const dealt = pickVintage(gameOn(difficulty, variant), 10)
        if (variant === 'south-america' && difficulty !== 'hard') expect(dealt).toBeUndefined()
        else expect(dealt, `${variant} ${difficulty}`).toBeDefined()
      }
  })

  it('deals only the board’s own regions', () => {
    for (const variant of Object.keys(VINTAGE_REGIONS_BY_VARIANT) as Game['variant'][])
      for (let trial = 0; trial < 30; trial++) {
        const challenge = pickVintage(gameOn('normal', variant), 10)
        if (challenge) expect(VINTAGE_REGIONS_BY_VARIANT[variant]).toContain(challenge.region)
      }
  })

  it('deals every region somewhere on a world board', () => {
    const regions = new Set(
      Array.from({ length: 300 }, () => pickVintage(gameOn('hard', 'world'), 10)!.region)
    )
    expect(regions.size).toBe(VINTAGE_REGION_IDS.length)
  })

  it('visits every region of a board before revisiting one, never a scene twice', () => {
    for (const difficulty of ['normal', 'hard'] as const) {
      const game = gameOn(difficulty, 'world')
      const seen: string[] = []
      for (let round = 0; round < 12; round++) {
        const challenge = pickVintage(game, 10)!
        if (round < VINTAGE_REGION_IDS.length && difficulty === 'hard')
          expect(seen.map(key => key.split(':')[0])).not.toContain(challenge.region)
        const key = `${challenge.region}:${challenge.scene}`
        expect(seen).not.toContain(key)
        seen.push(key)
        game.rounds.push({ groupChallenge: challenge } as Game['rounds'][number])
      }
    }
  })

  it('leans toward the tiers each difficulty favours', () => {
    expect(VINTAGE_TUNING.normal.fameWeights.major).toBeGreaterThan(
      VINTAGE_TUNING.normal.fameWeights.minor
    )
    expect(VINTAGE_TUNING.hard.fameWeights.obscure).toBeGreaterThan(
      VINTAGE_TUNING.hard.fameWeights.major
    )
    expect(vintageFameWeight('minor', 'easy')).toBe(0)
    expect(vintageFameWeight('obscure', 'normal')).toBe(0)
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
  let geometry: VintageRegion
  beforeAll(() => {
    geometry = VINTAGE_REGIONS[region]
  })

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
