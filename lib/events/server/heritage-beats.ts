import { HERITAGE } from '~~/data/heritage.gen'
import { haversineKm, type LatLng } from '~~/lib/geo'
import { scorePinDistance } from '~~/lib/scoring'
import type { HeritageHuntChallenge } from '~~/types/challenges/group-modes.type'
import type { Game } from '~~/types/game.types'
import { enqueueGameTask, useServerSideEvents } from '../server-side'
import type { ChainContext } from './chain-turns'
import { movesForScoredPoints } from './moves'

/**
 * Heritage Hunt's beat engine, the pattern sibling of chain-turns: one photo
 * per beat, everyone pins simultaneously, the beat resolves when the last pin
 * lands or the clock runs out. Distances settle server-side from the site's
 * real point. Most of each beat's share is the distance taper; the rest is a
 * relative slice for out-pinning the table that beat. Timers run outside the
 * per-game queue; the (beat, revealing) pair is the staleness token.
 */

const REVEAL_HOLD_MS = 6000
const TIMEOUT_SLACK_MS = 350
/** Extra opening-beat time — the first clock starts behind the interstitial. */
const FIRST_BEAT_GRACE_MS = 4000
/** The taper's share of a beat; the rest pays beat rank (solo pays it whole). */
const TAPER_SHARE = 0.8

export const isHeritageHuntChallenge = (challenge: unknown): challenge is HeritageHuntChallenge =>
  !!challenge &&
  typeof challenge === 'object' &&
  '_type' in challenge &&
  challenge._type === 'heritage-hunt-challenge'

export const currentHeritageHunt = (game: Game): HeritageHuntChallenge | undefined => {
  const challenge = game.rounds[game.rounds.length - 1]?.groupChallenge
  return isHeritageHuntChallenge(challenge) ? challenge : undefined
}

const beatShare = (challenge: HeritageHuntChallenge): number =>
  challenge.maximumPoints / challenge.slugs.length

const stampDeadline = (challenge: HeritageHuntChallenge, extraMs = 0) => {
  challenge.state.deadline = Date.now() + challenge.beatSeconds * 1000 + extraMs
}

export const startHeritageClock = (challenge: HeritageHuntChallenge) => {
  stampDeadline(challenge, FIRST_BEAT_GRACE_MS)
}

export const scheduleHeritageTimeout = (ctx: ChainContext, challenge: HeritageHuntChallenge) => {
  const { beat, deadline } = challenge.state
  const delay = Math.max(0, deadline - Date.now()) + TIMEOUT_SLACK_MS
  setTimeout(() => {
    enqueueGameTask(ctx.eventTarget.gameId, async () => {
      const server = useServerSideEvents(ctx)
      const game = await server.fetchGame(ctx.eventTarget.gameId)
      if (!game) return
      const current = currentHeritageHunt(game)
      if (!current || current.state.finished || current.state.revealing) return
      if (current.state.beat !== beat) return
      await resolveHeritageBeat(ctx, game, current)
    })
  }, delay)
}

/** A pin from a player for the live beat. */
export const applyHeritagePin = async (
  ctx: ChainContext,
  game: Game,
  challenge: HeritageHuntChallenge,
  playerId: string,
  pin: LatLng
) => {
  const { state } = challenge
  if (!state.order.includes(playerId)) return
  if (state.pins[playerId]?.[state.beat]) return

  ;(state.pins[playerId] ??= {})[state.beat] = { pin }

  const everyonePinned = state.order.every(id => state.pins[id]?.[state.beat])
  if (everyonePinned) return resolveHeritageBeat(ctx, game, challenge)

  const server = useServerSideEvents(ctx)
  await server.updateGameState(game)
  server.emit({ event: 'heritage-updated', game }, ctx.eventTarget)
}

/**
 * Settle every player's distance and points for the beat: the taper pays for
 * closeness, the rank slice pays for beating the table (strictly worse pins
 * only, so ties split nothing they didn't earn; a missing pin is the worst
 * pin of all), then hold for the reveal before the next photo.
 */
const resolveHeritageBeat = async (
  ctx: ChainContext,
  game: Game,
  challenge: HeritageHuntChallenge
) => {
  const { state } = challenge
  const site = HERITAGE[challenge.slugs[state.beat]]
  const share = beatShare(challenge)
  const players = state.order
  const solo = players.length <= 1
  const taperPoints = share * (solo ? 1 : TAPER_SHARE)
  const rankPool = share - taperPoints

  const distances = new Map<string, number>()
  for (const playerId of players) {
    const entry = state.pins[playerId]?.[state.beat]
    if (entry && site) entry.distanceKm = Math.round(haversineKm(entry.pin, site.coordinates))
    distances.set(playerId, entry?.distanceKm ?? Infinity)
  }

  for (const playerId of players) {
    const entry = state.pins[playerId]?.[state.beat]
    if (!entry) continue
    const taper = scorePinDistance({
      distanceKm: distances.get(playerId)!,
      perfectDistanceKm: challenge.perfectDistanceKm,
      zeroDistanceKm: challenge.zeroDistanceKm,
      maximumPoints: Math.round(taperPoints),
    })
    const worse = players.filter(
      other => other !== playerId && distances.get(other)! > distances.get(playerId)!
    ).length
    const rank = solo ? 0 : Math.round((rankPool * worse) / (players.length - 1))
    entry.scored = taper + rank
  }

  state.revealing = true
  const server = useServerSideEvents(ctx)
  await server.updateGameState(game)
  server.emit({ event: 'heritage-updated', game }, ctx.eventTarget)

  const revealedBeat = state.beat
  setTimeout(() => {
    enqueueGameTask(ctx.eventTarget.gameId, async () => {
      const fresh = await server.fetchGame(ctx.eventTarget.gameId)
      if (!fresh) return
      const current = currentHeritageHunt(fresh)
      if (!current?.state.revealing || current.state.beat !== revealedBeat) return
      await advanceHeritageBeat(ctx, fresh, current)
    })
  }, REVEAL_HOLD_MS)
}

const advanceHeritageBeat = async (
  ctx: ChainContext,
  game: Game,
  challenge: HeritageHuntChallenge
) => {
  const { state } = challenge
  const server = useServerSideEvents(ctx)

  if (state.beat < challenge.slugs.length - 1) {
    state.revealing = false
    state.beat++
    stampDeadline(challenge)
    await server.updateGameState(game)
    server.emit({ event: 'heritage-updated', game }, ctx.eventTarget)
    scheduleHeritageTimeout(ctx, challenge)
    return
  }

  // Round over: everyone banks what their pins earned.
  state.finished = true
  state.revealing = false
  const round = game.rounds[game.rounds.length - 1]
  for (const playerId of state.order) {
    const player = game.players[playerId]
    const scored = Object.values(state.pins[playerId] ?? {}).reduce(
      (sum, pin) => sum + (pin.scored ?? 0),
      0
    )
    const capped = Math.min(scored, challenge.maximumPoints)
    round.groupAnswers[playerId] = { submitted: [], correct: [] }
    round.playerTurns[playerId] = {
      points: { scored: capped, maximum: challenge.maximumPoints },
    }
    if (player && player.phase === 'group-challenge') {
      player.phase = 'group-scores'
      player.moves = movesForScoredPoints({ game, player, scored: capped })
    }
  }

  await server.updateGameState(game)
  server.emit({ event: 'heritage-updated', game }, ctx.eventTarget)
}
