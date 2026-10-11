import { describe, expect, it } from 'vitest'
import {
  gateClockDeadline,
  gateDeadline,
  gateInterstitialEndsAt,
  gateVerdictLeadMs,
  OUTLINE_REVEAL_CLOCK_HOLD_MS,
  OUTLINE_REVEAL_SECONDS,
  ROSETTA_SECONDS,
  TREND_DUEL_REVEAL_MS,
} from '~~/lib/gate-timing'
import { INTERSTITIAL_TOTAL_MS, REVEAL_BEAT_MS } from '~~/lib/round-beats'
import type { IndividualChallenge } from '~~/types/challenges/individual-challenge.type'

const AT = 1_000_000
const logo = (ask?: 'origin' | 'ruling' | 'spectrum') =>
  ({ variant: 'logo-politics', partyLogo: { image: '', name: '', ask } }) as Pick<
    IndividualChallenge,
    'variant' | 'partyLogo'
  >

describe('the gate clock', () => {
  it('landing assumes the full card; a release counts from the tap', () => {
    expect(gateDeadline({ variant: 'rosetta' }, AT)).toBe(
      AT + INTERSTITIAL_TOTAL_MS + ROSETTA_SECONDS * 1000
    )
    expect(gateClockDeadline({ variant: 'rosetta' }, AT)).toBe(AT + ROSETTA_SECONDS * 1000)
    expect(gateClockDeadline({ variant: 'outline-reveal' }, AT)).toBe(
      AT + OUTLINE_REVEAL_CLOCK_HOLD_MS + OUTLINE_REVEAL_SECONDS * 1000
    )
  })

  it('an untimed gate has no clock to release', () => {
    expect(gateClockDeadline({ variant: 'find' }, AT)).toBeUndefined()
  })

  it('the card is spent at the clock’s release, however the deadline was stamped', () => {
    const landed = { enteredAt: AT, deadline: gateDeadline({ variant: 'outline-reveal' }, AT) }
    expect(gateInterstitialEndsAt({ variant: 'outline-reveal' }, landed)).toBe(
      AT + INTERSTITIAL_TOTAL_MS
    )
    const tapped = { enteredAt: AT, deadline: gateClockDeadline({ variant: 'rosetta' }, AT + 900) }
    expect(gateInterstitialEndsAt({ variant: 'rosetta' }, tapped)).toBe(AT + 900)
    expect(gateInterstitialEndsAt({ variant: 'find' }, { enteredAt: AT })).toBe(
      AT + INTERSTITIAL_TOTAL_MS
    )
  })
})

describe('the verdict lead', () => {
  it('holds only for a question that paints its own wash', () => {
    expect(gateVerdictLeadMs(logo('ruling'))).toBe(REVEAL_BEAT_MS)
    expect(gateVerdictLeadMs(logo('spectrum'))).toBe(REVEAL_BEAT_MS)
    expect(gateVerdictLeadMs({ variant: 'trend-duel' })).toBe(TREND_DUEL_REVEAL_MS)
  })

  it('never for an origin question, an ordinary gate or none at all', () => {
    expect(gateVerdictLeadMs(logo('origin'))).toBe(0)
    expect(gateVerdictLeadMs(logo())).toBe(0)
    expect(gateVerdictLeadMs({ variant: 'find' })).toBe(0)
    expect(gateVerdictLeadMs(undefined)).toBe(0)
  })
})
