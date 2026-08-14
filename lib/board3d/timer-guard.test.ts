import { describe, expect, it } from 'vitest'
import { installTimerVisibilityGuard } from './timer-guard'

/** A document stand-in with a real listener list — vitest runs bare, no DOM. */
const fakeDocument = () => {
  const listeners: { type: string; fn: EventListener }[] = []
  const doc = {
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

/** three's handler, post-disconnect: `_document` has been nulled under it. */
function handleVisibilityChange(this: { _document: { hidden: boolean } | null }) {
  if (this._document!.hidden === false) return
}

const orphaned = () => handleVisibilityChange.bind({ _document: null })

describe('installTimerVisibilityGuard', () => {
  it('swallows the orphaned timer handler instead of letting it throw', () => {
    const { doc, fire } = fakeDocument()
    installTimerVisibilityGuard(doc)

    doc.addEventListener('visibilitychange', orphaned())

    expect(fire('visibilitychange')).toEqual([])
  })

  it('still throws without the guard — the bug is real', () => {
    const { doc, fire } = fakeDocument()
    doc.addEventListener('visibilitychange', orphaned())

    const thrown = fire('visibilitychange')
    expect(thrown).toHaveLength(1)
    expect(thrown[0]).toBeInstanceOf(TypeError)
  })

  it('keeps removeEventListener working, so a guarded listener is not permanent', () => {
    const { doc, listeners } = fakeDocument()
    installTimerVisibilityGuard(doc)

    const handler = orphaned()
    doc.addEventListener('visibilitychange', handler)
    expect(listeners).toHaveLength(1)

    // The library removes by the reference it passed in. If the wrapper were
    // not findable from it, the guard would leak worse than the bug.
    doc.removeEventListener('visibilitychange', handler)
    expect(listeners).toHaveLength(0)
  })

  it('leaves every other listener untouched', () => {
    const { doc, fire } = fakeDocument()
    installTimerVisibilityGuard(doc)

    const boom = () => {
      throw new TypeError('someone else’s bug')
    }
    doc.addEventListener('visibilitychange', boom)
    doc.addEventListener('click', boom)

    // Not three's handler by name — must still surface.
    expect(fire('visibilitychange')).toHaveLength(1)
    expect(fire('click')).toHaveLength(1)
  })

  it('lets a real (connected) timer handler run normally', () => {
    const { doc, fire } = fakeDocument()
    installTimerVisibilityGuard(doc)

    let ran = false
    const live = handleVisibilityChange.bind({
      get _document() {
        ran = true
        return { hidden: false }
      },
    })
    doc.addEventListener('visibilitychange', live)

    expect(fire('visibilitychange')).toEqual([])
    expect(ran).toBe(true)
  })

  it('is idempotent — a board remount must not stack wrappers', () => {
    const { doc, listeners } = fakeDocument()
    const first = installTimerVisibilityGuard(doc)
    const patched = doc.addEventListener
    installTimerVisibilityGuard(doc)
    expect(doc.addEventListener).toBe(patched)

    const handler = orphaned()
    doc.addEventListener('visibilitychange', handler)
    doc.removeEventListener('visibilitychange', handler)
    expect(listeners).toHaveLength(0)

    first()
    expect(doc.addEventListener).not.toBe(patched)
  })

  it('restores the original listeners on teardown', () => {
    const { doc, fire } = fakeDocument()
    const uninstall = installTimerVisibilityGuard(doc)
    uninstall()

    doc.addEventListener('visibilitychange', orphaned())
    expect(fire('visibilitychange')).toHaveLength(1)
  })
})
