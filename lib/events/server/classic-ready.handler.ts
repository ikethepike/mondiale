import { CLASSIC_READY_EVENTS, type ClassicReadyEvent } from '~~/lib/round-beats'
import { defineGameHandler } from '../server-side'
import { applyClassicReady, currentBriefedClassic } from './classic-briefing'

const classicReadyHandler = (event: ClassicReadyEvent) =>
  defineGameHandler(event, async ({ game, eventTarget, io, redis, socket }) => {
    const challenge = currentBriefedClassic(game)
    if (!challenge || CLASSIC_READY_EVENTS[challenge._type] !== event) return
    await applyClassicReady(
      { io, redis, socket, eventTarget },
      game,
      challenge,
      eventTarget.playerId
    )
  })

export const terraReadyHandler = classicReadyHandler('terra-ready')
export const unmaskReadyHandler = classicReadyHandler('unmask-ready')
