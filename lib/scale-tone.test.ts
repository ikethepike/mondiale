/**
 * A plotted track paints a verdict: alert at one pole, calm at the other. That
 * verdict is a claim about the stat, so it has to be declared per stat, not
 * inferred from the direction of the numbers — "oldest" is not the good end of
 * anything, and the red-to-green track that used to run under it said it was.
 */
import { describe, expect, it } from 'vitest'
import { getChallengeDetails, getScaleProps } from '~~/lib/challenges'
import {
  GROUP_CHALLENGE_ACCESSOR_IDS,
  type GroupChallengeAccessorId,
} from '~~/types/challenges/group-challenge.type'
import { individualChallengeAccessors } from '~~/types/challenges/individual-challenge.type'
import type { ScaleTone } from '~~/types/challenge.type'

const TONES: Record<string, ScaleTone> = {
  'economics.equality': 'inverted',
  'government.yearsAtWar': 'inverted',
  'government.democracyIndex': 'positive',
  'government.corruptionIndex': 'positive',
  'government.humanDevelopmentIndex': 'positive',
  'government.happiness': 'positive',
  'environment.redListIndex': 'positive',
  'health.maleHeight': 'neutral',
  'people.share65Plus': 'neutral',
}

const EVERY_ACCESSOR = [...GROUP_CHALLENGE_ACCESSOR_IDS, ...individualChallengeAccessors]

describe('scale tones', () => {
  it.each(Object.entries(TONES))('%s plots as %s', (accessor, tone) => {
    const id = accessor as GroupChallengeAccessorId
    const scale = getChallengeDetails(id)?.scale
    expect(scale?.tone).toBe(tone)
    // The selector both wire ends read, not just the copy table.
    expect(getScaleProps(id, scale!.min)?.tone).toBe(tone)
  })

  // A new bounded stat lands with `tone` unset and falls back to neutral —
  // safe, but a silent choice. Naming it here is the prompt to make it aloud.
  it('leaves no plotted stat without a declared tone', () => {
    const undeclared = EVERY_ACCESSOR.filter(
      accessor => getChallengeDetails(accessor)?.scale && !TONES[accessor]
    )
    expect(undeclared).toEqual([])
  })
})
