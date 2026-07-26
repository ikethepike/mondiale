import { describe, expect, it } from 'vitest'
import { MAX_PLAYER_NAME_LENGTH, normalizePlayerName } from './player'

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
