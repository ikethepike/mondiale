import { describe, expect, it } from 'vitest'
import { BORDERS } from '~~/data/borders.gen'
import { getMicroNations } from './game-rules'
import {
  isRouteComplete,
  linkedGuesses,
  neighboursWithin,
  pickTraversal,
  routeHops,
  routeThrough,
  shortestRoute,
  TRAVERSAL_DIFFICULTY,
  traversalWithin,
} from './traversal'
import type { GameDifficulty, GameRules } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'

const rules = (overrides: Partial<GameRules> = {}): GameRules => ({
  variant: 'world',
  difficulty: 'normal',
  ...overrides,
})

/** Every consecutive pair on a route must really share a land border. */
const isWalkable = (route: ISOCountryCode[]): boolean =>
  route.every(
    (isoCode, index) => index === 0 || (BORDERS[route[index - 1]]?.includes(isoCode) ?? false)
  )

describe('shortestRoute', () => {
  it('returns a walkable route between its endpoints', () => {
    const route = shortestRoute('RU', 'AL')
    expect(route?.[0]).toBe('RU')
    expect(route?.[route.length - 1]).toBe('AL')
    expect(isWalkable(route!)).toBe(true)
  })

  it('is the shortest route there is', () => {
    // RU -> AZ -> TR -> GR -> AL: four crossings, and no three-crossing route
    // exists — the reveal in the screenshot that started this was right about
    // the count even though the rows made it look wrong.
    expect(routeHops(shortestRoute('RU', 'AL')!)).toBe(4)
    expect(routeHops(shortestRoute('FR', 'PL')!)).toBe(2)
    expect(routeHops(shortestRoute('PT', 'PT')!)).toBe(0)
  })

  it('has no route off an island', () => {
    expect(shortestRoute('IS', 'FR')).toBeUndefined()
    expect(shortestRoute('AU', 'ID')).toBeUndefined()
  })

  it('deals the same route for a pair every time', () => {
    const first = shortestRoute('RU', 'AL')
    for (let attempt = 0; attempt < 5; attempt++) {
      expect(shortestRoute('RU', 'AL')).toEqual(first)
    }
  })

  it('prefers a tied route through the countries asked for', () => {
    // RU -> GE -> TR -> GR -> AL ties RU -> AZ -> TR -> GR -> AL on length, so
    // a player who named Georgia is shown the route they were on.
    const preferred = shortestRoute('RU', 'AL', { prefer: ['GE'] })
    expect(preferred).toContain('GE')
    expect(routeHops(preferred!)).toBe(4)
  })

  it('never buys a shorter route with a preference', () => {
    // Ukraine is nowhere near a shortest RU -> AL route; preferring it must not
    // lengthen the answer, only lose the tie-break.
    const preferred = shortestRoute('RU', 'AL', { prefer: ['UA', 'RO', 'RS', 'XK'] })
    expect(routeHops(preferred!)).toBe(4)
  })

  it('keeps the route inside `within`, endpoints excepted', () => {
    const within = new Set<ISOCountryCode>(['DE'])
    expect(shortestRoute('FR', 'PL', { within })).toEqual(['FR', 'DE', 'PL'])
    expect(shortestRoute('FR', 'PL', { within: new Set<ISOCountryCode>(['ES']) })).toBeUndefined()
  })
})

describe('traversalWithin', () => {
  it('benches micro-nations everywhere they are out of play', () => {
    const benched = getMicroNations()
    const within = traversalWithin(rules())!
    expect(within.size).toBeGreaterThan(0)
    for (const isoCode of benched) expect(within.has(isoCode)).toBe(false)
  })

  it('leaves the graph whole when micro-nations play', () => {
    expect(traversalWithin(rules({ difficulty: 'hard' }))).toBeUndefined()
    expect(traversalWithin(rules({ includeMicroNations: true }))).toBeUndefined()
  })

  it('narrows to the corridor, minus anything benched', () => {
    const within = traversalWithin(rules(), ['DE', 'FR', 'MC'])!
    expect([...within].sort()).toEqual(['DE', 'FR'])
  })

  it('is variant-agnostic — a border does not stop at the board edge', () => {
    const within = traversalWithin(rules({ variant: 'europe' }))!
    expect(within.has('TR')).toBe(true)
    expect(within.has('AZ')).toBe(true)
  })
})

describe('neighboursWithin', () => {
  it('drops neighbours off the graph', () => {
    const neighboursOf = neighboursWithin(new Set<ISOCountryCode>(['ES']))
    expect(neighboursOf('FR')).toEqual(['ES'])
  })

  it('hands back the whole border list when nothing is restricted', () => {
    expect(neighboursWithin()('FR')).toEqual(BORDERS.FR)
  })
})

describe('routeThrough / isRouteComplete', () => {
  it('bridges through the guesses alone', () => {
    expect(routeThrough('FR', 'PL', ['DE'])).toEqual(['FR', 'DE', 'PL'])
    expect(routeThrough('FR', 'PL', ['ES'])).toBeUndefined()
  })

  it('draws the route a completed round ended on', () => {
    const guesses: ISOCountryCode[] = ['UA', 'RO', 'RS', 'XK']
    const route = routeThrough('RU', 'AL', guesses)!
    expect(route).toEqual(['RU', 'UA', 'RO', 'RS', 'XK', 'AL'])
    expect(isWalkable(route)).toBe(true)
    // Five crossings against the optimum's four — the row the player sees is
    // now longer than the reveal's, which is what the score already said.
    expect(routeHops(route)).toBeGreaterThan(routeHops(shortestRoute('RU', 'AL')!))
  })

  it('ignores the guesses that padded the set', () => {
    expect(routeThrough('FR', 'PL', ['BR', 'DE', 'CN'])).toEqual(['FR', 'DE', 'PL'])
  })

  it('refuses a bridge that leaves the graph', () => {
    const within = traversalWithin(rules(), ['DE', 'FR', 'PL'])
    expect(isRouteComplete('FR', 'PL', ['DE'], within)).toBe(true)
    expect(isRouteComplete('FR', 'PL', ['BE', 'NL'], within)).toBe(false)
  })

  it('agrees with the route it drew', () => {
    expect(isRouteComplete('FR', 'PL', ['DE'])).toBe(true)
    expect(isRouteComplete('FR', 'PL', ['ES'])).toBe(false)
  })
})

describe('linkedGuesses', () => {
  it('links a chain hanging off either endpoint and strands the rest', () => {
    const linked = linkedGuesses('FR', 'PL', ['BE', 'NL', 'BR'])
    expect(linked.has('BE')).toBe(true)
    expect(linked.has('NL')).toBe(true)
    expect(linked.has('BR')).toBe(false)
  })

  it('strands a guess off the round graph', () => {
    const within = traversalWithin(rules(), ['DE', 'FR', 'PL'])
    expect(linkedGuesses('FR', 'PL', ['BE'], within).has('BE')).toBe(false)
  })
})

describe('pickTraversal', () => {
  const difficulties: GameDifficulty[] = ['easy', 'normal', 'hard']

  it.each(difficulties)('deals a %s pair whose route matches its own count', difficulty => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const pick = pickTraversal(rules({ difficulty }))!
      expect(pick).toBeDefined()
      // The count charged, the route revealed and the graph walked are one
      // thing — this is the invariant the whole mode's fairness rests on.
      expect(pick.optimalPath[0]).toBe(pick.start)
      expect(pick.optimalPath[pick.optimalPath.length - 1]).toBe(pick.target)
      expect(isWalkable(pick.optimalPath)).toBe(true)
      expect(routeHops(pick.optimalPath)).toBe(pick.optimalHops)

      const { minHops, maxHops } = TRAVERSAL_DIFFICULTY[difficulty]
      expect(pick.optimalHops).toBeGreaterThanOrEqual(minHops)
      expect(pick.optimalHops).toBeLessThanOrEqual(maxHops)
    }
  })

  it('never routes through a country the players cannot name', () => {
    const benched = new Set(getMicroNations())
    for (let attempt = 0; attempt < 20; attempt++) {
      const pick = pickTraversal(rules())!
      for (const isoCode of pick.optimalPath) expect(benched.has(isoCode)).toBe(false)
    }
  })

  it('keeps a corridor round inside its corridor', () => {
    const members: ISOCountryCode[] = ['PT', 'ES', 'FR', 'BE', 'NL', 'DE', 'PL', 'LT', 'LV', 'EE']
    for (let attempt = 0; attempt < 20; attempt++) {
      const pick = pickTraversal(rules(), members)
      if (!pick) continue
      for (const isoCode of pick.optimalPath) expect(members).toContain(isoCode)
    }
  })

  it('cannot be beaten by a legal route', () => {
    // The dealt optimum must be the best a player could possibly do on the
    // graph they are given — no guess set may bridge in fewer crossings.
    const within = traversalWithin(rules())
    for (let attempt = 0; attempt < 20; attempt++) {
      const pick = pickTraversal(rules())!
      const best = shortestRoute(pick.start, pick.target, { within })!
      expect(routeHops(best)).toBe(pick.optimalHops)
    }
  })
})
