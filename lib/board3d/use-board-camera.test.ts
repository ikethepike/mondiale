import { gsap } from 'gsap'
import { PerspectiveCamera, Vector3 } from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ALERT_TILES,
  CAMERA_DRAG_SLOP_PX,
  createBoardCamera,
  FRAME_TILES,
  USER_IDLE_RESUME_MS,
} from './use-board-camera'

/**
 * The rig arbitrates between the auto-camera and the player's fingers, and the
 * arbitration is exactly what regressed on phones: OrbitControls calls a TAP a
 * grab, so a thumb on the board froze the follow-cam for a whole walk. Driven
 * here through the same two event surfaces the real controls use — the
 * 'start'/'end' pair and raw pointer events — so the verdict is pinned without
 * a canvas.
 */

const SPACING = 8

/** Both event surfaces land here: the 'start'/'end' pair ignores its argument,
 *  the pointer listeners read it. */
type Listener = (event: PointerEventLike) => void

interface PointerEventLike {
  pointerId: number
  clientX: number
  clientY: number
}

/**
 * Canvas and document are SEPARATE surfaces here, as they are in the browser:
 * OrbitControls takes no pointer capture and binds its own move/up to
 * `ownerDocument`, so a drag that leaves the canvas only reports there.
 */
const controlsStub = (options: { withPointerHost?: boolean } = {}) => {
  const listeners = new Map<string, Set<Listener>>()
  const canvasListeners = new Map<string, Set<Listener>>()
  const documentListeners = new Map<string, Set<Listener>>()

  const on = (map: Map<string, Set<Listener>>) => (type: string, listener: Listener) => {
    const set = map.get(type) ?? new Set()
    set.add(listener)
    map.set(type, set)
  }
  const off = (map: Map<string, Set<Listener>>) => (type: string, listener: Listener) => {
    map.get(type)?.delete(listener)
  }

  const controls = {
    target: new Vector3(),
    addEventListener: on(listeners),
    removeEventListener: off(listeners),
    update: () => {},
    domElement:
      options.withPointerHost === false
        ? undefined
        : {
            addEventListener: on(canvasListeners),
            removeEventListener: off(canvasListeners),
            ownerDocument: {
              addEventListener: on(documentListeners),
              removeEventListener: off(documentListeners),
            },
          },
  }

  const fire = (map: Map<string, Set<Listener>>, type: string, event?: PointerEventLike) => {
    for (const listener of [...(map.get(type) ?? [])]) listener(event as PointerEventLike)
  }

  return {
    controls,
    canvasListeners,
    documentListeners,
    start: () => fire(listeners, 'start'),
    end: () => fire(listeners, 'end'),
    // A gesture only counts if it STARTED on the board, so pointerdown is the
    // canvas; everything after it lands on the document.
    pointerDown: (x = 0, y = 0, pointerId = 1) =>
      fire(canvasListeners, 'pointerdown', { pointerId, clientX: x, clientY: y }),
    pointerMove: (x: number, y: number, pointerId = 1) =>
      fire(documentListeners, 'pointermove', { pointerId, clientX: x, clientY: y }),
    pointerUp: (pointerId = 1) =>
      fire(documentListeners, 'pointerup', { pointerId, clientX: 0, clientY: 0 }),
    wheel: () => fire(canvasListeners, 'wheel'),
  }
}

/**
 * OrbitControls dispatches 'start' from inside its own pointerdown handler,
 * and the rig listens in the CAPTURE phase on the same element — so a real
 * gesture always reports the pointer first. The helpers below drive that
 * order; nothing in the rig may depend on it (see the wheel case).
 */
const rigFor = (options: { withPointerHost?: boolean; resumeDelayMs?: number } = {}) => {
  const grabs: number[] = []
  const stub = controlsStub({ withPointerHost: options.withPointerHost })
  const camera = new PerspectiveCamera()
  // A plain overview shot: 100 units out, well above FRAME_TILES * SPACING.
  camera.position.set(0, 80, 60)

  const rig = createBoardCamera(camera, stub.controls, {
    spacing: () => SPACING,
    resumeDelayMs: options.resumeDelayMs === undefined ? undefined : () => options.resumeDelayMs!,
    onUserGrab: () => grabs.push(1),
  })

  return { ...stub, camera, rig, grabCount: () => grabs.length }
}

/**
 * Bare node has no rAF, so driving the global timeline is what advances
 * tweens. Chained callbacks (a sweep's onComplete releasing a banked step)
 * need repeated steps rather than one jump.
 */
let clock = 0
const drainTweens = () => {
  for (let step = 0; step < 120; step++) {
    clock += 0.05
    gsap.globalTimeline.totalTime(clock)
  }
}

const distanceOf = (camera: PerspectiveCamera, target: Vector3) =>
  camera.position.distanceTo(target)

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('gesture arbitration', () => {
  it('never lets a tap claim the camera', () => {
    const { start, end, pointerDown, pointerMove, pointerUp, rig, controls, grabCount } = rigFor()

    pointerDown(100, 100)
    start()
    // A tap wobbles a pixel or two — still a tap.
    pointerMove(102, 101)
    rig.follow(new Vector3(9, 0, 0))
    pointerUp()
    end()

    expect(grabCount()).toBe(0)
    drainTweens()
    // The aim the tap swallowed is applied on release, not lost.
    expect(controls.target.x).toBeCloseTo(9, 1)
  })

  it('claims once, at the slop line, and not before', () => {
    const { start, pointerDown, pointerMove, rig, controls, grabCount } = rigFor()

    pointerDown(100, 100)
    start()
    pointerMove(100 + CAMERA_DRAG_SLOP_PX - 6, 100)
    expect(grabCount()).toBe(0)

    pointerMove(100 + CAMERA_DRAG_SLOP_PX + 4, 100)
    expect(grabCount()).toBe(1)
    // Further travel in the same gesture is still one grab.
    pointerMove(400, 400)
    expect(grabCount()).toBe(1)

    const before = controls.target.clone()
    rig.follow(new Vector3(20, 0, 0))
    drainTweens()
    expect(controls.target.x).toBeCloseTo(before.x, 5)
  })

  it('claims a wheel zoom, whose camera move lands only after end', () => {
    const { start, end, wheel, rig, controls, grabCount } = rigFor()

    // A wheel has no travel to measure and its camera move lands on the next
    // update() — after 'end' — so the wheel event itself is the signal.
    start()
    wheel()
    end()
    expect(grabCount()).toBe(1)

    rig.follow(new Vector3(30, 0, 0))
    drainTweens()
    expect(controls.target.x).toBeCloseTo(0, 5)
  })

  it('holds and then RELEASES a wheel that claimed before the controls spoke', () => {
    // The real capture-phase order: the rig sees `wheel` before OrbitControls
    // dispatches 'start'. Resetting the claim on 'start' made 'end' read the
    // zoom as a tap, so the hold was never armed and the camera stopped
    // tracking for the rest of the game.
    const { start, end, wheel, rig, controls, grabCount } = rigFor()

    wheel()
    start()
    end()
    expect(grabCount()).toBe(1)

    rig.follow(new Vector3(30, 0, 0))
    drainTweens()
    expect(controls.target.x).toBeCloseTo(0, 5)

    vi.advanceTimersByTime(USER_IDLE_RESUME_MS + 10)
    drainTweens()
    expect(controls.target.x).toBeCloseTo(30, 1)
  })

  it('never leaves the camera held after a tap', () => {
    const { start, end, pointerDown, pointerUp, rig, controls } = rigFor()

    pointerDown(50, 50)
    start()
    pointerUp()
    end()

    // No timer to wait on: a tap hands the camera straight back.
    rig.follow(new Vector3(13, 0, 0))
    drainTweens()
    expect(controls.target.x).toBeCloseTo(13, 1)
  })

  it('claims on start when no pointer host is wired', () => {
    const { start, grabCount } = rigFor({ withPointerHost: false })

    start()
    expect(grabCount()).toBe(1)
  })

  it('reads travel from the document, where a drag off the canvas still lands', () => {
    // OrbitControls never calls setPointerCapture, so once a finger crosses an
    // overlay its pointermove targets THAT element. Travel read from the canvas
    // would stop and the rotate would be graded a tap.
    const { canvasListeners, documentListeners } = rigFor()

    expect(canvasListeners.has('pointermove')).toBe(false)
    expect(documentListeners.get('pointermove')?.size).toBe(1)
    expect(documentListeners.get('pointerup')?.size).toBe(1)
    expect(documentListeners.get('pointercancel')?.size).toBe(1)
    // The gesture must still have to START on the board.
    expect(canvasListeners.get('pointerdown')?.size).toBe(1)
    expect(canvasListeners.get('wheel')?.size).toBe(1)
  })

  it('keeps a pinch held when the first of two fingers lifts', () => {
    // three-stdlib dispatches 'end' on EVERY pointerup, not only the last, so
    // grading on the first lift read the second as a tap and cancelled the
    // hold the pinch had just earned — the camera snapped back mid-gesture.
    const { start, end, pointerDown, pointerMove, pointerUp, rig, controls, grabCount } = rigFor()

    pointerDown(100, 100, 1)
    pointerDown(200, 200, 2)
    start()
    pointerMove(160, 160, 1)
    expect(grabCount()).toBe(1)

    pointerUp(1)
    end()
    rig.follow(new Vector3(21, 0, 0))
    drainTweens()
    expect(controls.target.x).toBeCloseTo(0, 5)

    pointerUp(2)
    end()
    rig.follow(new Vector3(22, 0, 0))
    drainTweens()
    expect(controls.target.x).toBeCloseTo(0, 5)

    vi.advanceTimersByTime(USER_IDLE_RESUME_MS + 10)
    drainTweens()
    expect(controls.target.x).toBeCloseTo(22, 1)
  })

  it('lets no stray tap cut short a hold an earlier drag earned', () => {
    const { start, end, pointerDown, pointerMove, pointerUp, rig, controls } = rigFor()

    pointerDown(0, 0)
    start()
    pointerMove(200, 200)
    pointerUp()
    end()
    rig.follow(new Vector3(31, 0, 0))

    // A tap a moment later, well inside the hold.
    vi.advanceTimersByTime(1000)
    pointerDown(10, 10)
    start()
    pointerUp()
    end()
    drainTweens()
    expect(controls.target.x).toBeCloseTo(0, 5)

    // The ORIGINAL hold still governs when the camera comes back.
    vi.advanceTimersByTime(USER_IDLE_RESUME_MS)
    drainTweens()
    expect(controls.target.x).toBeCloseTo(31, 1)
  })

  it('recovers when neither the pointerup nor the end ever lands', () => {
    // Both signals can get stuck: OrbitControls binds pointercancel to the
    // CANVAS, so a cancel over an overlay never fires its 'end', and a
    // pointerup the browser drops leaves `downAt` full. Holding on either
    // alone would leave the follow-cam dead until a remount.
    const { start, pointerDown, pointerMove, rig, controls, grabCount } = rigFor()

    pointerDown(0, 0)
    start()
    pointerMove(200, 200)
    expect(grabCount()).toBe(1)
    // ...and then nothing at all: no move, no up, no end.
    rig.follow(new Vector3(9, 0, 0))

    vi.advanceTimersByTime(USER_IDLE_RESUME_MS * 2 + 10)
    drainTweens()
    expect(controls.target.x).toBeCloseTo(9, 1)
  })

  it('never resumes under a finger that is still driving', () => {
    // The hold is armed at the grab, so a drag longer than the hold would
    // otherwise have the camera resume and fight the gesture. A live drag
    // keeps reporting movement, and that is what holds it off.
    const { start, pointerDown, pointerMove, pointerUp, end, rig, controls, grabCount } = rigFor()

    pointerDown(0, 0)
    start()
    pointerMove(200, 200)
    expect(grabCount()).toBe(1)

    // Three hold windows of continuous dragging.
    for (let step = 0; step < 12; step++) {
      vi.advanceTimersByTime(USER_IDLE_RESUME_MS / 4)
      pointerMove(200 + step * 10, 200 + step * 10)
    }
    rig.follow(new Vector3(18, 0, 0))
    drainTweens()
    expect(controls.target.x).toBeCloseTo(0, 5)

    pointerUp()
    end()
    vi.advanceTimersByTime(USER_IDLE_RESUME_MS + 10)
    drainTweens()
    expect(controls.target.x).toBeCloseTo(18, 1)
  })
})

describe('release', () => {
  it('re-aims on the last swallowed point when the hold lifts', () => {
    const { start, end, pointerDown, pointerMove, pointerUp, rig, controls } = rigFor()

    pointerDown(0, 0)
    start()
    pointerMove(200, 200)
    pointerUp()
    end()

    // Steps keep landing through the hold; only the last one matters.
    rig.follow(new Vector3(4, 0, 0))
    rig.follow(new Vector3(5, 0, 0))
    rig.follow(new Vector3(6, 0, 0))
    drainTweens()
    expect(controls.target.x).toBeCloseTo(0, 5)

    vi.advanceTimersByTime(USER_IDLE_RESUME_MS + 10)
    drainTweens()
    expect(controls.target.x).toBeCloseTo(6, 1)
  })

  it('honours a longer hold from one timer', () => {
    const BOOTH_HOLD = USER_IDLE_RESUME_MS * 2
    const { start, end, pointerDown, pointerMove, pointerUp, rig, controls } = rigFor({
      resumeDelayMs: BOOTH_HOLD,
    })

    pointerDown(0, 0)
    start()
    pointerMove(200, 200)
    pointerUp()
    end()
    rig.follow(new Vector3(7, 0, 0))

    vi.advanceTimersByTime(USER_IDLE_RESUME_MS + 10)
    drainTweens()
    expect(controls.target.x).toBeCloseTo(0, 5)

    vi.advanceTimersByTime(BOOTH_HOLD)
    drainTweens()
    expect(controls.target.x).toBeCloseTo(7, 1)
  })
})

describe('frameOn and follow', () => {
  it('frames at the requested tile distance', () => {
    const { rig, camera, controls } = rigFor()

    rig.frameOn(new Vector3(12, 0, 0))
    drainTweens()

    expect(controls.target.x).toBeCloseTo(12, 1)
    expect(distanceOf(camera, controls.target)).toBeCloseTo(FRAME_TILES * SPACING, 0)
    // The pitch floor keeps the shot oblique rather than flat-on.
    expect(camera.position.y).toBeGreaterThan(controls.target.y)
  })

  it('pushes in tighter for an alert', () => {
    const { rig, camera, controls } = rigFor()

    rig.frameOn(new Vector3(12, 0, 0), { tiles: ALERT_TILES })
    drainTweens()

    expect(distanceOf(camera, controls.target)).toBeCloseTo(ALERT_TILES * SPACING, 0)
  })

  it('translates the rig without changing the shot when following', () => {
    const { rig, camera, controls } = rigFor()

    rig.frameOn(new Vector3(0, 0, 0))
    drainTweens()
    const before = distanceOf(camera, controls.target)
    const delta = camera.position.clone().sub(controls.target)

    rig.follow(new Vector3(16, 0, 0))
    drainTweens()

    expect(controls.target.x).toBeCloseTo(16, 1)
    expect(distanceOf(camera, controls.target)).toBeCloseTo(before, 4)
    expect(camera.position.clone().sub(controls.target).distanceTo(delta)).toBeCloseTo(0, 4)
  })

  it('banks a step landing during a framing sweep instead of killing it', () => {
    const { rig, camera, controls } = rigFor()

    rig.frameOn(new Vector3(0, 0, 0))
    drainTweens()

    // A resumed walk: the sweep starts, then its own first step arrives.
    rig.frameOn(new Vector3(10, 0, 0))
    clock += 0.1
    gsap.globalTimeline.totalTime(clock)
    rig.follow(new Vector3(11, 0, 0))
    drainTweens()

    // The sweep reached its distance AND the banked step was applied after.
    expect(controls.target.x).toBeCloseTo(11, 1)
    expect(distanceOf(camera, controls.target)).toBeCloseTo(FRAME_TILES * SPACING, 0)
  })

  it('survives a follow issued in the SAME tick as the sweep', () => {
    // The live announce path: one snapshot flips the seat to 'moving' and the
    // stage to active, so the framing watcher and the show pass both run in a
    // single flush. gsap reports a fresh tween inactive until its first
    // render, so an in-flight test built on isActive() read "nothing framing"
    // here and the follow killed the sweep — the very shot being added.
    // Straight from the opening overview, so a killed sweep leaves the camera
    // at that distance and the assertion can tell the difference — the whole
    // point of the beat is resetting it.
    const { rig, camera, controls } = rigFor()
    const overview = distanceOf(camera, controls.target)
    expect(overview).toBeGreaterThan(FRAME_TILES * SPACING * 1.5)

    rig.frameOn(new Vector3(10, 0, 0))
    rig.follow(new Vector3(10, 0, 0)) // same tick, no render in between
    drainTweens()

    expect(controls.target.x).toBeCloseTo(10, 1)
    expect(distanceOf(camera, controls.target)).toBeCloseTo(FRAME_TILES * SPACING, 0)
  })

  it('lets a fresh frame supersede a step banked behind the sweep it kills', () => {
    // A gate's push-in lands over a walk's sweep. The step banked behind that
    // sweep must not be replayed by the push-in's completion, or the camera
    // slides straight off the gate tile it just framed.
    const { rig, camera, controls } = rigFor()

    rig.frameOn(new Vector3(0, 0, 0))
    drainTweens()

    rig.frameOn(new Vector3(10, 0, 0))
    clock += 0.1
    gsap.globalTimeline.totalTime(clock)
    rig.follow(new Vector3(11, 0, 0))
    // The gate hit: a tighter push-in that kills the walk sweep mid-flight.
    rig.frameOn(new Vector3(12, 0, 0), { tiles: ALERT_TILES })
    drainTweens()

    expect(controls.target.x).toBeCloseTo(12, 1)
    expect(distanceOf(camera, controls.target)).toBeCloseTo(ALERT_TILES * SPACING, 0)
  })
})

describe('the auto-framing latch', () => {
  it('retires framing for good once the player drives, but keeps tracking', () => {
    const { start, end, pointerDown, pointerMove, pointerUp, rig, camera, controls } = rigFor()

    rig.frameOn(new Vector3(0, 0, 0))
    drainTweens()

    pointerDown(0, 0)
    start()
    pointerMove(200, 200)
    pointerUp()
    end()
    // The player's own shot: pull way out, as a pinch-zoom would.
    camera.position.set(controls.target.x, 400, 300)
    const taken = distanceOf(camera, controls.target)

    vi.advanceTimersByTime(USER_IDLE_RESUME_MS + 10)
    drainTweens()

    rig.frameOn(new Vector3(20, 0, 0))
    drainTweens()
    // Tracked, not re-framed: the distance is still theirs.
    expect(controls.target.x).toBeCloseTo(20, 1)
    expect(distanceOf(camera, controls.target)).toBeCloseTo(taken, 3)

    // A new subject reclaims the shot.
    rig.takeOver()
    rig.frameOn(new Vector3(24, 0, 0))
    drainTweens()
    expect(distanceOf(camera, controls.target)).toBeCloseTo(FRAME_TILES * SPACING, 0)
  })
})
