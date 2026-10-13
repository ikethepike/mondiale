import { atlasChainCredit, findAtlasChain, isAtlasLink, parseAtlasSteps } from './atlas-chain'
import { chronicleSolution, isChronicleOrdered } from './chronicle'
import { playableWorldCountries } from './game-rules'
import { readTrend, type TrendMapping } from './trends'
import { getValueByAccessorID } from './values'
import type { GroupChallengeAccessorId } from '~~/types/challenges/group-challenge.type'
import type { IndividualChallenge } from '~~/types/challenges/individual-challenge.type'
import type { GameRules } from '~~/types/game.types'
import { isValidISOCode, type ISOCountryCode } from '~~/types/geography.types'

/**
 * The gates answered by a run of steps rather than one country: the duels'
 * picks, the name chain, the arranged order, a ruling or a place on the
 * spectrum. The gate submits its steps and the server grades them here — each
 * view grades its own steps through the same per-step functions as it plays.
 */
export const isStepGraded = (challenge: Pick<IndividualChallenge, 'variant' | 'partyLogo'>) => {
  switch (challenge.variant) {
    case 'higher-lower':
    case 'trend-duel':
    case 'atlas':
    case 'chronicle':
      return true
    case 'logo-politics':
      return (challenge.partyLogo?.ask ?? 'origin') !== 'origin'
    default:
      return false
  }
}

/** Whether `picked` is the higher of its duel on the stat. */
export const higherLowerWon = (
  accessorId: GroupChallengeAccessorId,
  pair: { a: ISOCountryCode; b: ISOCountryCode },
  picked: ISOCountryCode
): boolean => {
  if (picked !== pair.a && picked !== pair.b) return false
  const other = picked === pair.a ? pair.b : pair.a
  const value = (isoCode: ISOCountryCode) => getValueByAccessorID(isoCode, accessorId)?.amount ?? 0
  return value(picked) > value(other)
}

/** Whether `picked` is the one of its duel whose stat trends `seek`-ward. */
export const trendDuelWon = (
  duel: NonNullable<IndividualChallenge['trendDuels']>[number],
  picked: ISOCountryCode,
  trends: TrendMapping
): boolean =>
  (picked === duel.a || picked === duel.b) &&
  readTrend(trends[picked]?.[duel.metric], duel.metric)?.direction === duel.seek

/** Logo Politics' ruling answers as they travel; the spectrum answers with a band. */
export const LOGO_RULING_STEPS = { governs: 'governs', out: 'out' } as const

export const logoPoliticsWon = (
  partyLogo: NonNullable<IndividualChallenge['partyLogo']>,
  step: string
): boolean =>
  partyLogo.ask === 'ruling'
    ? (step === LOGO_RULING_STEPS.governs) === !!partyLogo.rules
    : partyLogo.ask === 'spectrum' && step === partyLogo.band

/** Whether the links named after the seed bank the atlas gate's target —
 *  every name on the board, each junction chaining as played. */
export const atlasStepsBank = (
  atlas: NonNullable<IndividualChallenge['atlas']>,
  steps: string[],
  pool: readonly ISOCountryCode[]
): boolean => {
  const parsed = parseAtlasSteps(steps, isValidISOCode)
  if (!parsed) return false
  const chain = [atlas.seed, ...parsed.links]
  if (new Set(chain).size !== chain.length) return false
  const onBoard = new Set(pool)
  return (
    parsed.links.every(isoCode => onBoard.has(isoCode)) &&
    chain.every(
      (isoCode, index) => !index || isAtlasLink(chain[index - 1], isoCode, parsed.spellings)
    ) &&
    atlasChainCredit(chain, { payOverlaps: atlas.overlaps }, parsed.spellings) >= atlas.target
  )
}

/** Whether an arranged hand is the dealt hand, earliest → latest. */
export const chronicleStepsOrdered = (dealt: readonly string[], steps: string[]): boolean =>
  steps.length === dealt.length &&
  [...steps].sort().join('|') === [...dealt].sort().join('|') &&
  isChronicleOrdered(steps)

const isSteps = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(step => typeof step === 'string')

const isCountrySteps = (steps: string[]): steps is ISOCountryCode[] => steps.every(isValidISOCode)

/** THE verdict on a step-graded gate's submitted steps. */
export const gradeGateSteps = async (
  challenge: IndividualChallenge,
  steps: unknown,
  rules: GameRules
): Promise<boolean> => {
  if (!isSteps(steps)) return false
  switch (challenge.variant) {
    case 'higher-lower': {
      const duels = challenge.higherLower
      return (
        !!duels &&
        isCountrySteps(steps) &&
        steps.length === duels.pairs.length &&
        duels.pairs.every((pair, index) => higherLowerWon(duels.accessorId, pair, steps[index]))
      )
    }
    case 'trend-duel': {
      const duels = challenge.trendDuels
      if (!duels || !isCountrySteps(steps) || steps.length !== duels.length) return false
      const { TRENDS } = await import('./trends-data')
      return duels.every((duel, index) => trendDuelWon(duel, steps[index], TRENDS))
    }
    case 'atlas':
      return (
        !!challenge.atlas && atlasStepsBank(challenge.atlas, steps, playableWorldCountries(rules))
      )
    case 'chronicle':
      return !!challenge.chronicle && chronicleStepsOrdered(challenge.chronicle.events, steps)
    case 'logo-politics':
      return (
        !!challenge.partyLogo &&
        steps.length === 1 &&
        logoPoliticsWon(challenge.partyLogo, steps[0])
      )
    default:
      return false
  }
}

/** Steps that win a step-graded gate — the brain's correct play. */
export const solveGateSteps = async (
  challenge: IndividualChallenge,
  pool: readonly ISOCountryCode[]
): Promise<string[] | undefined> => {
  switch (challenge.variant) {
    case 'higher-lower': {
      const duels = challenge.higherLower
      return duels?.pairs.map(pair =>
        higherLowerWon(duels.accessorId, pair, pair.a) ? pair.a : pair.b
      )
    }
    case 'trend-duel': {
      const { TRENDS } = await import('./trends-data')
      return challenge.trendDuels?.map(duel =>
        trendDuelWon(duel, duel.a, TRENDS) ? duel.a : duel.b
      )
    }
    case 'atlas': {
      const atlas = challenge.atlas
      if (!atlas) return undefined
      return findAtlasChain(atlas.seed, atlas.target, pool, { payOverlaps: atlas.overlaps })?.slice(
        1
      )
    }
    case 'chronicle':
      return challenge.chronicle ? chronicleSolution(challenge.chronicle.events) : undefined
    case 'logo-politics': {
      const logo = challenge.partyLogo
      if (logo?.ask === 'ruling')
        return [logo.rules ? LOGO_RULING_STEPS.governs : LOGO_RULING_STEPS.out]
      return logo?.band ? [logo.band] : undefined
    }
    default:
      return undefined
  }
}
