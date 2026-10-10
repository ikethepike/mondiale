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
  /** Server time per the client's clock estimate. */
  at: number
  /** The client's own clock offset estimate. */
  clockOffset: number
  playerId?: string
  rev?: number
  /** The seat's cursor as this client holds it. */
  cursor?: { seq: number; step: string; subject: string }
  /** The view key on screen. */
  view?: string
  /** The last cursor this client acked as rendered. */
  rendered?: { seq: number; step: string; subject: string }
  rounds?: number
  position?: number
  connected?: boolean
  transition: TransitionTrace
  /** What is actually painted: prompt headings, verdict cards, the layout's
   *  reveal card, and how many view roots the swap has mounted. */
  screen: ScreenResidue
}

export interface ScreenResidue {
  prompts: string[]
  verdicts: string[]
  revealCard: boolean
  viewRoots: number
}

const isPainted = (el: Element) => {
  const box = el.getBoundingClientRect()
  if (!box.width || !box.height) return false
  for (let node: Element | null = el; node; node = node.parentElement) {
    const style = getComputedStyle(node)
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) < 0.1) {
      return false
    }
  }
  return true
}

const paintedText = (selector: string) =>
  [...document.querySelectorAll(selector)]
    .filter(isPainted)
    .map(el => (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80))
    .filter(Boolean)

export const readScreen = (): ScreenResidue => ({
  prompts: paintedText('.challenge-prompt h1, .challenge-prompt h2'),
  verdicts: paintedText('.challenge-result .verdict-line'),
  revealCard: [...document.querySelectorAll('.reveal-wrapper')].some(isPainted),
  viewRoots:
    document.querySelector('.main-board')?.querySelectorAll(':scope > :not(.intro-overlay)')
      .length ?? 0,
})

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
