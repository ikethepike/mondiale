import { Timer } from 'three'

/**
 * Fixes a listener leak in three's `Timer`, surfaced by TresJS.
 *
 * `Timer.connect(document)` binds a FRESH `visibilitychange` handler and adds
 * it, overwriting `_pageVisibilityHandler` without removing the handler it
 * already installed. `Timer.disconnect()` removes only the newest one and then
 * sets the timer's `_document` to null. So a timer that was connected twice
 * leaves an orphaned handler behind that still dereferences
 * `this._document.hidden` — and throws
 * `TypeError: Cannot read properties of null (reading 'hidden')` on the next
 * tab switch or page teardown.
 *
 * TresJS connects the timer twice on every canvas: once when its renderer
 * signals ready (`readyEventHook` → `loop.start()`) and once through the
 * `useLoop()` control our render-loop gate drives. Both are inside the
 * library, so there is no call-site of ours to correct — but the `Timer`
 * class itself is importable (and deduped, so TresJS's `new THREE.Timer()`
 * is this same class), which lets the fix live at the source: `connect`
 * disconnects first, turning the leak into a reconnect. `disconnect()` is
 * null-safe by construction, so the extra call on a fresh timer is a no-op.
 *
 * An earlier version of this guard wrapped `document.addEventListener` and
 * matched the offending handler by `listener.name` — which minification
 * renames, so the guard silently matched nothing in production builds. The
 * prototype patch has no names to lose.
 */

const GUARDED = Symbol('tres-timer-connect-guard')

type GuardedTimer = typeof Timer & { [GUARDED]?: () => void }

/**
 * Idempotent: the board can mount, unmount and remount for the whole game
 * (context loss, chunk failure), and the guard must not stack patches — a
 * second install returns the first's uninstaller.
 */
export const installTimerVisibilityGuard = (timerClass: typeof Timer = Timer): (() => void) => {
  const patched = timerClass as GuardedTimer
  const existing = patched[GUARDED]
  if (existing) return existing

  const originalConnect = timerClass.prototype.connect
  timerClass.prototype.connect = function guardedConnect(
    ...args: Parameters<Timer['connect']>
  ) {
    this.disconnect()
    return originalConnect.apply(this, args)
  }

  const uninstall = () => {
    timerClass.prototype.connect = originalConnect
    patched[GUARDED] = undefined
  }
  patched[GUARDED] = uninstall
  return uninstall
}
