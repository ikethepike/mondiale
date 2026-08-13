import { defineGameHandler } from '../server-side'
import { applyGovernmentPick, currentGovernment } from './government-beats'

/**
 * One handler for all three beats: the engine branches on the live beat, so a
 * per-beat handler would only be three copies of this guard around the same
 * call. The `turn` the client answered against rides the payload and is what
 * makes a late pick a no-op rather than an answer to the NEXT question.
 *
 * Every value is checked against what was DEALT — a client is free to send any
 * string it likes, and an unchecked pick would let one invent a party that
 * scores or file a bench the round never asked about.
 */
export const submitGovernmentPickHandler = defineGameHandler(
  'submit-government-pick',
  async ({ game, eventData, eventTarget, io, redis, socket }) => {
    const challenge = currentGovernment(game)
    if (!challenge || challenge.state.finished) return
    const { state } = challenge
    if (eventData.turn !== state.turn) return

    const { party, seats, sides } = eventData.pick
    const pick: Parameters<typeof applyGovernmentPick>[5] = {}

    if (state.beat === 'party') {
      if (!challenge.options.some(option => option.name === party)) return
      pick.party = party
    } else if (state.beat === 'seats') {
      if (typeof seats !== 'number' || !challenge.blocks.includes(seats)) return
      pick.seats = seats
    } else {
      if (!sides || typeof sides !== 'object') return
      const filed: Record<string, 'government' | 'opposition'> = {}
      for (const [name, side] of Object.entries(sides)) {
        if (!challenge.sorted.includes(name)) continue
        if (side !== 'government' && side !== 'opposition') continue
        filed[name] = side
      }
      if (!Object.keys(filed).length) return
      pick.sides = filed
    }

    await applyGovernmentPick(
      { io, redis, socket, eventTarget },
      game,
      challenge,
      eventTarget.playerId,
      eventData.turn,
      pick
    )
  }
)
