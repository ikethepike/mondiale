import type { Redis } from '@upstash/redis'
import type { ClientEvent, ClientEventData, ClientEventTarget } from '~~/types/events.types'
import type { EventHandler } from '~~/server/middleware/socket.server'
import { enqueueGameTask, type GameServer, type GameSocket } from '../server-side'
import { recordSeatEvent } from './seat-journal'
import { closeTutorialHandler } from './close-tutorial.handler'
import { enterMovementPhaseHandler } from './enter-movement-phase.handler'
import { roundPlayHandler } from './round-play.handler'
import { roundRevealDoneHandler } from './round-reveal-done.handler'
import { joinEventHandler } from './join.event'
import { setColorHandler } from './set-color.handler'
import { setNameHandler } from './set-name.handler'
import { startGameHandler } from './start-game.handler'
import { submitFinalChallengeAnswerHandler } from './submit-final-challenge-answer.handler'
import { submitChainMoveHandler } from './submit-chain-move.handler'
import { submitManhuntMoveHandler } from './submit-manhunt-move.handler'
import { submitGovernmentPickHandler } from './submit-government-pick.handler'
import { submitManhuntMarkerHandler } from './submit-manhunt-marker.handler'
import { submitManhuntSubpoenaHandler } from './submit-manhunt-subpoena.handler'
import { fetchManhuntPositionHandler } from './fetch-manhunt-position.handler'
import { manhuntReadyHandler } from './manhunt-ready.handler'
import { uniqueReadyHandler } from './unique-ready.handler'
import { chainReadyHandler } from './chain-ready.handler'
import { submitUniqueAnswerHandler } from './submit-unique-answer.handler'
import { sweepReadyHandler } from './sweep-ready.handler'
import { terraReadyHandler } from './terra-ready.handler'
import { timelineRevealDoneHandler } from './timeline-reveal-done.handler'
import { gateRevealDoneHandler } from './gate-reveal-done.handler'
import { submitSweepClaimHandler } from './submit-sweep-claim.handler'
import { manhuntTauntHandler } from './manhunt-taunt.handler'
import { submitHeritagePinHandler } from './submit-heritage-pin.handler'
import { submitTimelinePlacementHandler } from './submit-timeline-placement.handler'
import { submitGroupChallengeAnswersHandler } from './submit-group-challenge-answers.handler'
import { submitIndividualChallengeAnswersHandler } from './submit-individual-challenge-answer.handler'
import { updateByIndexHandler } from './update-by-index.handler'
import { playerCheeringHandler } from './player-cheering.handler'
import { playerGuessingHandler } from './player-guessing.handler'
import { kickPlayerHandler } from './kick-player.handler'
import { addBotHandler, removeBotHandler } from './add-bot.handler'
import { setSpectatorAccessHandler } from './set-spectator-access.handler'
import { updateConfigurationHandler } from './update-configuration.handler'

/**
 * THE client-event → handler table: the socket dispatch subscribes from it,
 * and the replay harness drives recorded games through the same handlers.
 * A client event without a handler is a compile error.
 */
export const SERVER_SIDE_EVENT_HANDLERS: {
  [clientEvent in ClientEvent]: {
    handler: EventHandler
  }
} = {
  join: {
    handler: joinEventHandler,
  },
  'set-name': {
    handler: setNameHandler,
  },
  'set-color': {
    handler: setColorHandler,
  },
  'start-game': {
    handler: startGameHandler,
  },
  'submit-individual-challenge-answer': {
    handler: submitIndividualChallengeAnswersHandler,
  },
  'submit-group-challenge-answers': {
    handler: submitGroupChallengeAnswersHandler,
  },
  'submit-chain-move': {
    handler: submitChainMoveHandler,
  },
  'submit-heritage-pin': {
    handler: submitHeritagePinHandler,
  },
  'submit-government-pick': {
    handler: submitGovernmentPickHandler,
  },
  'submit-manhunt-move': {
    handler: submitManhuntMoveHandler,
  },
  'submit-manhunt-marker': {
    handler: submitManhuntMarkerHandler,
  },
  'submit-manhunt-subpoena': {
    handler: submitManhuntSubpoenaHandler,
  },
  'manhunt-ready': {
    handler: manhuntReadyHandler,
  },
  'unique-ready': {
    handler: uniqueReadyHandler,
  },
  'chain-ready': {
    handler: chainReadyHandler,
  },
  'submit-unique-answer': {
    handler: submitUniqueAnswerHandler,
  },
  'sweep-ready': {
    handler: sweepReadyHandler,
  },
  'terra-ready': {
    handler: terraReadyHandler,
  },
  'timeline-reveal-done': {
    handler: timelineRevealDoneHandler,
  },
  'gate-reveal-done': {
    handler: gateRevealDoneHandler,
  },
  'submit-sweep-claim': {
    handler: submitSweepClaimHandler,
  },
  // Ephemeral taunt relay — no permanent state written
  'manhunt-taunt': {
    handler: manhuntTauntHandler,
  },
  // Reads only the requesting despot's own secret; answers on their socket
  'fetch-manhunt-position': {
    handler: fetchManhuntPositionHandler,
  },
  'submit-timeline-placement': {
    handler: submitTimelinePlacementHandler,
  },
  'close-tutorial': {
    handler: closeTutorialHandler,
  },
  'enter-movement-phase': {
    handler: enterMovementPhaseHandler,
  },
  // Does not write to permanent game state
  'update-by-index': {
    handler: updateByIndexHandler,
  },
  // Ephemeral live guess relay (group rounds) — no permanent state written
  'player-guessing': {
    handler: playerGuessingHandler,
  },
  // Ephemeral emoji cheer relay — no permanent state written
  'player-cheering': {
    handler: playerCheeringHandler,
  },
  'submit-final-challenge-answer': {
    handler: submitFinalChallengeAnswerHandler,
  },
  'update-configuration': {
    handler: updateConfigurationHandler,
  },
  'set-spectator-access': {
    handler: setSpectatorAccessHandler,
  },
  'kick-player': {
    handler: kickPlayerHandler,
  },
  'add-bot': {
    handler: addBotHandler,
  },
  'remove-bot': {
    handler: removeBotHandler,
  },
  // Answered at the dispatch, outside the game queue: a render ack writes a
  // side key and a clock probe only needs its ack.
  'round-play': {
    handler: roundPlayHandler,
  },
  'round-reveal-done': {
    handler: roundRevealDoneHandler,
  },
  'seat-rendered': {
    handler: () => undefined,
  },
  'time-sync': {
    handler: () => undefined,
  },
}

/** Dispatch-only events: never enqueued, never recorded for replay. */
export const UNQUEUED_CLIENT_EVENTS: readonly ClientEvent[] = ['seat-rendered', 'time-sync']

/** Ephemeral relays that change no game state — kept out of the replay record. */
export const UNRECORDED_CLIENT_EVENTS: readonly ClientEvent[] = [
  ...UNQUEUED_CLIENT_EVENTS,
  'player-guessing',
  'player-cheering',
  'manhunt-taunt',
  'fetch-manhunt-position',
]

/**
 * THE way a client event runs: on the game's queue, recorded for replay
 * (unless it changes nothing) at the moment it is handled. The socket dispatch and the test table
 * both go through here, so what a test exercises is what production records.
 */
export const runClientEvent = ({
  io,
  redis,
  socket,
  eventTarget,
  eventData,
}: {
  io: GameServer
  redis: Redis
  socket: GameSocket
  eventTarget: ClientEventTarget
  eventData: ClientEventData
}) => {
  const event = eventData.event
  return enqueueGameTask(eventTarget.gameId, async () => {
    if (!UNRECORDED_CLIENT_EVENTS.includes(event)) {
      await recordSeatEvent(redis, eventTarget.gameId, {
        kind: 'event',
        at: Date.now(),
        actor: eventTarget.playerId,
        event,
        data: eventData,
      })
    }
    await SERVER_SIDE_EVENT_HANDLERS[event].handler({
      io,
      redis,
      socket,
      eventTarget,
      eventKey: event,
      eventData,
    })
  })
}
