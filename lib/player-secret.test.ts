import { describe, expect, it } from 'vitest'
import { secretsKey, verifyPlayerSecret } from './player-secret'

describe('verifyPlayerSecret', () => {
  it('claims an unrecorded id when a secret is presented (first join)', () => {
    expect(verifyPlayerSecret(undefined, 'abc')).toBe('claim')
  })

  it('binds a matching secret', () => {
    expect(verifyPlayerSecret('abc', 'abc')).toBe('ok')
  })

  it('rejects a wrong secret', () => {
    expect(verifyPlayerSecret('abc', 'xyz')).toBe('reject')
  })

  it('rejects an omitted secret once one is on file — the omit-the-token attack', () => {
    expect(verifyPlayerSecret('abc', undefined)).toBe('reject')
  })

  it('binds unverified when neither side has a secret (legacy client)', () => {
    expect(verifyPlayerSecret(undefined, undefined)).toBe('open')
  })

  it('treats an empty recorded secret as no secret on file', () => {
    expect(verifyPlayerSecret('', 'abc')).toBe('claim')
  })
})

describe('secretsKey', () => {
  it('namespaces per game and never collides with the game key', () => {
    expect(secretsKey('room-one')).toBe('room-one:secrets')
    expect(secretsKey('room-one')).not.toBe('room-one')
  })
})
