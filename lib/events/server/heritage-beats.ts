import { HERITAGE } from '~~/data/heritage.gen'
import { isChallengeOfType, latestChallengeOfType, latestRound } from '~~/lib/rounds'
import { haversineKm, type LatLng } from '~~/lib/geo'
import { clampScore, scorePinDistance } from '~~/lib/scoring'
import type { HeritageHuntChallenge } from '~~/types/challenges/group-modes.type'
import type { Game } from '~~/types/game.types'
import { useServerSideEvents } from '../server-side'
import type { ChainContext } from './chain-turns'
import { scheduleDeadlineTask, scheduleRevealTask, settleRoundScores } from './round-engine'
import { FIRST_TURN_GRACE_MS as FIRST_BEAT_GRACE_MS } from '~~/lib/round-beats'

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

  scheduleHeritageReveal(ctx, state.beat)
}

/** Arm the beat reveal's follow-up. Idempotent: the fired task re-reads fresh
 *  state and bails once the beat moved on. */
const scheduleHeritageReveal = (ctx: ChainContext, revealedBeat: number) => {
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

  // Round over: everyone banks what their pins earned — in this same task,
  // preserving the beat rhythm (the last reveal hold IS the basking beat).
  state.finished = true
  state.revealing = false
  await settleHeritageRound(ctx, game, challenge)
}

/** Bank the finished round. Latched on `groupAnswers` like every sibling
 *  settle, so running it twice — or from a rearm — settles nothing twice. */
const settleHeritageRound = async (
  ctx: ChainContext,
  game: Game,
  challenge: HeritageHuntChallenge
) => {
  const { state } = challenge
  const server = useServerSideEvents(ctx)
  const round = latestRound(game)
  if (!round) return
  // The once-only latch every sibling engine carries (round-engine.ts):
  // scoring marks the round, so a duplicate follow-up settles nothing twice.
  if (Object.keys(round.groupAnswers).length) return
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
  await settleRoundScores({
    game,
    round,
    order: state.order,
    scores,
    maximumPoints: challenge.maximumPoints,
  })

  await server.updateGameState(game)
  server.emit({ event: 'heritage-updated', game }, ctx.eventTarget)
}

/** Re-arm the settle for a finished-but-unsettled round (the save threw once
 *  the reveal timer was already spent, or a restart ate it). */
const scheduleHeritageSettle = (ctx: ChainContext) => {
  scheduleRevealTask(ctx, async fresh => {
    const current = currentHeritageHunt(fresh)
    if (!current?.state.finished) return
    await settleHeritageRound(ctx, fresh, current)
  })
}

/**
 * Re-arm whatever follow-up the live heritage round is waiting on after its
 * in-process timer was lost (restart, or a save that threw once the timer was
 * already spent). Called from the rejoin recovery path (rearm-round.ts); safe
 * alongside a live timer — every task dies on its (beat, revealing) token.
 */
export const rearmHeritageHunt = (ctx: ChainContext, game: Game) => {
  const challenge = currentHeritageHunt(game)
  if (!challenge) return
  // Finished but never banked (the wedge every sibling engine recovers):
  // re-run the settle behind a reveal beat. The groupAnswers latch makes it
  // a no-op when the round DID settle.
  if (challenge.state.finished) return scheduleHeritageSettle(ctx)
  if (challenge.state.revealing) return scheduleHeritageReveal(ctx, challenge.state.beat)
  // A zero deadline is the staged-but-unrevealed shape (the clock stamps at
  // the reveal) — arming against it would resolve beat 0 before anyone saw it.
  if (challenge.state.deadline === 0) return
  scheduleHeritageTimeout(ctx, challenge)
}
