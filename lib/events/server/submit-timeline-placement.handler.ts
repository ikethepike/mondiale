import { activeTimelinePlayerId } from '~~/lib/timeline'
import { defineGameHandler } from '../server-side'
import { currentTimeline, resolveTimelinePlacement } from './timeline-turns'

export const submitTimelinePlacementHandler = defineGameHandler(
  'submit-timeline-placement',
  async ({ game, eventData, eventTarget, io, redis, socket }) => {
    const challenge = currentTimeline(game)
    if (!challenge || challenge.state.finished || challenge.state.revealing) return
    const { state } = challenge

    // Only the player on the clock may act, and only for the turn they saw —
    // a retried critical event or a stale client re-send lands after the turn
    // counter moved and must die here, not as a second placement.
    if (eventTarget.playerId !== activeTimelinePlayerId(state)) return
    if (eventData.turn !== state.turn) return
    if (!Number.isInteger(eventData.slot)) return
    if (eventData.slot < 0 || eventData.slot > state.placed.length) return

    await resolveTimelinePlacement(
      { io, redis, socket, eventTarget },
      game,
      challenge,
      eventData.slot
    )
  }
)
