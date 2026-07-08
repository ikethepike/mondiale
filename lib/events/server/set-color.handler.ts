import { PLAYER_COLORS } from '~~/data/palette'
import { shuffleArray } from '~~/lib/arrays'
import { defineGameHandler } from '../server-side'

export const setColorHandler = defineGameHandler(
  'set-color',
  async ({ game, player, server, eventData, eventTarget }) => {
    // Colours in use by OTHER players — the current player may keep theirs
    const takenByOthers = Object.values(game.players)
      .filter(other => other.id !== player.id)
      .map(other => other.color)

    const free = PLAYER_COLORS.filter(color => !takenByOthers.includes(color))
    if (!free.length) return // palette exhausted (18-player lobby) — no change

    const direction = eventData.event === 'set-color' ? eventData.direction : undefined
    if (direction) {
      // Step to the next/previous free colour, wrapping around
      const currentIndex = free.indexOf(player.color)
      const step = direction === 'next' ? 1 : -1
      const from = currentIndex === -1 ? 0 : currentIndex
      player.color = free[(from + step + free.length) % free.length]
    } else {
      // No direction (pawn click): jump to a random different free colour
      const others = free.filter(color => color !== player.color)
      player.color = shuffleArray(others.length ? others : free)[0]
    }

    await server.updateGameState(game)
    server.emit({ event: 'color-set', game }, eventTarget)
  }
)
