import type { Game } from '~~/types/game.types'
import type { EngineContext, RearmOptions } from './round-engine'
import { rearmBorderChain } from './chain-turns'
import { rearmClassicRound } from './classic-rounds'
import { rearmHeritageHunt } from './heritage-beats'
import { rearmManhunt } from './manhunt-beats'
import { rearmTimeline } from './timeline-turns'
import { rearmUniqueOrBust } from './unique-beats'

/** How long one rearm sweep covers a game. A flapping (or replaying) client
 *  re-joins far more often than timers die; each sweep arms real timers that
 *  live until they fire, so unbounded sweeps are unbounded timer churn. */
const REARM_DEBOUNCE_MS = 5000
const lastRearmedAt = new Map<string, number>()

/**
 * The clocked round engines pace themselves with in-process timers, so a
 * server restart — or a save that threw after its timer was already spent —
 * leaves a live round persisted in a state nobody will ever advance: a shot
 * clock at 0:00, a reveal hold that never lifts, a briefing cap that never
 * fires. Redis outlives all of it.
 *
 * A rejoin is the recovery moment (the same principle as the wedge heals in
 * join.event.ts): whoever refreshes first re-arms whatever follow-up the live
 * round is waiting on. Every engine's tasks re-read fresh state and die on
 * their staleness tokens (turn/beat counters, briefing/finished flags, the
 * settle latch), so calling this while the real timers are still alive arms
 * only harmless duplicates.
 */
export const rearmLiveRound = (
  ctx: EngineContext,
  game: Game,
  options: RearmOptions = { armBriefingCaps: true }
) => {
  const now = Date.now()
  const last = lastRearmedAt.get(game.id) ?? 0
  if (now - last < REARM_DEBOUNCE_MS) return
  lastRearmedAt.set(game.id, now)
  // The map only ever holds live rooms, but nothing removes finished ones —
  // sweep stale entries opportunistically so it can't grow for the life of
  // the process.
  for (const [gameId, at] of lastRearmedAt) {
    if (now - at > 3_600_000) lastRearmedAt.delete(gameId)
  }

  // Each rearm self-guards on its own mode; at most one acts per round.
  rearmBorderChain(ctx, game, options)
  rearmHeritageHunt(ctx, game)
  rearmTimeline(ctx, game)
  rearmManhunt(ctx, game, options)
  rearmUniqueOrBust(ctx, game, options)
  rearmClassicRound(ctx, game)
}
