import { HERITAGE } from '~~/data/heritage.gen'
import { isChallengeOfType, latestChallengeOfType, latestRound } from '~~/lib/rounds'
import { haversineKm, type LatLng } from '~~/lib/geo'
import { clampScore, scorePinDistance } from '~~/lib/scoring'
import type { HeritageHuntChallenge } from '~~/types/challenges/group-modes.type'
import type { Game } from '~~/types/game.types'
import { useServerSideEvents } from '../server-side'
import type { ChainContext } from './chain-turns'
import { scheduleDeadlineTask, scheduleRevealTask, settleRoundScores } from './round-engine'
import { FIRST_TURN_GRACE_MS as FIRST_BEAT_GRACE_MS } from './turn-timing'

/**
 * Heritage Hunt's beat engine, the pattern sibling of chain-turns: one photo
 * per beat, everyone pins simultaneously, the beat resolves when the last pin
 * lands or the clock runs out. Distances settle server-side from the site's
 * real point. Most of each beat's share is the distance taper; the rest is a
 * relative slice for out-pinning the table that beat. Timers run outside the
 * per-game queue; the (beat, revealing) pair is the staleness token.
 */

/** The taper's share of a beat; the rest pays beat rank (solo pays it whole). */
const TAPER_SHARE = 0.8

export const isHeritageHuntChallenge = (challenge: unknown): challenge is HeritageHuntChallenge =>
  isChallengeOfType(challenge, 'heritage-hunt-challenge')

export const currentHeritageHunt = (game: Game): HeritageHuntChallenge | undefined =>
  latestChallengeOfType(game, 'heritage-hunt-challenge')

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
  scheduleDeadlineTask(ctx, deadline, async game => {
    const current = currentHeritageHunt(game)
    if (!current || current.state.finished || current.state.revealing) return
    if (current.state.beat !== beat) return
    await resolveHeritageBeat(ctx, game, current)
  })
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
  scheduleRevealTask(ctx, async fresh => {
    const current = currentHeritageHunt(fresh)
    if (!current?.state.revealing || current.state.beat !== revealedBeat) return
    await advanceHeritageBeat(ctx, fresh, current)
  })
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
  const round = latestRound(game)
  if (!round) return
  const scores = Object.fromEntries(
    state.order.map(playerId => {
      const scored = Object.values(state.pins[playerId] ?? {}).reduce(
        (sum, pin) => sum + (pin.scored ?? 0),
        0
      )
      return [
        playerId,
        { scored: clampScore(scored, challenge.maximumPoints), maximum: challenge.maximumPoints },
      ]
    })
  )
  settleRoundScores({
    game,
    round,
    order: state.order,
    scores,
    maximumPoints: challenge.maximumPoints,
  })

  await server.updateGameState(game)
  server.emit({ event: 'heritage-updated', game }, ctx.eventTarget)
}
