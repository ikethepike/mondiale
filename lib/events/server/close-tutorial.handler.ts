import { seatSubject } from '~~/lib/seat-transitions'
import type { Game } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'
import type { SeatCause } from '~~/types/seat.types'
import { defineGameHandler } from '../server-side'
import type { EngineContext, ServerSide } from './round-engine'
import { advanceSeat } from './seat-cursor'
import { currentAtlasChain, scheduleAtlasTimeout } from './atlas-turns'
import { currentBorderChain, scheduleChainTimeout } from './chain-turns'
import { scheduleClassicSettle, startClassicClockOnLastClose } from './classic-rounds'
import { currentHeritageHunt, scheduleHeritageTimeout, startHeritageClock } from './heritage-beats'
import { currentManhunt, scheduleManhuntTimeout, startManhunt } from './manhunt-beats'
import { currentTimeline, scheduleTimelineTimeout, startTimelineClock } from './timeline-turns'
import { currentCleanSweep, scheduleSweepTimeout } from './sweep-beats'
import { currentTerraIncognita, scheduleTerraTimeout } from './terra-beats'
import { currentGovernment, scheduleGovernmentTimeout, startGovernment } from './government-beats'
import { currentUniqueOrBust, scheduleUniqueTimeout } from './unique-beats'

/**
 * A rules card closes — by the click, the tutorial cap, or a bot — and the
 * seat joins round 1. The ONE place the round-1 seams live: the close that
 * empties the rules cards stamps the clocks round 1 never got at a reveal.
 */
export const closeTutorial = async ({
  ctx,
  server,
  game,
  player,
  cause,
}: {
  ctx: EngineContext
  server: ServerSide
  game: Game
  player: Player
  cause: SeatCause
}) => {
  const { io, redis, socket } = ctx
  const eventTarget = { gameId: game.id, playerId: player.id }
  advanceSeat(
    game,
    player,
    { step: 'round', subject: seatSubject.round(game.rounds.length - 1) },
    cause
  )

  // Round 1 never passes the enter-movement-phase reveal, so a classic
  // round's clock stamps here instead (the same seam the turn engines'
  // briefings use below) — on the close that empties the rules cards, so
  // no live reader's window starts under someone else's card. This seat's
  // phase already flipped above, so a solo table stamps on its own close.
  const startsClassicClock = startClassicClockOnLastClose(game)

  // A manhunt dealt as round 1 (FORCE_ROUND_TYPE — natural round 1 is always
  // ranking) never passes the enter-movement-phase reveal, so its secret
  // blob seeds here instead. Every close during the briefing re-enters
  // (the deadline stays 0 until the pursuit begins) — startManhunt is
  // idempotent on the secret, so only the first close seeds.
  const manhunt = currentManhunt(game)
  const startsManhunt = manhunt && !manhunt.state.finished && manhunt.state.deadline === 0
  if (startsManhunt) {
    await startManhunt({ io, redis, socket, eventTarget }, game, manhunt)
  }

  // Heritage Hunt / Timeline dealt as round 1 (the same FORCE_ROUND_TYPE
  // seam): their beat clocks stamp in the enter-movement-phase reveal,
  // which round 1 never passes — left at deadline 0 the round never ticks
  // and rearm refuses it (a dead round). Stamp on the close that empties
  // the rules cards, arm after the save.
  const lastClose = !Object.values(game.players).some(seat => seat.cursor.step === 'tutorial')

  // Government dealt as round 1 (the same FORCE_ROUND_TYPE seam — and the
  // harness anyone exercising this mode reaches for). `startGovernment` runs
  // only from enter-movement-phase, which round 1 never passes, so without
  // this the round both leaks and stalls: the answers are never moved to the
  // side key (the full set broadcasts to every socket for the whole round)
  // and `deadline` stays 0, so the beats resolve instantly.
  // Idempotent on both counts — a second call finds no `state.answers` to
  // move and simply re-stamps the beat's clock.
  const government = currentGovernment(game)
  const startsGovernment = Boolean(
    lastClose && government && !government.state.finished && government.state.deadline === 0
  )
  if (startsGovernment && government) {
    await startGovernment({ io, redis, socket, eventTarget }, game, government)
  }

  const heritage = currentHeritageHunt(game)
  const startsHeritage = Boolean(
    lastClose && heritage && !heritage.state.finished && heritage.state.deadline === 0
  )
  if (startsHeritage && heritage) startHeritageClock(heritage)
  const timeline = currentTimeline(game)
  const startsTimeline = Boolean(
    lastClose && timeline && !timeline.state.finished && timeline.state.deadline === 0
  )
  if (startsTimeline && timeline) startTimelineClock(timeline)

  await server.updateGameState(game)
  // The last close stamps ROUND-level state (`round.deadline`, an engine's
  // `state.deadline`) — a seat slice would drop it and leave every
  // client's countdown unstamped while the server's backstop ticks.
  if (startsClassicClock || startsHeritage || startsTimeline || startsGovernment) {
    server.emit({ event: 'table-updated', game }, eventTarget)
  } else {
    server.emit({ event: 'seat-advanced', game }, eventTarget)
  }
  if (startsHeritage && heritage) {
    scheduleHeritageTimeout({ io, redis, socket, eventTarget }, heritage)
  }
  if (startsTimeline && timeline) {
    scheduleTimelineTimeout({ io, redis, socket, eventTarget }, timeline)
  }
  if (startsManhunt && !manhunt.state.finished) {
    scheduleManhuntTimeout({ io, redis, socket, eventTarget }, manhunt)
  }
  if (startsGovernment && government) {
    scheduleGovernmentTimeout({ io, redis, socket, eventTarget }, government)
  }
  if (startsClassicClock) scheduleClassicSettle({ io, redis, socket, eventTarget }, game)

  // Same round-1 FORCE_ROUND_TYPE seam for Unique or Bust: its briefing cap
  // normally arms at the enter-movement-phase reveal, which round 1 never
  // passes. Re-arming on every close is the manhunt precedent — a stale cap
  // task bails on the briefing flag.
  const unique = currentUniqueOrBust(game)
  if (unique && !unique.state.finished && unique.state.briefing) {
    scheduleUniqueTimeout({ io, redis, socket, eventTarget }, game, unique)
  }

  const sweep = currentCleanSweep(game)
  if (sweep && !sweep.state.finished && sweep.state.briefing) {
    scheduleSweepTimeout({ io, redis, socket, eventTarget }, game, sweep)
  }

  const terra = currentTerraIncognita(game)
  if (terra?.state.briefing) {
    scheduleTerraTimeout({ io, redis, socket, eventTarget }, game, terra)
  }

  // And for the turn-chain briefings, which hold their first shot clock the
  // same way (deadline 0 until the table is ready).
  const chain = currentBorderChain(game)
  if (chain && !chain.state.finished && chain.state.briefing) {
    scheduleChainTimeout({ io, redis, socket, eventTarget }, chain)
  }
  const atlas = currentAtlasChain(game)
  if (atlas && !atlas.state.finished && atlas.state.briefing) {
    scheduleAtlasTimeout({ io, redis, socket, eventTarget }, atlas)
  }
}

export const closeTutorialHandler = defineGameHandler(
  'close-tutorial',
  async ({ game, player, server, eventData, eventTarget, io, redis, socket }) => {
    // A seat the round already advanced (a settle banked it, the tutorial cap
    // beat the click) must not be dragged back into a spent round — a late
    // "Let's go" is a resync, not a step change.
    if (player.cursor.step !== 'tutorial' || eventData.subject !== player.cursor.subject) {
      return server.emit({ event: 'update', game }, eventTarget)
    }
    await closeTutorial({
      ctx: { io, redis, socket, eventTarget },
      server,
      game,
      player,
      cause: 'event:close-tutorial',
    })
  }
)
