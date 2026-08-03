import { describe, expect, it } from 'vitest'
import { MAX_PLAYER_NAME_LENGTH, MAX_PLAYERS, normalizePlayerName, tableIsFull } from './player'

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
