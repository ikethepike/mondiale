import { describe, expect, it } from 'vitest'
import {
  joinVerdict,
  MAX_PLAYER_NAME_LENGTH,
  MAX_PLAYERS,
  MAX_SPECTATORS,
  normalizePlayerName,
  tableIsFull,
} from './player'

describe('normalizePlayerName', () => {
  it('passes an ordinary name through', () => {
    expect(normalizePlayerName('Isaac')).toBe('Isaac')
  })

  it('trims surrounding whitespace', () => {
    expect(normalizePlayerName('  Isaac  ')).toBe('Isaac')
  })

  it('rejects an empty name', () => {
    expect(normalizePlayerName('')).toBeUndefined()
  })

  it('rejects whitespace-only names — blank nothingness is not a name', () => {
    expect(normalizePlayerName('   ')).toBeUndefined()
    expect(normalizePlayerName('\t\n')).toBeUndefined()
  })

  it('rejects non-string payloads from the socket', () => {
    expect(normalizePlayerName(undefined)).toBeUndefined()
    expect(normalizePlayerName(null)).toBeUndefined()
    expect(normalizePlayerName(42)).toBeUndefined()
  })

  it('clamps names to the maximum length', () => {
    const long = 'a'.repeat(MAX_PLAYER_NAME_LENGTH + 10)
    expect(normalizePlayerName(long)).toBe('a'.repeat(MAX_PLAYER_NAME_LENGTH))
  })

  it('leaves no trailing whitespace after clamping', () => {
    const padded = `${'a'.repeat(MAX_PLAYER_NAME_LENGTH - 1)} b`
    expect(normalizePlayerName(padded)).toBe('a'.repeat(MAX_PLAYER_NAME_LENGTH - 1))
  })
})

describe('tableIsFull', () => {
  const table = (count: number) =>
    Object.fromEntries(Array.from({ length: count }, (_, index) => [`player-${index}`, {}]))

  it('seats newcomers while the table has room', () => {
    expect(tableIsFull(table(MAX_PLAYERS - 1), 'newcomer')).toBe(false)
  })

  it('refuses the seat past capacity', () => {
    expect(tableIsFull(table(MAX_PLAYERS), 'newcomer')).toBe(true)
    expect(tableIsFull(table(MAX_PLAYERS + 1), 'newcomer')).toBe(true)
  })

  // Rejoins must stay idempotent: a returning player at a full table is
  // already seated, and bouncing them would strand their own game.
  it('always readmits a player who already holds a seat', () => {
    expect(tableIsFull(table(MAX_PLAYERS), 'player-0')).toBe(false)
  })

  it('welcomes the first player to an empty table', () => {
    expect(tableIsFull({}, 'newcomer')).toBe(false)
  })
})

describe('joinVerdict', () => {
  const seats = (count: number) =>
    Object.fromEntries(Array.from({ length: count }, (_, index) => [`player-${index}`, {}]))
  const watchers = (count: number) =>
    Object.fromEntries(Array.from({ length: count }, (_, index) => [`watcher-${index}`, {}]))
  const room = (overrides: Partial<Parameters<typeof joinVerdict>[0]> = {}) => ({
    players: seats(MAX_PLAYERS),
    started: false,
    allowSpectators: true,
    ...overrides,
  })

  it('seats a newcomer while the table has room — intent ignored', () => {
    const open = room({ players: seats(MAX_PLAYERS - 1) })
    expect(joinVerdict(open, 'newcomer')).toEqual({ admit: 'seat' })
    expect(joinVerdict(open, 'newcomer', true)).toEqual({ admit: 'seat' })
  })

  it('readmits a seated player at a full or started table', () => {
    expect(joinVerdict(room(), 'player-0')).toEqual({ admit: 'seat' })
    expect(joinVerdict(room({ started: true }), 'player-0')).toEqual({ admit: 'seat' })
  })

  it('offers the balcony on a full table only with intent', () => {
    expect(joinVerdict(room(), 'newcomer', true)).toEqual({ admit: 'spectate' })
    expect(joinVerdict(room(), 'newcomer')).toEqual({
      admit: 'refuse',
      reason: 'room-full',
      spectatable: true,
    })
  })

  it('refuses a full table terminally when the door is closed', () => {
    const sealed = room({ allowSpectators: false })
    expect(joinVerdict(sealed, 'newcomer', true)).toEqual({
      admit: 'refuse',
      reason: 'room-full',
      spectatable: false,
    })
  })

  it('refuses a full table terminally when the watcher cap is reached', () => {
    const packed = room({ spectators: watchers(MAX_SPECTATORS) })
    expect(joinVerdict(packed, 'newcomer', true)).toEqual({
      admit: 'refuse',
      reason: 'room-full',
      spectatable: false,
    })
  })

  // Membership beats the cap and needs no intent: refresh and reconnect must
  // land a waiting watcher back on the balcony every time.
  it('always readmits an admitted watcher, pre-start and mid-race', () => {
    const packed = room({ spectators: watchers(MAX_SPECTATORS) })
    expect(joinVerdict(packed, 'watcher-0')).toEqual({ admit: 'spectate' })
    expect(joinVerdict(room({ started: true, spectators: watchers(1) }), 'watcher-0')).toEqual({
      admit: 'spectate',
    })
  })

  it('admits started-game latecomers through the open door', () => {
    expect(joinVerdict(room({ started: true }), 'newcomer')).toEqual({ admit: 'spectate' })
  })

  it('refuses started-game latecomers on a closed door or full booth', () => {
    const refusal = { admit: 'refuse', reason: 'game-already-started', spectatable: false }
    expect(joinVerdict(room({ started: true, allowSpectators: false }), 'newcomer')).toEqual(
      refusal
    )
    expect(
      joinVerdict(room({ started: true, spectators: watchers(MAX_SPECTATORS) }), 'newcomer')
    ).toEqual(refusal)
  })

  it('never lets a kicked id back in through either door', () => {
    const kicked = room({ lobbyKicks: ['pariah'], players: seats(1) })
    expect(joinVerdict(kicked, 'pariah')).toEqual({
      admit: 'refuse',
      reason: 'removed-from-room',
      spectatable: false,
    })
    expect(joinVerdict(kicked, 'pariah', true)).toMatchObject({ admit: 'refuse' })
    expect(joinVerdict({ ...kicked, started: true }, 'pariah')).toMatchObject({ admit: 'refuse' })
  })
})
