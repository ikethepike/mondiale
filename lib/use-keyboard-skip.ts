import { useGameStore } from '~~/store/game.store'

/**
 * Enter/Space skips a full-screen beat (an interstitial, the victory hero) —
 * the keyboard twin of "tap to continue". A window listener rather than a
 * giant button: the overlay must not yank focus from wherever the player left
 * it. Window listeners bypass the booth's inert wrapper, so a watcher's keys
 * must never drive the followed player's UI — hence the `watching` guard.
 */
export const useKeyboardSkip = (active: () => boolean, skip: () => void) => {
  const gameStore = useGameStore()
  if (!import.meta.client) return

  const onKeydown = (event: KeyboardEvent) => {
    if (gameStore.watching || !active()) return
    if (event.key !== 'Enter' && event.key !== ' ') return
    // A focused console owns its own Enter — don't double it into a skip.
    if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select')) {
      return
    }
    event.preventDefault()
    skip()
  }

  onMounted(() => window.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
}
