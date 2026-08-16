import { defineGameHandler } from '../server-side'
import { handleTimelineRevealDone } from './timeline-turns'

/** A seat finished reading the finished round's chronicle — settle fires
 *  when the whole table has, or when the browse cap does. */
export const timelineRevealDoneHandler = defineGameHandler(
  'timeline-reveal-done',
  async ({ game, eventTarget, io, redis, socket }) =>
    handleTimelineRevealDone({ io, redis, socket, eventTarget }, game, eventTarget.playerId)
)
