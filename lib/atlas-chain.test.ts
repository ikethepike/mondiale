import { describe, expect, it } from 'vitest'
import { ISOCountryCodes } from '~~/data/iso-codes.gen'
import {
  ATLAS_CLOCK_TIGHTEN_EVERY,
  ATLAS_TABLE_SEED_OPTIONS,
  ATLAS_TARGET_LINKS,
  ATLAS_TRAP_BOUNTY_LINKS,
  ATLAS_TUTORIAL_EXAMPLES,
  ATLAS_SPELLINGS,
  atlasChainCredit,
  atlasContinuations,
  atlasFollowSpelling,
  atlasInDegree,
  atlasRecordSpelling,
  atlasRoundStats,
  atlasSpellingFor,
  atlasSqueeze,
  atlasStep,
  atlasTeachingPicks,
  parseAtlasSteps,
  pickAtlasMove,
  atlasHeadLetter,
  atlasKey,
  atlasLinkOverlap,
  atlasLinkTie,
  atlasOpeners,
  atlasOpenersLabel,
  atlasTailLetter,
  atlasTrapBounty,
  atlasTrapProof,
  atlasTurnSeconds,
  hasAtlasChain,
  isAtlasLink,
  pickAtlasHint,
  pickAtlasReseed,
  pickAtlasSeed,
} from '~~/lib/atlas-chain'
import { chainMovers } from '~~/lib/chain'
import { resolveTypedCountry } from '~~/lib/country'
import { isMicroNation, playableWorldCountries } from '~~/lib/game-rules'
import type { ChainTurnState } from '~~/types/challenges/group-modes.type'
import { gameDifficulties, type GameRules } from '~~/types/game.types'
import { isValidISOCode, type ISOCountryCode } from '~~/types/geography.types'

const WORLD: ISOCountryCode[] = [...ISOCountryCodes]
const RULES: GameRules = { regions: [], difficulty: 'normal', includeMicroNations: false }

describe('atlasKey and letters', () => {
  it('normalizes punctuation, diacritics and spaces', () => {
    expect(atlasKey('CI')).toBe('cotedivoire')
    expect(atlasHeadLetter('CI')).toBe('c')
    expect(atlasTailLetter('CI')).toBe('e')
    expect(atlasTailLetter('GW')).toBe('u') // Guinea-Bissau
    expect(atlasTailLetter('TL')).toBe('e') // Timor-Leste
    expect(atlasHeadLetter('ZA')).toBe('s') // South Africa: whole key, not last token
    expect(atlasTailLetter('ZA')).toBe('a')
  })
})

describe('atlasLinkOverlap', () => {
  it('measures the shared fragment', () => {
    expect(atlasLinkOverlap('NP', 'LA')).toBe(1) // Nepal → Laos
    expect(atlasLinkOverlap('NP', 'DZ')).toBe(2) // Nepal → Algeria
    expect(atlasLinkOverlap('NP', 'PS')).toBe(3) // Nepal → Palestine
    expect(atlasLinkOverlap('PK', 'TZ')).toBe(3) // Pakistan → Tanzania
    expect(atlasLinkOverlap('NE', 'NG')).toBe(5) // Niger → Nigeria
    expect(atlasLinkOverlap('NP', 'SE')).toBe(0) // Nepal → Sweden: no chain
  })

  it('crosses word boundaries through the space-stripped key', () => {
    // Vanuatu ends "tu"; "tu" opens no name, but "u" does — and United
    // Kingdom's key is "unitedkingdom", so the single letter carries it.
    expect(atlasLinkOverlap('VU', 'GB')).toBe(1)
  })
})

describe('openers', () => {
  it('offers the consonant under a trailing vowel run, Y included', () => {
    expect(atlasOpeners('AL')).toEqual(['a', 'n']) // Albania
    expect(atlasOpeners('DE')).toEqual(['y', 'n']) // Germany
    expect(atlasOpeners('KE')).toEqual(['a', 'n']) // Kenya: "ya" is one run
    expect(atlasOpeners('NP')).toEqual(['l']) // Nepal ends on a consonant
    expect(atlasOpenersLabel('AL')).toBe('A or N')
  })

  it('gives every name ending in A a way out of the A-spiral', () => {
    const aEnders = WORLD.filter(isoCode => atlasTailLetter(isoCode) === 'a')
    expect(aEnders.length).toBeGreaterThan(50)
    for (const isoCode of aEnders) expect(atlasOpeners(isoCode), isoCode).toHaveLength(2)
  })
})

describe('atlasLinkTie', () => {
  it('names the kind of tie, longest first', () => {
    expect(atlasLinkTie('NP', 'LA')).toEqual({ kind: 'letter', fragment: 'l', overlap: 1 })
    expect(atlasLinkTie('PL', 'AD')).toEqual({ kind: 'overlap', fragment: 'and', overlap: 3 })
    expect(atlasLinkTie('AL', 'NG')).toEqual({ kind: 'consonant', fragment: 'n', overlap: 0 })
    expect(atlasLinkTie('DE', 'NO')?.kind).toBe('consonant') // Germany → Norway
    expect(atlasLinkTie('NP', 'SE')).toBeUndefined()
    expect(isAtlasLink('AL', 'IN')).toBe(false) // a vowel inside the run is no opener
  })
})

describe('atlasContinuations', () => {
  it('applies the tie, dupe and pool filters', () => {
    const moves = atlasContinuations('NP', ['NP', 'LA'], WORLD)
    expect(moves).not.toContain('LA')
    expect(moves).toContain('PS') // Nepal → Palestine, the shared ending
    expect(moves.every(isoCode => isAtlasLink('NP', isoCode))).toBe(true)
    expect(moves.filter(isoCode => atlasHeadLetter(isoCode) === 'l').length).toBeGreaterThan(3)
  })

  it('opens the consonant door on an A-ender', () => {
    const moves = atlasContinuations('AL', ['AL'], WORLD)
    expect(moves).toContain('AO') // Angola, off the A
    expect(moves).toContain('NG') // Nigeria, off the N
  })

  it('knows the forced edges', () => {
    // Iraq → Qatar is the letter graph's only q-edge…
    expect(atlasContinuations('IQ', ['IQ'], WORLD)).toEqual(['QA'])
    // …and once Qatar is spent, Iraq is a dead end under the plain rule.
    expect(atlasContinuations('IQ', ['IQ', 'QA'], WORLD)).toEqual([])
  })

  it('has no dead letters in the full pool', () => {
    for (const isoCode of WORLD) {
      expect(atlasContinuations(isoCode, [isoCode], WORLD).length, isoCode).toBeGreaterThan(0)
    }
  })
})

describe('atlasChainCredit', () => {
  it('pays one per junction under the plain rule', () => {
    expect(atlasChainCredit(['NP', 'LA', 'SE'])).toBe(2)
  })

  it('pays overlap length when overlaps pay', () => {
    expect(atlasChainCredit(['NP', 'PS'], { payOverlaps: true })).toBe(3)
    expect(atlasChainCredit(['NP', 'PS', 'ET'], { payOverlaps: true })).toBe(4)
    expect(atlasChainCredit(['AL', 'NG'], { payOverlaps: true })).toBe(1) // a consonant tie
  })
})

describe('hasAtlasChain', () => {
  it('proves every difficulty target from a healthy seed', () => {
    for (const difficulty of gameDifficulties) {
      expect(hasAtlasChain('NP', ATLAS_TARGET_LINKS[difficulty], WORLD)).toBe(true)
    }
  })

  it('fails when the pool cannot carry the chain', () => {
    expect(hasAtlasChain('IQ', 2, ['IQ', 'QA'])).toBe(false)
  })
})

describe('pickAtlasSeed', () => {
  it('only seeds letters with real play', () => {
    const pool = playableWorldCountries(RULES)
    for (let attempt = 0; attempt < 25; attempt++) {
      const seed = pickAtlasSeed(RULES, { minOptions: ATLAS_TABLE_SEED_OPTIONS })
      expect(seed).toBeTruthy()
      expect(atlasContinuations(seed!, [seed!], pool).length, seed).toBeGreaterThanOrEqual(
        ATLAS_TABLE_SEED_OPTIONS
      )
    }
  })

  it('seeds the world pool even in region games', () => {
    const seed = pickAtlasSeed({ ...RULES, regions: ['europe'] })
    expect(seed).toBeTruthy()
  })
})

describe('pickAtlasHint', () => {
  it('never hands out a dead end while a live option exists', () => {
    for (let attempt = 0; attempt < 25; attempt++) {
      const hint = pickAtlasHint('NP', ['NP'], WORLD)
      expect(hint).toBeTruthy()
      expect(atlasContinuations(hint!, ['NP', hint!], WORLD).length).toBeGreaterThan(0)
    }
  })

  it('prefers the deepest overlap on hard', () => {
    const hint = pickAtlasHint('NE', ['NE'], WORLD, { payOverlaps: true })
    expect(hint).toBe('NG') // Niger → Nigeria, overlap 5
  })
})

describe('atlasTrapProof', () => {
  it('lists the openers and every walked name that would have chained', () => {
    const proof = atlasTrapProof('IQ', ['IQ', 'QA', 'SE'], WORLD)
    expect(proof).toEqual({ openers: ['q'], spent: ['QA'] })
  })
})

describe('atlasTurnSeconds', () => {
  const challenge = (links: number) => ({
    turnSeconds: 18,
    turnFloorSeconds: 11,
    state: { named: { a: Array<ISOCountryCode>(links).fill('SE') } },
  })

  it('tightens a second every few links, down to the floor', () => {
    expect(atlasTurnSeconds(challenge(0))).toBe(18)
    expect(atlasTurnSeconds(challenge(ATLAS_CLOCK_TIGHTEN_EVERY - 1))).toBe(18)
    expect(atlasTurnSeconds(challenge(ATLAS_CLOCK_TIGHTEN_EVERY))).toBe(17)
    expect(atlasTurnSeconds(challenge(ATLAS_CLOCK_TIGHTEN_EVERY * 100))).toBe(11)
  })

  it('stays flat without a floor', () => {
    expect(atlasTurnSeconds({ turnSeconds: 14, state: { named: { a: ['SE', 'NO'] } } })).toBe(14)
  })
})

describe('atlasTrapBounty', () => {
  it('pays the sealer of every dead end, cushioned or not', () => {
    const bounty = atlasTrapBounty({
      ready: [],
      chains: [],
      order: [],
      activeIndex: 0,
      turn: 0,
      deadline: 0,
      named: {},
      strikesLeft: {},
      eliminated: [],
      outcomes: {},
      missedOuts: {},
      breaks: [
        { kind: 'trap', playerId: 'b', byPlayerId: 'a', rescued: true },
        { kind: 'rip-cord', playerId: 'c' },
        { kind: 'trap', playerId: 'c', byPlayerId: 'a', rescued: false },
        { kind: 'trap', playerId: 'b', rescued: false },
      ],
    })
    expect(bounty).toEqual({ a: 2 * ATLAS_TRAP_BOUNTY_LINKS })
  })
})

describe('ATLAS_TUTORIAL_EXAMPLES', () => {
  it('teaches each tie with a link the rule accepts, playable on every difficulty', () => {
    for (const [kind, [from, to]] of Object.entries(ATLAS_TUTORIAL_EXAMPLES)) {
      expect(atlasLinkTie(from, to)?.kind, `${from} → ${to}`).toBe(kind)
      expect(isMicroNation(from) || isMicroNation(to), `${from} → ${to}`).toBe(false)
    }
  })

  it('teaches with names a chain can actually reach', () => {
    const degree = atlasInDegree(playableWorldCountries(RULES))
    for (const [from, to] of Object.values(ATLAS_TUTORIAL_EXAMPLES)) {
      expect(degree.get(from), from).toBeGreaterThan(1)
      expect(degree.get(to), to).toBeGreaterThan(1)
    }
  })
})

describe('pickAtlasReseed', () => {
  it('never deals a walked country, and settles for any live seed late in a round', () => {
    const pool = playableWorldCountries(RULES)
    const walked = pool.filter(isoCode => !['NP', 'LA'].includes(isoCode))
    expect(pickAtlasReseed(RULES, walked)).toBe('NP') // Nepal → Laos is the last live link
    expect(pickAtlasReseed(RULES, pool)).toBeUndefined()
  })
})

describe('spellings', () => {
  it('judges a country by the name it was typed under', () => {
    // Vietnam ends in M: only Myanmar opens on it — Burma does not.
    expect(atlasFollowSpelling('VN', 'MM', undefined, 'Myanmar')).toEqual({ spelling: 'Myanmar' })
    expect(atlasFollowSpelling('VN', 'MM', undefined, 'Burma')).toEqual({ spelling: 'Myanmar' })
    // Cuba's consonant B opens Burma under the data's own name.
    expect(atlasFollowSpelling('CU', 'MM', undefined, 'Burma')).toEqual({ spelling: undefined })
    expect(atlasFollowSpelling('LA', 'MM', undefined, 'Burma')).toBeUndefined()
    expect(atlasOpeners('MM', { MM: 'Myanmar' })).toEqual(['r'])
    expect(atlasOpeners('MM')).toEqual(['a', 'm'])
  })

  it('prefers the typed spelling when both names chain', () => {
    // Egypt's T opens Turkey and Türkiye alike — the player's word wins.
    expect(atlasFollowSpelling('EG', 'TR', undefined, 'Türkiye')).toEqual({ spelling: 'Türkiye' })
    expect(atlasFollowSpelling('EG', 'TR', undefined, 'Turkiye')).toEqual({ spelling: 'Türkiye' })
    expect(atlasFollowSpelling('EG', 'TR', undefined, 'Turkey')).toEqual({ spelling: undefined })
  })

  it("ignores a spelling that is not the country's own", () => {
    expect(atlasSpellingFor('FR', 'Myanmar')).toBeUndefined()
    expect(atlasSpellingFor('MM', 'x'.repeat(200))).toBeUndefined()
  })

  it('reads a dropdown pick by the prefix the player had typed', () => {
    expect(atlasSpellingFor('MM', 'Myan')).toBe('Myanmar')
    expect(atlasSpellingFor('MM', 'Bur')).toBeUndefined()
  })

  it('records the played spelling on the round', () => {
    const state = { chains: [['VN']], spellings: undefined } as unknown as ChainTurnState<unknown>
    atlasRecordSpelling(state, 'MM', 'Myanmar')
    expect(state.spellings).toEqual({ MM: 'Myanmar' })
    atlasRecordSpelling(state, 'RU', 'Russia')
    expect(state.spellings).toEqual({ MM: 'Myanmar' })
  })

  it('only lists names the console resolves to the same country', () => {
    for (const [isoCode, names] of Object.entries(ATLAS_SPELLINGS)) {
      for (const name of names ?? []) expect(resolveTypedCountry(name)?.isoCode, name).toBe(isoCode)
    }
  })

  it('carries spellings through the gate steps and refuses invented ones', () => {
    const steps = ['VN', 'MM'].map(isoCode =>
      atlasStep(isoCode as ISOCountryCode, { MM: 'Myanmar' })
    )
    expect(steps).toEqual(['VN', 'MM:Myanmar'])
    expect(parseAtlasSteps(steps, isValidISOCode)).toEqual({
      links: ['VN', 'MM'],
      spellings: { MM: 'Myanmar' },
    })
    expect(parseAtlasSteps(['MM:Rangoonia'], isValidISOCode)).toBeUndefined()
    expect(parseAtlasSteps(['XX'], isValidISOCode)).toBeUndefined()
  })
})

describe('the link graph', () => {
  it('pins the names nothing can lead into — a data change shows up here', () => {
    const degree = atlasInDegree(playableWorldCountries(RULES))
    const unreachable = [...degree].filter(([, count]) => count === 0).map(([isoCode]) => isoCode)
    const lonely = [...degree].filter(([, count]) => count === 1).map(([isoCode]) => isoCode)
    expect(unreachable.sort()).toEqual(['FI', 'FJ', 'FR'])
    expect(lonely.sort()).toEqual(['JM', 'JO', 'JP', 'ZM', 'ZW'])
  })

  it('leans seeds toward the names a chain can never reach', () => {
    const pool = playableWorldCountries(RULES)
    const degree = atlasInDegree(pool)
    const rare = new Set([...degree].filter(([, count]) => count <= 1).map(([isoCode]) => isoCode))
    const draws = 2000
    let rareDraws = 0
    for (let draw = 0; draw < draws; draw++) {
      const seed = pickAtlasSeed(RULES, { minOptions: ATLAS_TABLE_SEED_OPTIONS })!
      if (rare.has(seed)) rareDraws++
    }
    const uniform = rare.size / pool.length
    expect(rareDraws / draws).toBeGreaterThan(uniform * 1.6)
    expect(rareDraws / draws).toBeLessThan(0.25)
  })
})

describe('atlasTeachingPicks', () => {
  it('puts the names that would have carried on first', () => {
    const pool = playableWorldCountries(RULES)
    const used = pool.filter(isoCode => !['NP', 'LA', 'LV', 'LB', 'SE'].includes(isoCode))
    // From Nepal: Laos dead-ends (everything after it is walked); Latvia leads on to Afghanistan… unless walked.
    const candidates = atlasContinuations('NP', used, pool)
    const picks = atlasTeachingPicks(candidates, used, pool, candidates.length)
    const alive = (isoCode: ISOCountryCode) => atlasSqueeze(isoCode, used, pool) > 0
    const firstDead = picks.findIndex(isoCode => !alive(isoCode))
    if (firstDead >= 0) expect(picks.slice(firstDead).every(isoCode => !alive(isoCode))).toBe(true)
  })
})

describe('pickAtlasMove', () => {
  it('springs the tightest squeeze when cunning', () => {
    const pool = playableWorldCountries(RULES)
    const open = atlasContinuations('NP', [], pool)
    const pick = pickAtlasMove(open, ['NP'], pool, 1)!
    const tightest = Math.min(...open.map(isoCode => atlasSqueeze(isoCode, ['NP'], pool)))
    expect(atlasSqueeze(pick, ['NP'], pool)).toBe(tightest)
  })

  it('plays any legal move when not', () => {
    const pool = playableWorldCountries(RULES)
    const open = atlasContinuations('NP', [], pool)
    expect(open).toContain(pickAtlasMove(open, ['NP'], pool, 0))
  })
})

describe('atlasRoundStats', () => {
  it('reads runs, depth, the busiest letter and cords off the state', () => {
    const state = {
      chains: [
        ['NP', 'LA', 'AF'],
        ['BY', 'RU'],
      ],
      named: { a: ['LA', 'AF'], b: ['RU'] },
      breaks: [{ kind: 'rip-cord', playerId: 'b' }],
    } as unknown as ChainTurnState<unknown>
    const stats = atlasRoundStats(state, chainMovers(state))
    expect(stats.links).toBe(3)
    expect(stats.chains).toBe(2)
    expect(stats.longestRun).toEqual({ playerId: 'a', run: 2 })
    expect(stats.deepest?.to).toBe('RU')
    expect(stats.deepest?.tie.fragment).toBe('rus')
    expect(stats.cords).toBe(1)
  })
})
