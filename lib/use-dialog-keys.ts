import type { Ref } from 'vue'

/**
 * The keyboard contract every dismissible dialog shares — Escape closes while
 * open, focus lands inside the dialog the moment it opens, and closing hands
 * focus back to whatever opened it. One home so ExpandDock, MediaDock and the
 * round-history drawer cannot drift apart on any of the three beats.
 *
 * The document listener attaches only while the dialog is open, so an idle
 * dialog costs nothing and Escape can never leak into other surfaces. The
 * focus move runs only on the closed→open TRANSITION: a dialog that mounts
 * already open (MediaDock's default) must not steal focus from the round's
 * console.
 */
export const useDialogKeys = (
  open: Ref<boolean>,
  options: {
    close: () => void
    initialFocus: () => HTMLElement | undefined
  }
) => {
  let opener: HTMLElement | undefined

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    options.close()
  }

  // Escape works even for a dialog that is already open on mount…
  watch(
    open,
    isOpen => {
      if (!import.meta.client) return
      if (isOpen) document.addEventListener('keydown', onKeydown)
      else document.removeEventListener('keydown', onKeydown)
    },
    { immediate: true }
  )

  // …but the focus choreography waits for a real open transition.
  watch(open, async isOpen => {
    if (isOpen) {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
      await nextTick()
      options.initialFocus()?.focus()
      return
    }
    if (opener?.isConnected) opener.focus()
    opener = undefined
  })

  onBeforeUnmount(() => {
    if (import.meta.client) document.removeEventListener('keydown', onKeydown)
  })
}
