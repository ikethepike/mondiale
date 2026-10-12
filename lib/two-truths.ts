import { randomInt, sampleMany, shuffleArray } from '~~/lib/arrays'
import { clampScore } from '~~/lib/scoring'
import type { DataSetId } from '~~/lib/attribution'
import type { Claim, ClaimFamily, TwoTruthsSheet, TwoTruthsStamp } from '~~/types/two-truths.types'

export const TWO_TRUTHS_TUNING = {
  cards: 4,
  /** How many of the cards are lies — drawn uniformly, never announced, so a
   *  sheet can't be solved by elimination. */
  lies: [1, 2, 3],
  seconds: 45,
  /** What a perfect sheet pays; the rest of the pot is the first perfect
   *  sheet's bonus. */
  sheetShare: 0.9,
  /** A truth at or below this rings false; a lie at or above it rings true. */
  trapTruthAt: 0.4,
  trapLieAt: 0.65,
  /** A sheet needs this many traps, so the obvious read is wrong somewhere. */
  trapsPerSheet: 2,
  /** How far the truths' and lies' average plausibility may sit apart — any
   *  wider and "pick the weird one" solves the sheet. */
  toneGap: 0.2,
  /** Outer bounds: a truth this plausible is a gift, a lie this implausible
   *  is a joke. */
  maxTruthPlausibility: 0.85,
  minLiePlausibility: 0.35,
  perFamily: 2,
  /** Head-to-heads are the deck's most plentiful family; one per sheet keeps
   *  them from crowding out the rest. */
  familyCaps: { versus: 1 } as Partial<Record<ClaimFamily, number>>,
  minFamilies: 3,
  subjectTries: 60,
  sheetTries: 60,
} as const

/** Where each family's facts come from — the prompt's sources panel. */
export const CLAIM_DATASETS: Record<ClaimFamily, DataSetId[]> = {
  borders: ['borders'],
  language: ['countries'],
  capital: ['capitals', 'cities'],
  currency: ['countries'],
  club: ['countries'],
  rank: ['countries'],
  versus: ['countries'],
  trade: ['commodity-exporters'],
  clock: ['capitals'],
  river: ['water'],
}

export const twoTruthsReceiptKey = (gameId: string, round: number) => `${gameId}:${round}`

/** A claim that rings the opposite of what it is. */
export const isTrap = (claim: Pick<Claim, 'truth' | 'plausibility'>): boolean =>
  claim.truth
    ? claim.plausibility <= TWO_TRUTHS_TUNING.trapTruthAt
    : claim.plausibility >= TWO_TRUTHS_TUNING.trapLieAt

const isStamp = (value: unknown): value is TwoTruthsStamp => value === 'true' || value === 'lie'

/** An untrusted wire sheet, cut to the dealt cards: anything that isn't a
 *  stamp is a blank. */
export const toSheet = (raw: unknown, cards: number): TwoTruthsSheet =>
  Array.from({ length: cards }, (_, index) =>
    Array.isArray(raw) && isStamp(raw[index]) ? raw[index] : null
  )

/** The stamp a card's verdict calls for. */
export const stampFor = (truth: boolean): TwoTruthsStamp => (truth ? 'true' : 'lie')

/** How a sheet's stamps landed against the verdicts. */
export const sheetCounts = (
  sheet: TwoTruthsSheet,
  truths: readonly boolean[]
): { right: number; wrong: number; blank: number } =>
  truths.reduce(
    (counts, truth, index) => {
      const stamp = sheet[index]
      if (!stamp) return { ...counts, blank: counts.blank + 1 }
      return stamp === stampFor(truth)
        ? { ...counts, right: counts.right + 1 }
        : { ...counts, wrong: counts.wrong + 1 }
    },
    { right: 0, wrong: 0, blank: 0 }
  )

/** Right stamps minus wrong ones; a blank is neither. */
export const sheetNet = (sheet: TwoTruthsSheet, truths: readonly boolean[]): number => {
  const { right, wrong } = sheetCounts(sheet, truths)
  return right - wrong
}

export const isPerfectSheet = (sheet: TwoTruthsSheet, truths: readonly boolean[]): boolean =>
  truths.length > 0 && truths.every((truth, index) => sheet[index] === stampFor(truth))

/**
 * A sheet's pay: the net of right over wrong stamps scales the sheet's share
 * of the pot, floored at zero, so a blind sheet earns little and a blank
 * costs nothing. The first perfect sheet at the table takes the remainder.
 */
export const scoreSheet = ({
  sheet,
  truths,
  maximumPoints,
  firstPerfect = false,
}: {
  sheet: TwoTruthsSheet
  truths: readonly boolean[]
  maximumPoints: number
  firstPerfect?: boolean
}): number => {
  if (!truths.length) return 0
  const share = Math.round(maximumPoints * TWO_TRUTHS_TUNING.sheetShare)
  const earned = Math.round((Math.max(0, sheetNet(sheet, truths)) / truths.length) * share)
  return clampScore(earned + (firstPerfect ? maximumPoints - share : 0), maximumPoints)
}

// Summed in sorted order: a float sum depends on order, and a shuffled sheet
// must not flip isSpicySheet's verdict.
const mean = (values: number[]) =>
  values.length
    ? [...values].sort((a, b) => a - b).reduce((sum, value) => sum + value, 0) / values.length
    : 0

/** Every rule a dealt sheet must meet — the dealer's and the deck test's one check. */
export const isSpicySheet = (sheet: readonly Claim[]): boolean => {
  const tuning = TWO_TRUTHS_TUNING
  if (new Set(sheet.map(claim => claim.topic)).size !== sheet.length) return false
  const perFamily = new Map<ClaimFamily, number>()
  for (const claim of sheet) perFamily.set(claim.family, (perFamily.get(claim.family) ?? 0) + 1)
  for (const [name, count] of perFamily) {
    if (count > (tuning.familyCaps[name] ?? tuning.perFamily)) return false
  }
  if (perFamily.size < Math.min(tuning.minFamilies, sheet.length)) return false
  if (sheet.filter(isTrap).length < tuning.trapsPerSheet) return false
  const truths = sheet.filter(claim => claim.truth).map(claim => claim.plausibility)
  const lies = sheet.filter(claim => !claim.truth).map(claim => claim.plausibility)
  if (!truths.length || !lies.length) return false
  if (Math.max(...truths) > tuning.maxTruthPlausibility) return false
  if (Math.min(...lies) < tuning.minLiePlausibility) return false
  return Math.abs(mean(truths) - mean(lies)) <= tuning.toneGap
}

/**
 * A sheet of `TWO_TRUTHS_TUNING.cards` claims about one subject carrying
 * exactly `lies` lies, or undefined when the subject's claims can't meet
 * `isSpicySheet`. Traps are drawn first so the rules are met by construction
 * far more often than by luck.
 */
export const assembleSheet = (
  claims: readonly Claim[],
  lies: number,
  random: () => number = Math.random
): Claim[] | undefined => {
  const tuning = TWO_TRUTHS_TUNING
  const truthCount = tuning.cards - lies
  const truths = claims.filter(claim => claim.truth)
  const falsehoods = claims.filter(claim => !claim.truth)
  if (truths.length < truthCount || falsehoods.length < lies) return undefined
  const spicy = truths.filter(isTrap)
  const tempting = falsehoods.filter(isTrap)
  if (spicy.length + tempting.length < tuning.trapsPerSheet) return undefined

  const draw = (traps: Claim[], rest: Claim[], count: number, trapCount: number) => [
    ...sampleMany(traps, trapCount, random),
    ...sampleMany(
      rest.filter(claim => !isTrap(claim)),
      count - Math.min(trapCount, traps.length),
      random
    ),
  ]

  for (let attempt = 0; attempt < tuning.sheetTries; attempt++) {
    const spicyCount = randomInt(
      Math.min(1, spicy.length),
      Math.min(truthCount, spicy.length),
      random
    )
    const temptingCount = randomInt(
      Math.min(1, tempting.length),
      Math.min(lies, tempting.length),
      random
    )
    const sheet = [
      ...draw(spicy, truths, truthCount, spicyCount),
      ...draw(tempting, falsehoods, lies, temptingCount),
    ]
    if (sheet.length === tuning.cards && isSpicySheet(sheet)) return shuffleArray(sheet, random)
  }
  return undefined
}

/**
 * The card a bought "reveal" checks for this seat: a stable pick from the
 * round and the seat, so a redelivered request names the same card, and
 * uniform over every card, so which one it lands on says nothing about the
 * others.
 */
export const revealedCardIndex = (seed: string, cards: number): number => {
  let hash = 2166136261
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) % Math.max(1, cards)
}
