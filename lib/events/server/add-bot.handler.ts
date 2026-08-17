import { createBot } from '~~/lib/bots'
import { MAX_PLAYERS } from '~~/lib/player'
import { defineGameHandler } from '../server-side'
import { armBotPump } from './bot-brain'

/**
 * Host-only, lobby-only: seat a computer-controlled player. The bot arrives
 * named and ready (it has no naming screen to clear), counts against
 * MAX_PLAYERS like any seat, and is played server-side by the bot brain from
 * start-game on. No secret is written for its id — combined with the join
 * door's bot-id refusal, no socket can ever act as it.
 */
export const addBotHandler = defineGameHandler('add-bot', async ({ game, server, eventTarget }) => {
  if (game.host !== eventTarget.playerId)
    return console.warn(`Non-host tried to add a bot: ${eventTarget.playerId}`)
  if (game.started) return console.warn(`Ignoring mid-race add-bot in ${game.id}`)
  if (Object.keys(game.players).length >= MAX_PLAYERS)
    return console.warn(`Table full — refusing add-bot in ${game.id}`)

  const bot = createBot(Object.values(game.players))
  game.players[bot.id] = bot

  await server.updateGameState(game)
  // Whole-snapshot event: the lobby sees the new seat, same as a join.
  server.emit({ event: 'player-joined', game }, eventTarget)
})

/**
 * Host-only, bot-only: free a bot's chair. No denylist and no socket
 * eviction (the kick handler's whole tail) — a bot id has no tab to bounce
 * and can never rejoin anyway.
 *
 * In the lobby the seat simply vanishes. Mid-race the record must survive
 * (its name anchors every past round's history), so the bot is marked
 * `retiring` instead: the brain plays out any round it is bound to and
 * retires the seat to 'kicked' — a settled phase — at the next safe beat
 * (bot-brain's dispatchRetirement).
 */
export const removeBotHandler = defineGameHandler(
  'remove-bot',
  async ({ game, server, eventData, eventTarget, io, redis, socket }) => {
    if (game.host !== eventTarget.playerId)
      return console.warn(`Non-host tried to remove a bot: ${eventTarget.playerId}`)

    const { targetId } = eventData
    const target = typeof targetId === 'string' ? game.players[targetId] : undefined
    if (!target?.bot) return console.warn(`Invalid remove-bot target for ${game.id}`)

    if (game.started) {
      if (target.phase === 'kicked' || target.retiring) return
      target.retiring = true
      await server.updateGameState(game)
      server.emit({ event: 'update', game }, { gameId: game.id, playerId: target.id })
      // The retirement is the pump's to execute — make sure one is running
      // (idempotent; matters only if the chain died and nobody rejoined).
      armBotPump({ io, redis, socket, eventTarget }, game)
      return
    }

    game.players = Object.fromEntries(
      Object.entries(game.players).filter(([id]) => id !== targetId)
    )

    await server.updateGameState(game)
    server.emit({ event: 'player-joined', game }, eventTarget)
  }
)
