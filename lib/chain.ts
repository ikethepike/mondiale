import { BORDERS } from '~~/data/borders.gen'
import { STRAITS } from '~~/data/straits.gen'
import type { BorderChainChallenge, BorderChainState } from '~~/types/challenges/group-modes.type'
import type { GameVariant } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'
import { shuffleArray } from './arrays'
import { countryInVariant } from './variant'

/**
 * Border Chain's graph: land adjacency plus sea straits. The strait edges are
 * this mode's alone — traversal and neighbour-blitz stay land-only on BORDERS.
 */
export const connectionsOf = (isoCode: ISOCountryCode): ISOCountryCode[] => [
  ...(BORDERS[isoCode] ?? []),
  ...(STRAITS[isoCode] ?? []),
]

/** Whether a chain hop crosses water — rendered as a dashed arc. */
export const isStraitHop = (a: ISOCountryCode, b: ISOCountryCode): boolean =>
  STRAITS[a]?.includes(b) ?? false

export const liveChain = (state: BorderChainState): ISOCountryCode[] =>
  state.chains[state.chains.length - 1] ?? []

export const chainHead = (state: BorderChainState): ISOCountryCode | undefined => {
  const chain = liveChain(state)
  return chain[chain.length - 1]
}

/** Legal extensions of the live chain: connected to the head, unused, on the board. */
export const openMoves = (state: BorderChainState, variant: GameVariant): ISOCountryCode[] => {
  const head = chainHead(state)
  if (!head) return []
  const used = new Set(liveChain(state))
  return connectionsOf(head).filter(
    isoCode => !used.has(isoCode) && countryInVariant(isoCode, variant)
  )
}

export const activePlayerId = (state: BorderChainState): string => state.order[state.activeIndex]

export const standingPlayers = (state: BorderChainState): string[] => {
  const out = new Set(state.eliminated)
  return state.order.filter(playerId => !out.has(playerId))
}

/**
 * A seed must offer real play: at least MINIMUM_SEED_MOVES immediate outs on
 * the board, so the opening turns are never an instant trap.
 */
const MINIMUM_SEED_MOVES = 3

export const pickChainSeed = (
  variant: GameVariant,
  exclude: Set<ISOCountryCode> = new Set()
): ISOCountryCode | undefined => {
  const pool = shuffleArray(
    (Object.keys(BORDERS) as ISOCountryCode[]).filter(
      isoCode => countryInVariant(isoCode, variant) && !exclude.has(isoCode)
    )
  )
  return pool.find(isoCode => {
    const open = connectionsOf(isoCode).filter(
      connected => connected !== isoCode && countryInVariant(connected, variant)
    )
    return new Set(open).size >= MINIMUM_SEED_MOVES
  })
}

/**
 * Placement pays most of the ceiling, contributed links the rest — everyone
 * who walked the map keeps something. Winner: full placement share; first
 * out: none. Link share is relative to the round's best chainer.
 */
const PLACEMENT_SHARE = 0.75

export const scoreBorderChain = (
  challenge: BorderChainChallenge
): { [playerId: string]: { scored: number; maximum: number } } => {
  const { state, maximumPoints } = challenge
  const players = state.order
  const count = players.length
  const maxLinks = Math.max(1, ...players.map(playerId => state.named[playerId]?.length ?? 0))

  // eliminated[0] went out first → lowest placement; the winner tops the list.
  const placementOf = new Map<string, number>()
  state.eliminated.forEach((playerId, index) => placementOf.set(playerId, index))
  for (const playerId of standingPlayers(state)) placementOf.set(playerId, count - 1)

  const scores: { [playerId: string]: { scored: number; maximum: number } } = {}
  for (const playerId of players) {
    const placement = placementOf.get(playerId) ?? 0
    const placementFraction = count > 1 ? placement / (count - 1) : 1
    const linkFraction = (state.named[playerId]?.length ?? 0) / maxLinks
    const scored = Math.round(
      maximumPoints * (PLACEMENT_SHARE * placementFraction + (1 - PLACEMENT_SHARE) * linkFraction)
    )
    scores[playerId] = { scored: Math.min(scored, maximumPoints), maximum: maximumPoints }
  }
  return scores
}
