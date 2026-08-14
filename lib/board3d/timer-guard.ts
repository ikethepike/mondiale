/**
 * Silences a listener leak in three's `Timer`, surfaced by TresJS.
 *
 * `Timer.connect(document)` binds a FRESH `visibilitychange` handler and adds
 * it, without removing any handler it already installed. `Timer.disconnect()`
 * removes only the newest one and then sets the timer's `_document` to null.
 * So a timer that was connected twice leaves an orphaned handler behind that
 * still dereferences `this._document.hidden` — and throws
 * `TypeError: Cannot read properties of null (reading 'hidden')` on the next
 * tab switch or page teardown.
 *
 * TresJS connects the timer twice on every canvas: once when its renderer
 * signals ready (`readyEventHook` → `loop.start()`) and once through the
 * `useLoop()` control our render-loop gate drives. Both are inside the
 * library, so there is no call-site of ours to correct — and with no patch
 * tooling in this repo, the fix has to live in code we own.
 *
 * Rather than reach into either library's internals, we wrap
 * `document.addEventListener` for the one event involved and make the
 * offending handlers non-throwing. Everything else passes straight through.
 *
 * The error is thrown from a listener, so it never broke a frame — but it
 * fires on every tab switch, and an exception the console reports on a healthy
 * board is noise that hides the next real one.
 */

const GUARDED = Symbol('tres-timer-visibility-guard')

type GuardedDocument = Document & { [GUARDED]?: boolean }

/**
 * Idempotent: the board can mount, unmount and remount for the whole game
 * (context loss, chunk failure), and the guard must not stack wrappers.
 */
export const installTimerVisibilityGuard = (target: Document = document): (() => void) => {
  const doc = target as GuardedDocument
  if (doc[GUARDED]) return () => {}
  doc[GUARDED] = true

  const originalAdd = doc.addEventListener.bind(doc)
  const originalRemove = doc.removeEventListener.bind(doc)

  // The library removes a handler by the reference it passed in, so the
  // wrapper has to be findable from that original. Without this the guard
  // would turn a leaked listener into a permanent one — strictly worse than
  // the bug it fixes.
  const wrappers = new WeakMap<EventListener, EventListener>()

  const shouldGuard = (
    type: string,
    listener: EventListenerOrEventListenerObject | null
  ): listener is EventListener =>
    type === 'visibilitychange' &&
    typeof listener === 'function' &&
    // Only three's Timer handler reads a field the library nulls out from
    // under it. Everything else passes through untouched.
    //
    // `connect()` installs it as `handleVisibilityChange.bind(this)`, and a
    // bound function is named "bound handleVisibilityChange" — matching the
    // bare name alone would never fire.
    /(^|\s)handleVisibilityChange$/.test(listener.name)

  doc.addEventListener = function guardedAddEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions
  ) {
    if (!shouldGuard(type, listener)) {
      return originalAdd(type, listener as unknown as EventListener, options)
    }

    const existing = wrappers.get(listener)
    if (existing) return originalAdd(type, existing, options)

    const guarded: EventListener = event => {
      try {
        return listener.call(doc, event)
      } catch (error) {
        // A disconnected timer's orphan. Nothing to reset, nothing to log.
        if (error instanceof TypeError) return
        throw error
      }
    }

    wrappers.set(listener, guarded)
    return originalAdd(type, guarded, options)
  } as Document['addEventListener']

  doc.removeEventListener = function guardedRemoveEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions
  ) {
    if (shouldGuard(type, listener)) {
      const guarded = wrappers.get(listener)
      if (guarded) return originalRemove(type, guarded, options)
    }
    return originalRemove(type, listener as unknown as EventListener, options)
  } as Document['removeEventListener']

  return () => {
    doc.addEventListener = originalAdd
    doc.removeEventListener = originalRemove
    doc[GUARDED] = undefined
  }
}
