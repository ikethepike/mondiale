import { describe, expect, it } from 'vitest'
import { EVENTS } from '~~/data/events.gen'
import { isAtlasLink } from '~~/lib/atlas-chain'
import { gradeGateSteps, LOGO_RULING_STEPS, solveGateSteps } from '~~/lib/gate-steps'
import { readTrend } from '~~/lib/trends'
import { TRENDS } from '~~/lib/trends-data'
import type { IndividualChallenge } from '~~/types/challenges/individual-challenge.type'
import { playableWorldCountries } from '~~/lib/game-rules'
import type { GameRules } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'

const gate = (extra: Partial<IndividualChallenge>): IndividualChallenge =>
  ({ _type: 'individual-challenge', id: 'flag', country: 'SE', ...extra }) as IndividualChallenge

const RULES: GameRules = { regions: [], difficulty: 'normal' }
const pool = playableWorldCountries(RULES)

describe('step-graded gates are graded from their steps, never the token', () => {
  it('higher-lower wants every duel won, in order', async () => {
    const challenge = gate({
      variant: 'higher-lower',
      higherLower: {
        accessorId: 'geography.area.total',
        pairs: [
          { a: 'LU', b: 'RU' },
          { a: 'US', b: 'PT' },
        ],
      },
    })
    expect(await gradeGateSteps(challenge, ['RU', 'US'], RULES)).toBe(true)
    expect(await gradeGateSteps(challenge, ['RU', 'PT'], RULES)).toBe(false)
    expect(await gradeGateSteps(challenge, ['RU'], RULES)).toBe(false)
    expect(await gradeGateSteps(challenge, undefined, RULES)).toBe(false)
    expect(await solveGateSteps(challenge, pool)).toEqual(['RU', 'US'])
  })

  it('trend-duel wants each pick to trend the way the duel seeks', async () => {
    const metric = 'fertility' as const
    const trending = (direction: string) =>
      pool.find(isoCode => readTrend(TRENDS[isoCode]?.[metric], metric)?.direction === direction)!
    const riser = trending('rising')
    const faller = trending('falling')
    const challenge = gate({
      variant: 'trend-duel',
      trendDuels: [{ metric, seek: 'falling', a: riser, b: faller }],
    })
    expect(await gradeGateSteps(challenge, [faller], RULES)).toBe(true)
    expect(await gradeGateSteps(challenge, [riser], RULES)).toBe(false)
    expect(await solveGateSteps(challenge, pool)).toEqual([faller])
  })

  it('atlas wants a legal, unrepeated chain that banks the target', async () => {
    const challenge = gate({
      variant: 'atlas',
      country: 'SE',
      atlas: { seed: 'SE', target: 3, overlaps: false },
    })
    const solved = (await solveGateSteps(challenge, pool))!
    expect(solved.length).toBeGreaterThanOrEqual(3)
    expect(await gradeGateSteps(challenge, solved, RULES)).toBe(true)
    expect(await gradeGateSteps(challenge, solved.slice(0, 2), RULES)).toBe(false)
    expect(await gradeGateSteps(challenge, [...solved.slice(0, 2), solved[1]!], RULES)).toBe(false)
    const last = solved.at(-1) as ISOCountryCode
    const broken = pool.find(
      isoCode => !isAtlasLink(last, isoCode) && isoCode !== 'SE' && !solved.includes(isoCode)
    )!
    expect(await gradeGateSteps(challenge, [...solved, broken], RULES)).toBe(false)
  })

  it('chronicle wants the dealt hand, earliest to latest', async () => {
    const hand = Object.keys(EVENTS)
      .filter((slug, index, slugs) =>
        slugs.every(other => other === slug || EVENTS[other]!.year !== EVENTS[slug]!.year)
      )
      .slice(0, 4)
    const challenge = gate({ variant: 'chronicle', chronicle: { events: [...hand].reverse() } })
    const solved = (await solveGateSteps(challenge, pool))!
    expect(await gradeGateSteps(challenge, solved, RULES)).toBe(true)
    expect(await gradeGateSteps(challenge, [...solved].reverse(), RULES)).toBe(false)
    expect(await gradeGateSteps(challenge, solved.slice(1), RULES)).toBe(false)
  })

  it('logo politics grades the ruling and the band', async () => {
    const ruling = gate({
      variant: 'logo-politics',
      partyLogo: { image: '', name: '', ask: 'ruling', rules: false },
    })
    expect(await gradeGateSteps(ruling, [LOGO_RULING_STEPS.out], RULES)).toBe(true)
    expect(await gradeGateSteps(ruling, [LOGO_RULING_STEPS.governs], RULES)).toBe(false)
    const spectrum = gate({
      variant: 'logo-politics',
      partyLogo: { image: '', name: '', ask: 'spectrum', band: 'centre-left' },
    })
    expect(await gradeGateSteps(spectrum, ['centre-left'], RULES)).toBe(true)
    expect(await gradeGateSteps(spectrum, ['right'], RULES)).toBe(false)
  })
})
