import { describe, expect, it } from 'vitest'
import {
  BOT_ID_PREFIX,
  BOT_NAMES,
  botShare,
  createBot,
  DIFFICULTY_SHARE,
  isBotId,
  isBrainSeat,
  jitteredShare,
  nextBotName,
} from './bots'
import { MAX_PLAYERS } from './player'
import type { Game } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'

describe('bot identity', () => {
  it('creates a seated, named, ready bot with a self-describing id', () => {
    const bot = createBot([])
    expect(isBotId(bot.id)).toBe(true)
    expect(bot.id.startsWith(BOT_ID_PREFIX)).toBe(true)
    expect(bot.bot).toBe(true)
    expect(bot.ready).toBe(true)
    expect(bot.phase).toBe('waiting-for-game')
    expect(BOT_NAMES).toContain(bot.name)
  })

  it('never reuses a taken name while the roster has free ones', () => {
    const taken = BOT_NAMES.slice(0, 4)
    for (let i = 0; i < 25; i++) {
      expect(taken).not.toContain(nextBotName(taken))
    }
  })

  it('carries enough names for a full table', () => {
    expect(BOT_NAMES.length).toBeGreaterThanOrEqual(MAX_PLAYERS)
  })

  it('brain seats are bots and autopiloted humans, nobody else', () => {
    expect(isBrainSeat({ bot: true })).toBe(true)
    expect(isBrainSeat({ autopilot: { sinceRound: 2 } })).toBe(true)
    expect(isBrainSeat({})).toBe(false)
  })
})

describe('botShare', () => {
  /** An AUTOPILOT seat by default — a human seat the brain borrowed — so these
   *  cases read the pure mirror. The lobby-bot floor is exercised below. */
  const gameWith = (
    fractions: [number, number][],
    seat: Partial<Player> = {}
  ): Pick<Game, 'rounds' | 'difficulty' | 'players'> =>
    ({
      difficulty: 'normal',
      players: { me: { id: 'me', autopilot: { sinceRound: 0 }, ...seat } },
      rounds: fractions.map(([scored, maximum]) => ({
        groupChallenge: {},
        groupAnswers: {},
        playerTurns: { me: { points: { scored, maximum } } },
      })),
    }) as unknown as Game

  it('falls back to the difficulty share with no history', () => {
    expect(botShare(gameWith([]), 'me')).toBe(DIFFICULTY_SHARE.normal)
    expect(botShare({ difficulty: 'hard', rounds: [], players: {} } as unknown as Game, 'me')).toBe(
      DIFFICULTY_SHARE.hard
    )
  })

  it("mirrors the seat's rolling accuracy", () => {
    expect(botShare(gameWith([[5, 10]]), 'me')).toBeCloseTo(0.5)
    expect(
      botShare(
        gameWith([
          [10, 10],
          [0, 10],
        ]),
        'me'
      )
    ).toBeCloseTo(0.5)
  })

  it('floors a LOBBY bot at its difficulty but lets a hot streak run', () => {
    // A cold round must not ratchet a hard table down for the rest of the
    // game — the mirror may carry a bot above its dial, never below it.
    const cold = gameWith([[1, 10]], { bot: true, autopilot: undefined })
    expect(botShare(cold, 'me')).toBe(DIFFICULTY_SHARE.normal)
    const hot = gameWith([[9, 10]], { bot: true, autopilot: undefined })
    expect(botShare(hot, 'me')).toBeCloseTo(0.9)
  })

  it('keeps the pure mirror for an AUTOPILOT seat, floor and all', () => {
    // Playing at the departed human's demonstrated level IS the spec here, so
    // a weak seat stays weak rather than being lifted to the difficulty.
    const cold = gameWith([[1, 10]])
    expect(botShare(cold, 'me')).toBeCloseTo(0.1)
    expect(botShare(cold, 'me')).toBeLessThan(DIFFICULTY_SHARE.normal)
  })

  it('skips rounds with no banked maximum and windows the history', () => {
    const zeroMax = gameWith([
      [0, 0],
      [8, 10],
    ])
    expect(botShare(zeroMax, 'me')).toBeCloseTo(0.8)
    // Ten straight zeros, then five perfect rounds: only the window counts.
    const warmedUp = gameWith([
      ...Array.from({ length: 10 }, () => [0, 10] as [number, number]),
      ...Array.from({ length: 5 }, () => [10, 10] as [number, number]),
    ])
    expect(botShare(warmedUp, 'me')).toBeCloseTo(1)
  })
})

describe('jitteredShare', () => {
  it('stays in [0, 1] at the extremes', () => {
    expect(jitteredShare(1, () => 1)).toBeLessThanOrEqual(1)
    expect(jitteredShare(0, () => 0)).toBeGreaterThanOrEqual(0)
  })

  it('centres on the share', () => {
    expect(jitteredShare(0.5, () => 0.5)).toBeCloseTo(0.5)
  })
})
