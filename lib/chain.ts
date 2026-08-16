import { BORDERS } from '~~/data/borders.gen'
import { STRAITS } from '~~/data/straits.gen'
import type {
  BorderChainState,
  ChainTurnChallenge,
  ChainTurnOutcome,
  ChainTurnState,
  ClosedDoor,
} from '~~/types/challenges/group-modes.type'
import type { GameRules } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'
import { shuffleArray } from './arrays'
import { isCountryPlayable } from './game-rules'
import { clampScore } from './scoring'

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

/**
 * The walk ramp — one blue, deepening along the journey (a ramp reads as
 * sequence where a rainbow reads as categories); the live head alone burns
 * ember. Border chain and the manhunt trail share this by construction.
 * JS needs the literal colors; the ember hue is `ember()` in rules/_ink.scss.
 */
export const walkColor = (index: number, count: number, head = false): string => {
  if (head) return 'hsla(24, 80%, 55%, 0.92)'
  const t = count <= 1 ? 1 : index / (count - 1)
  return `hsla(212, 58%, ${72 - t * 30}%, ${0.5 + t * 0.35})`
}

export const liveChain = (state: ChainTurnState<unknown>): ISOCountryCode[] =>
  state.chains[state.chains.length - 1] ?? []

/** The table beats a narration watcher diffs between two snapshots. */
export interface ChainBeats {
  links: number
  eliminated: number
  strikes: { [playerId: string]: number }
}

export const chainBeats = (state: ChainTurnState<unknown>): ChainBeats => ({
  links: state.chains.reduce((total, walkedChain) => total + walkedChain.length, 0),
  eliminated: state.eliminated.length,
  // A copy, not the live record — the diff must survive the state mutating.
  strikes: { ...state.strikesLeft },
})

/**
 * The one beat-diff both turn-chain views narrate from — Atlas and Border
 * Chain differ only in copy, which they pass in. One line per snapshot, by
 * priority: an elimination outranks a strike outranks a move (the rail is the
 * durable record; the toast is a single channel). Own beats return nothing —
 * the ticker never mirrors the viewer's own moves.
 *
 * A trap redeal grows `links` without anyone moving (`resumeFromTrap` pushes a
 * fresh seed chain and leaves `lastMoverId` stale), so a one-country live
 * chain is a deal, not a move, and stays silent. Strikes diff per key — a
 * serialized comparison would fire on key order alone.
 */
export const chainNarration = (
  state: ChainTurnState<unknown>,
  before: ChainBeats,
  now: ChainBeats,
  copy: {
    seatId: string
    seatName: (playerId: string) => string
    /** The elimination line's tail — 'the clock ran dry' vs the mode's own miss. */
    fate: (outcome: ChainTurnOutcome | undefined) => string
    /** The move line — the mode supplies verb and flourish. */
    move: (name: string, to: ISOCountryCode, from: ISOCountryCode) => string
  }
): string | undefined => {
  if (state.briefing || state.finished || state.trap) return undefined

  if (now.eliminated > before.eliminated) {
    const outId = state.eliminated[state.eliminated.length - 1]
    if (!outId || outId === copy.seatId) return undefined // the turn line already says so
    return `${copy.seatName(outId)} is out — ${copy.fate(state.outcomes[outId])}`
  }

  const burner = Object.keys(now.strikes).find(
    playerId => (now.strikes[playerId] ?? 0) < (before.strikes[playerId] ?? 0)
  )
  if (burner) {
    if (burner === copy.seatId) return undefined
    return `${copy.seatName(burner)} burns a strike`
  }

  if (now.links > before.links && state.lastMoverId && state.lastMoverId !== copy.seatId) {
    const moved = liveChain(state)
    const [from, to] = [moved[moved.length - 2], moved[moved.length - 1]]
    if (!from || !to) return undefined // a redealt seed, not a move
    return copy.move(copy.seatName(state.lastMoverId), to, from)
  }

  return undefined
}

export const chainHead = (state: ChainTurnState<unknown>): ISOCountryCode | undefined => {
  const chain = liveChain(state)
  return chain[chain.length - 1]
}

/** Legal extensions of the live chain: connected to the head, unused, on the board. */
export const openMoves = (state: BorderChainState, rules: GameRules): ISOCountryCode[] => {
  const head = chainHead(state)
  if (!head) return []
  const used = new Set(liveChain(state))
  return connectionsOf(head).filter(
    isoCode => !used.has(isoCode) && isCountryPlayable(rules, isoCode)
  )
}

/**
 * The mirror of `openMoves`: every connection of the head that is NOT a legal
 * move, and why. Same head, same two filters, opposite side — so a dead end the
 * engine declares is a dead end the overlay can prove. When this covers every
 * connection, `openMoves` is empty by construction.
 */
export const closedDoors = (state: BorderChainState, rules: GameRules): ClosedDoor[] => {
  const head = chainHead(state)
  if (!head) return []
  const chain = liveChain(state)
  const stepOf = new Map(chain.map((isoCode, index) => [isoCode, index + 1]))
  const seen = new Set<ISOCountryCode>([head])

  const doors: ClosedDoor[] = []
  for (const isoCode of connectionsOf(head)) {
    // A country can be both a land neighbour and a strait partner.
    if (seen.has(isoCode)) continue
    seen.add(isoCode)
    if (stepOf.has(isoCode)) doors.push({ isoCode, reason: 'walked', step: stepOf.get(isoCode) })
    else if (!isCountryPlayable(rules, isoCode)) doors.push({ isoCode, reason: 'off-board' })
  }
  return doors
}

export const activePlayerId = (state: ChainTurnState<unknown>): string =>
  state.order[state.activeIndex]

export const standingPlayers = (state: ChainTurnState<unknown>): string[] => {
  const out = new Set(state.eliminated)
  return state.order.filter(playerId => !out.has(playerId))
}

/**
 * A seed must offer real play: at least MINIMUM_SEED_MOVES immediate outs on
 * the board, so the opening turns are never an instant trap.
 */
const MINIMUM_SEED_MOVES = 3

export const pickChainSeed = (
  rules: GameRules,
  exclude: Set<ISOCountryCode> = new Set()
): ISOCountryCode | undefined => {
  const pool = shuffleArray(
    (Object.keys(BORDERS) as ISOCountryCode[]).filter(
      isoCode => isCountryPlayable(rules, isoCode) && !exclude.has(isoCode)
    )
  )
  return pool.find(isoCode => {
    const open = connectionsOf(isoCode).filter(
      connected => connected !== isoCode && isCountryPlayable(rules, connected)
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

export const scoreChainRound = (
  challenge: ChainTurnChallenge<unknown>,
  // Atlas on hard is sheer elimination: placement is everything, no link
  // consolation — pass 1. Everyone else keeps the 75/25 split.
  placementShare: number = PLACEMENT_SHARE
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
      maximumPoints * (placementShare * placementFraction + (1 - placementShare) * linkFraction)
    )
    scores[playerId] = { scored: clampScore(scored, maximumPoints), maximum: maximumPoints }
  }
  return scores
}
