import type { WaterFeature } from '~~/data/water.gen'
import type { WaterBlitzChallenge, WaterFeatureKind } from '~~/types/challenges/group-modes.type'
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
 * deal here. Every true country the key leaves out — a benched micro-nation,
 * an ocean's coast off this board, or one the roster calls arguable — lands
 * in `accepted`, free to name. Any other subject keeps its off-board countries
 * on the key, as a neighbour key does.
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

/** How the copy reads a subject: a river is crossed, water is shored, land is shared. */
export type TerrainFamily = 'river' | 'shore' | 'land'

export const terrainFamily = (kind: WaterFeatureKind): TerrainFamily => {
  switch (kind) {
    case 'river':
      return 'river'
    case 'ocean':
    case 'sea':
    case 'lake':
      return 'shore'
    case 'range':
    case 'desert':
    case 'plateau':
    case 'region':
      return 'land'
  }
}

type Named = Pick<WaterBlitzChallenge, 'featureName' | 'bare'>

/** "the Danube", "Lake Victoria" — the name as it reads mid-sentence. */
export const terrainName = ({ featureName, bare }: Named) =>
  bare ? featureName : `the ${featureName}`

/** The round's question, worded for what the subject is. */
export const terrainPrompt = (challenge: Pick<WaterBlitzChallenge, 'kind' | 'scope'> & Named) => {
  const name = terrainName(challenge)
  switch (terrainFamily(challenge.kind)) {
    case 'river':
      return `Which countries does ${name} flow through?`
    case 'shore':
      return challenge.scope
        ? `Name every country in ${boardLabel(challenge.scope)} on ${name}`
        : `Name every country on ${name}`
    case 'land':
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
