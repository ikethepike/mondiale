import { VINTAGE_YEARS } from '~~/data/vintage-years.gen'
import { sample } from '~~/lib/arrays'
import { vintageSeconds } from '~~/lib/round-beats'
import { taperScore } from '~~/lib/scoring'
import type { VintageChallenge, VintageOutcome } from '~~/types/challenges/group-modes.type'
import type { Game, GameDifficulty } from '~~/types/game.types'
import { VINTAGE_REGION_IDS, type VintageRegionId } from '~~/types/vintage.types'

/**
 * Vintage's answers. The years live only here and in `vintage-years.gen`,
 * which nothing outside lib/events/server imports: a challenge on the wire
 * names a scene, and its years reach a seat only on that seat's graded answer.
 */

export const VINTAGE_TUNING: Record<
  GameDifficulty,
  {
    labelled: boolean
    /** Units that must look different from 2019 for a scene to be dealt. */
    minTells: number
    /** Scenes ending before this year are never dealt. */
    earliest: number
    /** Years either side of the dealt map's runs that still pay in full. */
    grace: number
    /** Years outside the runs at which a guess pays nothing. */
    zeroAt: number
  }
> = {
  easy: { labelled: true, minTells: 5, earliest: 1900, grace: 3, zeroAt: 30 },
  normal: { labelled: true, minTells: 3, earliest: 1890, grace: 1, zeroAt: 25 },
  hard: { labelled: false, minTells: 2, earliest: 1886, grace: 0, zeroAt: 20 },
}

const modeOf = (labelled: boolean) => (labelled ? 'labelled' : 'bare')

const regionFor = (game: Game): VintageRegionId =>
  (VINTAGE_REGION_IDS as readonly string[]).includes(game.variant)
    ? (game.variant as VintageRegionId)
    : sample(VINTAGE_REGION_IDS)!

/** The challenge for one scene — what the dealer deals and the harness pins. */
export const vintageChallengeFor = (
  region: VintageRegionId,
  scene: number,
  difficulty: GameDifficulty,
  maximumPoints: number
): VintageChallenge => {
  const tuning = VINTAGE_TUNING[difficulty]
  const years = VINTAGE_YEARS[region]
  const stepWeights = years.weights[modeOf(tuning.labelled)].slice(scene)
  return {
    _type: 'vintage-challenge',
    region,
    scene,
    labelled: tuning.labelled,
    stepWeights,
    range: [years.firstYear, years.spans[years.spans.length - 1][1]],
    durationSeconds: vintageSeconds(stepWeights),
    maximumPoints,
  }
}

export const vintageSceneAt = (region: VintageRegionId, year: number): number =>
  Math.max(
    0,
    VINTAGE_YEARS[region].spans.findIndex(([from, to]) => year >= from && year <= to)
  )

export const pickVintage = (game: Game, maximumPoints: number): VintageChallenge | undefined => {
  const tuning = VINTAGE_TUNING[game.difficulty]
  const mode = modeOf(tuning.labelled)
  const region = regionFor(game)
  const years = VINTAGE_YEARS[region]
  const final = years.spans.length - 1
  const dealable = years.spans
    .map((span, scene) => ({ span, scene }))
    .filter(
      ({ span, scene }) =>
        scene < final && span[1] >= tuning.earliest && years.tells[mode][scene] >= tuning.minTells
    )
  const scene = sample(dealable)?.scene
  if (scene === undefined) return undefined
  return vintageChallengeFor(region, scene, game.difficulty, maximumPoints)
}

/** Every year that shows exactly the dealt map, merged into inclusive runs. */
export const vintageRuns = (challenge: VintageChallenge): [number, number][] => {
  const years = VINTAGE_YEARS[challenge.region]
  const classes = years.classes[modeOf(challenge.labelled)]
  const runs: [number, number][] = []
  years.spans.forEach(([from, to], scene) => {
    if (classes[scene] !== classes[challenge.scene]) return
    const last = runs[runs.length - 1]
    if (last && last[1] + 1 === from) last[1] = to
    else runs.push([from, to])
  })
  return runs
}

/** Years from the guess to the nearest year showing this map; 0 inside. */
export const yearsOff = (runs: readonly [number, number][], year: number): number =>
  Math.min(...runs.map(([from, to]) => (year < from ? from - year : year > to ? year - to : 0)))

export const scoreVintage = ({
  challenge,
  difficulty,
  year,
}: {
  challenge: VintageChallenge
  difficulty: GameDifficulty
  year: number | undefined
}): { scored: number; maximum: number } => {
  const maximum = challenge.maximumPoints
  if (year === undefined || !Number.isFinite(year)) return { scored: 0, maximum }
  const { grace, zeroAt } = VINTAGE_TUNING[difficulty]
  return {
    scored: taperScore({
      distance: yearsOff(vintageRuns(challenge), year),
      perfect: grace,
      zero: zeroAt,
      maximumPoints: maximum,
    }),
    maximum,
  }
}

/** What the scorecard narrates — rides every graded answer, so notes are
 *  kept to the changes from the dealt map onward. */
export const vintageStory = (
  challenge: VintageChallenge,
  difficulty: GameDifficulty
): VintageOutcome => {
  const years = VINTAGE_YEARS[challenge.region]
  const { grace, zeroAt } = VINTAGE_TUNING[difficulty]
  const runs = vintageRuns(challenge)
  const own = years.spans[challenge.scene][0]
  const since = runs.find(([from, to]) => own >= from && own <= to)?.[0] ?? own
  return {
    runs,
    stepYears: years.spans.slice(1).map(([from]) => from),
    states: years.states,
    firstYear: years.firstYear,
    notes: Object.fromEntries(
      Object.entries(years.notes).filter(([key]) => Number(key.split(':')[1]) >= since)
    ),
    grace,
    zeroAt,
  }
}
