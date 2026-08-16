import { Timer } from 'three'
import { afterEach, describe, expect, it } from 'vitest'
import { installTimerVisibilityGuard } from './timer-guard'

/** A document stand-in with a real listener list — vitest runs bare, no DOM. */
const fakeDocument = () => {
  const listeners: { type: string; fn: EventListener }[] = []
  const doc = {
    // Timer.connect gates on the Page Visibility API being present
    hidden: false,
    addEventListener: (type: string, fn: EventListener) => {
      listeners.push({ type, fn })
    },
    removeEventListener: (type: string, fn: EventListener) => {
      const index = listeners.findIndex(l => l.type === type && l.fn === fn)
      if (index >= 0) listeners.splice(index, 1)
    },
  } as unknown as Document
  return {
    doc,
    listeners,
    fire: (type: string) => {
      const thrown: unknown[] = []
      for (const l of [...listeners]) {
        if (l.type !== type) continue
        try {
          l.fn(new Event(type))
        } catch (error) {
          thrown.push(error)
        }
      }
      return thrown
    },
  }
}

let uninstall: (() => void) | undefined

afterEach(() => {
  uninstall?.()
  uninstall = undefined
})

describe('installTimerVisibilityGuard', () => {
  it('reproduces the leak without the guard — the bug is real', () => {
    const { doc, listeners, fire } = fakeDocument()
    const timer = new Timer()
    timer.connect(doc)
    timer.connect(doc)
    // The double connect orphans the first handler...
    expect(listeners).toHaveLength(2)
    timer.disconnect()
    expect(listeners).toHaveLength(1)
    // ...and the orphan dereferences the nulled `_document` when fired.
    const thrown = fire('visibilitychange')
    expect(thrown).toHaveLength(1)
    expect(thrown[0]).toBeInstanceOf(TypeError)
  })

  it('turns a double connect into a reconnect — one listener, no orphan', () => {
    const { doc, listeners, fire } = fakeDocument()
    uninstall = installTimerVisibilityGuard()

    const timer = new Timer()
    timer.connect(doc)
    timer.connect(doc)
    expect(listeners).toHaveLength(1)

    timer.disconnect()
    expect(listeners).toHaveLength(0)
    expect(fire('visibilitychange')).toEqual([])
  })

  it('leaves a connected timer working normally', () => {
    const { doc, listeners } = fakeDocument()
    uninstall = installTimerVisibilityGuard()

    const timer = new Timer()
    timer.connect(doc)
    expect(listeners).toHaveLength(1)
    // The live handler reads the document it is still connected to — no throw.
    expect(() => listeners[0].fn(new Event('visibilitychange'))).not.toThrow()
    timer.disconnect()
    expect(listeners).toHaveLength(0)
  })

  it('is idempotent — a board remount must not stack patches', () => {
    uninstall = installTimerVisibilityGuard()
    const patchedConnect = Timer.prototype.connect
    const second = installTimerVisibilityGuard()
    expect(Timer.prototype.connect).toBe(patchedConnect)
    expect(second).toBe(uninstall)
  })

  it('restores the original connect on teardown', () => {
    const original = Timer.prototype.connect
    const teardown = installTimerVisibilityGuard()
    expect(Timer.prototype.connect).not.toBe(original)
    teardown()
    expect(Timer.prototype.connect).toBe(original)
  })
})
