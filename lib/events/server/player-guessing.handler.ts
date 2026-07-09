import { v4 as uuidv4 } from 'uuid'
import { guessPolicyFor } from '~~/lib/live-guess-policy'
import type { EventHandler } from '~~/server/middleware/socket.server'
import { useServerSideEvents } from '../server-side'

/** Per-socket token bucket: a short burst is fine, a flood is not. */
const BUCKET_CAPACITY = 5
const REFILL_PER_SECOND = 2
const buckets = new Map<string, { tokens: number; last: number }>()

/** Called from the socket's `disconnect` so the map can't grow unbounded. */
export const forgetGuessBucket = (socketId: string) => buckets.delete(socketId)

const takeToken = (socketId: string, now: number): boolean => {
  const bucket = buckets.get(socketId) ?? { tokens: BUCKET_CAPACITY, last: now }
  const refill = ((now - bucket.last) / 1000) * REFILL_PER_SECOND
  bucket.tokens = Math.min(BUCKET_CAPACITY, bucket.tokens + refill)
  bucket.last = now
  buckets.set(socketId, bucket)

  if (bucket.tokens < 1) return false
  bucket.tokens -= 1
  return true
}

/**
 * Ephemeral live-guess relay for group rounds. Broadcasts a player's guess to
 * the room so everyone sees opponents' answers land in real time. Writes NO
 * permanent game state (mirrors update-by-index).
 *
 * Re-broadcasts with `eventTarget.playerId` — the socket's AUTHENTICATED id —
 * never a playerId from the payload body, so a client can't spoof another
 * player's guess. It also re-derives the policy from the round's own challenge
 * rather than trusting the client's redaction, so a hand-crafted message can't
 * leak the answer, and honours the host's `liveGuesses` switch.
 *
 * The rate limit runs before the game fetch: a dropped event must not hold the
 * per-game promise chain the dispatcher enqueues onto.
 */
export const playerGuessingHandler: EventHandler = async ({
  io,
  eventData,
  eventTarget,
  redis,
  socket,
}) => {
  if (eventData.event !== 'player-guessing') return
  if (!takeToken(socket.id, Date.now())) return

  const server = useServerSideEvents({ socket, redis, io })
  const game = await server.fetchGame(eventTarget.gameId)
  if (!game) return

  const challenge = game.rounds[game.rounds.length - 1]?.groupChallenge
  const policy = guessPolicyFor(game, challenge)
  if (policy === 'none') return

  server.emit(
    {
      event: 'player-guessing',
      playerId: eventTarget.playerId,
      kind: eventData.kind,
      // Presence-only modes never name the guess, whatever the client sent.
      ...(policy === 'label' ? { isoCode: eventData.isoCode, label: eventData.label } : {}),
      entryId: uuidv4(),
      at: Date.now(),
    },
    eventTarget
  )
}
