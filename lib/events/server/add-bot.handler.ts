import { createBot } from '~~/lib/bots'
import { MAX_PLAYERS } from '~~/lib/player'
import { defineGameHandler } from '../server-side'

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
 * Host-only, lobby-only, bot-only: free a bot's chair. No denylist and no
 * socket eviction (the kick handler's whole tail) — a bot id has no tab to
 * bounce and can never rejoin anyway.
 */
export const removeBotHandler = defineGameHandler(
  'remove-bot',
  async ({ game, server, eventData, eventTarget }) => {
    if (game.host !== eventTarget.playerId)
      return console.warn(`Non-host tried to remove a bot: ${eventTarget.playerId}`)
    if (game.started) return console.warn(`Ignoring mid-race remove-bot in ${game.id}`)

    const { targetId } = eventData
    if (typeof targetId !== 'string' || !game.players[targetId]?.bot)
      return console.warn(`Invalid remove-bot target for ${game.id}`)

    game.players = Object.fromEntries(
      Object.entries(game.players).filter(([id]) => id !== targetId)
    )

    await server.updateGameState(game)
    server.emit({ event: 'player-joined', game }, eventTarget)
  }
)
