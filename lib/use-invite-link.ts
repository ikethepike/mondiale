import { ref } from 'vue'
import { wait } from './time'

/** How long "Copied!" stands before the label returns to its resting text. */
export const COPIED_FEEDBACK_MS = 2000

/** The room's joinable address. ONE builder, so the QR, the share sheet and
 *  the copied string can never describe different rooms. */
export const roomInviteUrl = (gameId: string | undefined): string => {
  const { protocol, host } = window.location
  return `${protocol}//${host}/room/${gameId}`
}

/** The address as a person reads it — no scheme, just the part worth saying
 *  out loud or typing in. */
export const prettyInviteUrl = (url: string): string => url.replace(/^https?:\/\//, '')

/**
 * Handing a room link to someone else — THE one home for it, because both the
 * lobby's invite button and the QR sheet's address offer the same promise and
 * a second copy would drift.
 *
 * `share` prefers the OS sheet (one tap into a chat, which is the actual goal)
 * and falls back to the clipboard; `copy` is the clipboard alone, for surfaces
 * where a share sheet would be a surprise. Neither ever leaves a dead control:
 * a missing clipboard API prompts with the text selected instead of silently
 * doing nothing, and a share the player dismisses reports nothing at all
 * rather than claiming a copy that never happened.
 */
export const useInviteLink = (url: () => string) => {
  const hasCopied = ref(false)

  const flagCopied = async () => {
    hasCopied.value = true
    await wait(COPIED_FEEDBACK_MS)
    hasCopied.value = false
  }

  const copy = async () => {
    const link = url()
    if (!navigator?.clipboard) return void window.prompt('Copy this invite link', link)
    await navigator.clipboard.writeText(link).catch(() => undefined)
    await flagCopied()
  }

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Mondiale', text: 'Join my game of Mondiale', url: url() })
        return
      } catch (error) {
        // AbortError is the player closing the sheet — say nothing, do nothing.
        if ((error as Error)?.name === 'AbortError') return
      }
    }
    await copy()
  }

  return { hasCopied, copy, share }
}
