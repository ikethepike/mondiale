import type { WaterFeature } from '~~/data/water.gen'
import type { WaterBlitzChallenge } from '~~/types/challenges/group-modes.type'
import type { GameRules } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'
import { isWorldBoard } from './board-regions'
import { isCountryInPlay } from './game-rules'
import { boardLabel, countryOnBoard } from './variant'

export const TERRAIN_TUNING = {
  /** Fewer is a coin flip, not a sweep. */
  minimumKey: 3,
  /** More is a recital — and an ocean's world key is ninety countries long. */
  maximumKey: 24,
  clock: { baseSeconds: 20, perCountrySeconds: 6, capSeconds: 90 },
} as const

/** More countries to name = a longer clock. */
export const terrainSeconds = (countries: number) => {
  const { baseSeconds, perCountrySeconds, capSeconds } = TERRAIN_TUNING.clock
  return Math.min(capSeconds, baseSeconds + countries * perCountrySeconds)
}

type KeyedFeature = Pick<WaterFeature, 'kind' | 'countries' | 'accepted'>

export interface TerrainKey {
  countries: ISOCountryCode[]
  accepted: ISOCountryCode[]
  /** Set when the key was cut to the board: an ocean is only ever asked of one coast. */
  scope?: GameRules['regions']
}

/**
 * The key a table is dealt for a roster subject, or undefined when it cannot
 * deal here. Every true country the key leaves out — benched, off the board,
 * or arguable by the roster — lands in `accepted`, free to name.
 */
export const terrainKey = (rules: GameRules, feature: KeyedFeature): TerrainKey | undefined => {
  const clipped = feature.kind === 'ocean'
  if (clipped && isWorldBoard(rules.regions)) return undefined

  const inPlay = feature.countries.filter(isoCode => isCountryInPlay(rules, isoCode))
  const onBoard = inPlay.filter(isoCode => countryOnBoard(isoCode, rules.regions))
  // A subject belongs to the board when a fair share of it sits there — the
  // Mediterranean is a Europe question, not an Asia one.
  if (!clipped && (onBoard.length < 2 || onBoard.length < feature.countries.length / 3))
    return undefined

  const countries = clipped ? onBoard : inPlay
  const { minimumKey, maximumKey } = TERRAIN_TUNING
  if (countries.length < minimumKey || countries.length > maximumKey) return undefined

  const keyed = new Set(countries)
  const accepted = [...new Set([...feature.countries, ...(feature.accepted ?? [])])].filter(
    isoCode => !keyed.has(isoCode)
  )
  return { countries, accepted, ...(clipped ? { scope: [...rules.regions] } : {}) }
}

type Named = Pick<WaterBlitzChallenge, 'featureName' | 'bare'>

/** "the Danube", "Lake Victoria" — the name as it reads mid-sentence. */
export const terrainName = ({ featureName, bare }: Named) =>
  bare ? featureName : `the ${featureName}`

/** The round's question, worded for what the subject is. */
export const terrainPrompt = (challenge: Pick<WaterBlitzChallenge, 'kind' | 'scope'> & Named) => {
  const name = terrainName(challenge)
  switch (challenge.kind) {
    case 'river':
      return `Which countries does ${name} flow through?`
    case 'ocean':
    case 'sea':
    case 'lake':
      return challenge.scope
        ? `Name every country in ${boardLabel(challenge.scope)} on ${name}`
        : `Name every country on ${name}`
    default:
      return `Which countries share ${name}?`
  }
}

/** The reveal's one-line summary. Leads with the count, so "the Alps" never
 *  needs a verb that agrees with it. */
export const terrainHeadline = (
  challenge: Pick<WaterBlitzChallenge, 'countries' | 'scope'> & Named
) =>
  `${challenge.countries.length} countries${
    challenge.scope ? ` in ${boardLabel(challenge.scope)}` : ''
  } share ${terrainName(challenge)}`
