import Redis from 'ioredis'
import { Server, Socket } from 'socket.io'
import { DefaultEventsMap } from 'socket.io/dist/typed-events'
import { closeTutorialHandler } from '~~/lib/events/server/close-tutorial.handler'
import { enterMovementPhaseHandler } from '~~/lib/events/server/enter-movement-phase.handler'
import { joinEventHandler } from '~~/lib/events/server/join.event'
import { readyForRoundHandler } from '~~/lib/events/server/ready-for-round.handler'
import { setColorHandler } from '~~/lib/events/server/set-color.handler'
import { setNameHandler } from '~~/lib/events/server/set-name.handler'
import { startGameHandler } from '~~/lib/events/server/start-game.handler'
import { submitGroupChallengeAnswersHandler } from '~~/lib/events/server/submit-group-challenge-answers.handler'
import { submitIndividualChallengeAnswersHandler } from '~~/lib/events/server/submit-individual-challenge-answer.handler'
import { testHandler } from '~~/lib/events/server/test.handler'

import { ClientEvent, ClientEventData, ClientEventTarget } from '~~/types/events.types'

export type EventHandler = (configuration: {
  redis: Redis
  eventKey: ClientEvent
  eventData: ClientEventData
  eventTarget: ClientEventTarget
  socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>
  io: Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>
}) => void

const SERVER_SIDE_EVENT_HANDLERS: {
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
  'ready-for-round': {
    handler: readyForRoundHandler,
  },
  'close-tutorial': {
    handler: closeTutorialHandler,
  },
  'enter-movement-phase': {
    handler: enterMovementPhaseHandler,
  },
}

export default defineEventHandler(({ node }) => {
  const { REDIS_PASSWORD } = process.env
  if (!REDIS_PASSWORD) throw new ReferenceError('No redis password supplied')

  if (!global.io) {
    const redisURL = `rediss://default:${REDIS_PASSWORD}@eu2-neat-seasnail-30560.upstash.io:30560`
    const redis = new Redis(redisURL)

    const io = new Server((node.res.socket as any).server)
    io.on('connection', async socket => {
      console.log('connection!', await (await io.fetchSockets()).length)
      for (const [eventKey, configuration] of Object.entries(SERVER_SIDE_EVENT_HANDLERS)) {
        socket.on(eventKey, (eventData, eventTarget) => {
          console.log(`Received client event: ${eventKey} for ${eventTarget.gameId}`)
          return configuration.handler({
            io,
            redis,
            socket,
            eventData,
            eventTarget,
            eventKey: eventKey as ClientEvent,
          })
        })
      }
    })

    global.io = io
  }
})

declare global {
  var io: Server | undefined
}
