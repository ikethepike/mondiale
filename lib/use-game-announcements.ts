import { computed, ref, watch } from 'vue'
import { useGameStore } from '~~/store/game.store'
import { seatViewFamily } from '~~/lib/seat-view'
import type { SeatViewFamily } from '~~/lib/seat-transitions'

export interface GameAnnouncement {
  kicker: string
  title: string
  stakes: string
  tone: 'alert' | 'info'
}

/**
 * The room is otherwise silent about the two biggest moments in a game: nobody
 * but the player themselves learns that someone reached the final gauntlet, or
 * cleared it and won. Both are already server truth on the seat's cursor,
 * carried to every client on the game snapshot, so this needs no event of its
 * own.
 *
 * Always on — never gated by the `liveGuesses` setting, which covers the guess
 * ticker alone.
 *
 * Fires on the TRANSITION into a step, not on the step itself: `victory` stays
 * true for the rest of the game, so testing the value would re-announce on every
 * later snapshot. A rejoining client seeds from its first snapshot and announces
 * nothing for it, or it would replay a gauntlet entry from ten minutes ago.
 */
export const useGameAnnouncements = () => {
  const gameStore = useGameStore()
  const announcement = ref<GameAnnouncement>()
  /** Which view family every player stood in on the previous snapshot. */
  const previousFamilies = new Map<string, SeatViewFamily>()
  let seeded = false
  /** The approach announces once per game, for whoever arrives first. */
  let gauntletAnnounced = false

  const nameOf = (playerId: string) => gameStore.game?.players[playerId]?.name ?? 'Someone'
  const players = computed(() => gameStore.game?.players)

  watch(
    players,
    current => {
      if (!current) return

      // First snapshot (fresh load or rejoin): record where everyone stands and
      // announce nothing, or a mid-game refresh replays what it already missed.
      if (!seeded) {
        for (const [playerId, player] of Object.entries(current)) {
          const family = seatViewFamily(player.cursor)
          previousFamilies.set(playerId, family)
          if (family === 'final' || family === 'victory') gauntletAnnounced = true
        }
        seeded = true
        return
      }

      for (const [playerId, player] of Object.entries(current)) {
        const family = seatViewFamily(player.cursor)
        const previous = previousFamilies.get(playerId)
        previousFamilies.set(playerId, family)
        if (previous === family) continue

        // The acting player already sees their own gauntlet or victory screen.
        if (playerId === gameStore.playerId) continue

        if (family === 'final' && !gauntletAnnounced) {
          gauntletAnnounced = true
          announcement.value = {
            kicker: 'The final gauntlet',
            title: `${nameOf(playerId)} has reached the gauntlet`,
            stakes: 'Clear it and the game is theirs. Catch up before they do.',
            tone: 'alert',
          }
        } else if (family === 'victory') {
          announcement.value = {
            kicker: 'Gauntlet cleared',
            title: `${nameOf(playerId)} won`,
            stakes: 'The board is theirs. Play on for the places behind them.',
            tone: 'info',
          }
        }
      }
    },
    { deep: true, immediate: true }
  )

  return { announcement, dismiss: () => (announcement.value = undefined) }
}
