/**
 * Test instrumentation for the e2e playtest driver, armed only by the room
 * page's `?viewlog=1`. Everything here is read by `e2e/playtest.spec.ts`
 * through `window`; nothing in the game reads it back.
 */

export interface ViewLogEntry {
  key: string
  at: number
}

export interface TransitionTrace {
  leaveStartedAt?: number
  leaveDoneAt?: number
  enterStartedAt?: number
  enterDoneAt?: number
}

export interface GameProbe {
  at: number
  playerId?: string
  rev?: number
  phase?: string
  active?: string
  presented?: string
  rounds?: number
  position?: number
  moveChallenge?: string
  resolving?: boolean
  connected?: boolean
  transition: TransitionTrace
}

export interface PlaytestScope {
  __viewLog?: ViewLogEntry[]
  __gameProbe?: () => GameProbe
  __longTasks?: { at: number; duration: number }[]
}

export const playtestScope = (): PlaytestScope => window as unknown as PlaytestScope

/** Wrap the phase Transition's hooks so a `done` that never fires — a swap
 *  that strands the page on its outgoing view — is visible to the driver. */
export const traceTransitionHooks = <
  H extends {
    onEnter: (el: Element, done: () => void) => void
    onLeave: (el: Element, done: () => void) => void
  },
>(
  hooks: H,
  trace: TransitionTrace
): H => ({
  ...hooks,
  onEnter: (el, done) => {
    trace.enterStartedAt = Date.now()
    hooks.onEnter(el, () => {
      trace.enterDoneAt = Date.now()
      done()
    })
  },
  onLeave: (el, done) => {
    trace.leaveStartedAt = Date.now()
    hooks.onLeave(el, () => {
      trace.leaveDoneAt = Date.now()
      done()
    })
  },
})

export const observeLongTasks = () => {
  const scope = playtestScope()
  const tasks = (scope.__longTasks ??= [])
  try {
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        tasks.push({ at: Date.now(), duration: Math.round(entry.duration) })
      }
    }).observe({ type: 'longtask', buffered: true })
  } catch {
    // Not every engine exposes longtask entries; the driver treats absence as none.
  }
}
