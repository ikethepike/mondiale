import { v4 as uuidv4 } from 'uuid'
import { countryLatLng, haversineKm } from '~~/lib/geo'
import { guessPolicyFor } from '~~/lib/live-guess-policy'
import { isValidISOCode } from '~~/types/geography.types'
import type { EventHandler } from '~~/server/middleware/socket.server'
import { createTokenBucket } from './rate-limit'
import { useServerSideEvents } from '../server-side'

const guessBucket = createTokenBucket(5, 2)

/** Called from the socket's `disconnect` so the map can't grow unbounded. */
export const forgetGuessBucket = (socketId: string) => guessBucket.forget(socketId)

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
  if (!guessBucket.take(socket.id, Date.now())) return

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
      // Hot & Cold under presence: broadcast the probe's distance but not the
      // country. Measured here against the round's own target — the client's
      // probed isoCode is trusted (it's the player's own click) but never
      // echoed, so the number is a radius with no centre.
      ...probeDistance(challenge, eventData),
      entryId: uuidv4(),
      at: Date.now(),
    },
    eventTarget
  )
}

/**
 * Distance from a Hot & Cold probe to the hidden target, rounded to 100 km to
 * match the prober's own feedback line and blunt multi-probe triangulation.
 * Empty object for any other mode, so it drops cleanly into the emit spread.
 */
const probeDistance = (
  challenge: Parameters<typeof guessPolicyFor>[1],
  eventData: { isoCode?: string }
): { distanceKm?: number } => {
  if (challenge?._type !== 'hot-cold-challenge') return {}
  if (!isValidISOCode(eventData.isoCode)) return {}

  const from = countryLatLng(eventData.isoCode)
  const target = countryLatLng(challenge.country)
  if (!from || !target) return {}

  return { distanceKm: Math.round(haversineKm(from, target) / 100) * 100 }
}
