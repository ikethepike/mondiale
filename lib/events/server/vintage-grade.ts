import { VINTAGE_YEARS } from '~~/data/vintage-years.gen'
import { sample, weightedPick } from '~~/lib/arrays'
import { vintageSeconds } from '~~/lib/round-beats'
import { taperScore } from '~~/lib/scoring'
import { isChallengeOfType } from '~~/lib/rounds'
import { VINTAGE_TUNING, vintageFameWeight, yearsOff } from '~~/lib/vintage-tuning'
import type { VintageChallenge, VintageOutcome } from '~~/types/challenges/group-modes.type'
import { isFameDealable } from '~~/types/fame.types'
import type { Game, GameDifficulty } from '~~/types/game.types'
import { vintageRegionsFor, type VintageRegionId } from '~~/types/vintage.types'

/**
 * Vintage's answers. The years live only here and in `vintage-years.gen`,
 * which nothing outside lib/events/server imports: a challenge on the wire
 * names a scene, and its years reach a seat only on that seat's graded answer.
 */

const modeOf = (labelled: boolean) => (labelled ? 'labelled' : 'bare')

/** The scenes a region may deal at this difficulty: old enough to be worth
 *  dating, and datable enough for the table (`fame`, stamped per scene). */
export const dealableScenes = (region: VintageRegionId, difficulty: GameDifficulty): number[] => {
  const tuning = VINTAGE_TUNING[difficulty]
  const years = VINTAGE_YEARS[region]
  const final = years.spans.length - 1
  return years.spans.flatMap((_, scene) =>
    scene < final &&
    (scene > 0 || tuning.oldestMap) &&
    years.tells[modeOf(tuning.labelled)][scene] >= tuning.minTells &&
    isFameDealable(years.fame[scene], difficulty)
      ? [scene]
      : []
  )
}

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

/** A region at most once a game — its scorecard has just shown every year
 *  its map ever changed — leaning toward the tiers the difficulty favours. */
export const pickVintage = (game: Game, maximumPoints: number): VintageChallenge | undefined => {
  const dealt = new Set(
    game.rounds.flatMap(({ groupChallenge }) =>
      isChallengeOfType(groupChallenge, 'vintage-challenge') ? [groupChallenge.region] : []
    )
  )
  const region = sample(
    vintageRegionsFor(game.regions).filter(
      region => !dealt.has(region) && dealableScenes(region, game.difficulty).length
    )
  )
  if (!region) return undefined
  const fame = VINTAGE_YEARS[region].fame
  const scene = weightedPick(
    dealableScenes(region, game.difficulty).map(
      scene => [scene, vintageFameWeight(fame[scene], game.difficulty)] as const
    )
  )!
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
