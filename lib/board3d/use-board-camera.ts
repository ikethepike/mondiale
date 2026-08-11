import { gsap } from 'gsap'
import type { PerspectiveCamera, Vector3 } from 'three'
import { MathUtils, Vector3 as Vec3 } from 'three'
import { EASE, prefersReducedMotion } from '~~/lib/motion'
import { STEP_INTERVAL_MS, WALK_FRAME_MS } from '~~/lib/round-beats'

/** Pointer events the drag verdict reads — structural so a test can stub it. */
interface PointerEventLike {
  pointerId: number
  clientX: number
  clientY: number
}

interface PointerHost {
  addEventListener(
    type: string,
    listener: (event: PointerEventLike) => void,
    options?: unknown
  ): void
  removeEventListener(
    type: string,
    listener: (event: PointerEventLike) => void,
    options?: unknown
  ): void
  /** Where a drag's later events actually land — see the binding note below. */
  ownerDocument?: PointerHost
}

/** The slice of three-stdlib OrbitControls this composable relies on. */
interface OrbitControlsLike {
  target: Vector3
  addEventListener(type: string, listener: () => void): void
  removeEventListener(type: string, listener: () => void): void
  update(): void
  /** The canvas OrbitControls binds its own pointerdown/wheel listeners to. */
  domElement?: PointerHost
}

/** Framing distance in TILES — the rig turns it into world units via `spacing`. */
export const FRAME_TILES = 6.5
/** The tighter push-in a gate hit takes. */
export const ALERT_TILES = 3.2
/** Fallback when no spacing resolver is wired (the /test harness, unit rigs). */
const DEFAULT_SPACING = 8

/** Per-second lambdas for `MathUtils.damp` — how hard tracking chases its
 *  source. Y is much softer on purpose: it filters the hop arc's bob down to a
 *  gentle rise while still following real tile-height changes within ~1s. */
export const TRACK_DAMP_XZ = 8
export const TRACK_DAMP_Y = 2.2

/** How long after a confirmed grab the auto-camera resumes. */
export const USER_IDLE_RESUME_MS = 4000
/**
 * Pointer travel below this is a TAP, not a grab. OrbitControls dispatches
 * 'start' on POINTERDOWN, not on first movement — and on a phone the board is
 * the whole screen, so treating that as a grab suppressed the follow-cam for
 * a whole walk on every stray thumb. 'change' is no substitute either:
 * update() dispatches it for OUR tweens too.
 */
export const CAMERA_DRAG_SLOP_PX = 10

export interface FrameOptions {
  /** Orbit distance in tiles. */
  tiles?: number
  durationMs?: number
  /** Override the sweep's ease. Defaults to `EASE.cross` — the soft glide a
   *  routine framing shot wants. A director beat (the gate punch-in) asks for
   *  something harder so it reads as a cut, not a drift. */
  ease?: string
  /**
   * This is a SCRIPTED BEAT, not routine tracking: play it even after the
   * player has driven the camera by hand.
   *
   * `cameraTaken` retires automatic framing for the rest of the game on the
   * player's first real gesture, which is right for the walk-follow shots that
   * would otherwise fight their fingers — but it also silently swallowed the
   * gate push-in, so any player who had ever dragged the board never saw the
   * one beat that exists to be dramatic. A commanding frame outranks that
   * latch. It does NOT outrank a LIVE gesture: `held()` still banks it, so a
   * beat can never be wrenched out of a finger mid-drag.
   */
  commanding?: boolean
}

export interface BoardCamera {
  /** Re-FRAME onto a point: resets the orbit distance, keeps the azimuth. */
  frameOn(point: Vector3, options?: FrameOptions): void
  /** Nudge toward a point once, preserving the player's chosen angle and zoom.
   *  Stands down entirely while `track` has a source — the tracker IS the
   *  translation then. */
  follow(point: Vector3): void
  /** Continuous, per-frame tracking of a LIVE point (the followed pawn's
   *  object), translate-only like `follow`. Call with no source to disengage. */
  track(source?: () => Vector3 | undefined): void
  /** An explicit re-aim (a pin, a director cut) outranks a grab and reclaims
   *  automatic framing. */
  takeOver(): void
  dispose(): void
}

/**
 * Auto-camera that never fights the player's fingers. Two moves, and the
 * difference matters: `frameOn` overrides the shot (distance and pitch),
 * `follow` only translates the rig. A confirmed gesture suppresses both for a
 * while and retires framing for good — the shot is theirs from then on, while
 * tracking stays automatic. `onUserGrab` fires once per confirmed gesture —
 * but a wheel is a gesture PER TICK as far as OrbitControls is concerned, so
 * treat it as repeatable and keep the handler idempotent; callers use it to
 * drop modes (like spectating) that a grab should cancel.
 */
export const createBoardCamera = (
  camera: PerspectiveCamera,
  controls: OrbitControlsLike,
  options: {
    onUserGrab?: () => void
    /** Board spacing, so the tiles → world conversion lives HERE. */
    spacing?: () => number
    /** The booth's look-around holds longer than a racer's grab. */
    resumeDelayMs?: () => number
    /** The tracking heartbeat — defaults to gsap's ticker; tests inject one. */
    ticker?: {
      add(callback: (time: number, deltaMs: number) => void): void
      remove(callback: (time: number, deltaMs: number) => void): void
    }
  } = {}
): BoardCamera => {
  /** A confirmed gesture's hold: both moves stand down until it lifts. */
  let userHasControl = false
  /** A gesture is live and its verdict (tap or drag) is still open. */
  let gestureActive = false
  /** This gesture already claimed control — claim exactly once. */
  let claimed = false
  /**
   * The player has driven the camera by hand, so automatic FRAMING is retired
   * for the rest of the game — only an explicit new subject (`takeOver`)
   * reclaims it. Tracking is unaffected. The 2D twin is `cameraTaken` in
   * GameMap.vue; the two cameras share this meaning and nothing else (viewBox
   * easing vs an orbit rig), so they stay separate implementations.
   */
  let cameraTaken = false
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  const downAt = new Map<number, { x: number; y: number }>()
  /** When a pointer last did anything — the liveness signal `release` trusts. */
  let lastPointerAt = 0
  const tweens = new Set<gsap.core.Tween>()
  /** The framing sweep's own tweens — a step must not shoot one down. */
  const frameTweens = new Set<gsap.core.Tween>()
  /** A request a hold swallowed, replayed verbatim when control comes back. */
  let pendingFocus: { point: Vec3; mode: 'frame' | 'follow'; options?: FrameOptions } | undefined
  /** The last point the auto-camera knew, applied or not — the re-aim fallback
   *  for a grab that killed a sweep mid-flight with nothing new behind it. */
  let lastPoint: Vec3 | undefined

  const killTweens = () => {
    tweens.forEach(tween => tween.kill())
    tweens.clear()
    frameTweens.clear()
  }

  // Membership, NOT `tween.isActive()`: gsap reports a fresh tween inactive
  // until its first render, so a follow in the SAME tick as the sweep read
  // "nothing framing" and killed it — which is the live announce path, where
  // one snapshot flips the seat to 'moving' and the stage to active, so the
  // framing watcher and the show pass both run in one flush.
  const framingInFlight = () => frameTweens.size > 0
  const held = () => userHasControl || gestureActive

  const holdMs = () => options.resumeDelayMs?.() ?? USER_IDLE_RESUME_MS

  const armResume = () => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(release, holdMs())
  }

  /**
   * Handing the camera back is not enough on its own: nothing used to re-aim
   * until the next inbound event, so a tap over the last steps of a walk left
   * the arrival unframed for good. Replay what the hold swallowed; failing
   * that, re-aim on the last point we knew.
   */
  const resume = () => {
    const pending = pendingFocus
    pendingFocus = undefined
    if (pending?.mode === 'frame') return frameOn(pending.point, pending.options)
    if (pending) return follow(pending.point)
    if (lastPoint) follow(lastPoint)
  }

  /**
   * Keep the camera only while the gesture is DEMONSTRABLY live — pointer
   * activity inside the last hold window. Neither flag can be trusted alone:
   * OrbitControls binds pointercancel to the CANVAS, so a cancel over an
   * overlay leaves its 'end' unfired and `gestureActive` stuck true, while a
   * pointerup the browser never delivers leaves `downAt` stuck full. Either
   * one, held on its own, would suppress the follow-cam for the rest of the
   * game. Activity cannot get stuck, so the state resets around it.
   */
  const release = () => {
    idleTimer = undefined
    if (downAt.size && Date.now() - lastPointerAt < holdMs()) return armResume()

    gestureActive = false
    claimed = false
    downAt.clear()
    userHasControl = false
    resume()
  }

  /** A DRAG (or a zoom): the player is driving. */
  const claim = () => {
    if (claimed) return
    claimed = true
    userHasControl = true
    cameraTaken = true
    killTweens()
    options.onUserGrab?.()
    // Arm the hold HERE, not only at 'end': a claim can arrive before the
    // controls even announce the gesture (the wheel listener runs in the
    // capture phase), and a hold that only 'end' arms would never expire if
    // the pairing were ever missed — the camera would stop tracking for good.
    armResume()
  }

  const onControlsStart = () => {
    gestureActive = true
    // NOTE: `claimed` is deliberately NOT reset here — a wheel claims from the
    // capture phase BEFORE this fires, and clearing it would make 'end' read
    // the zoom as a tap. It is cleared when the gesture ends.
    //
    // With no pointer host we can read neither travel nor wheels: fall back to
    // claiming on 'start', which is the old behaviour. Better that than a
    // camera the player cannot grab at all.
    if (!controls.domElement) claim()
  }

  const onControlsEnd = () => {
    // The controls are authoritative that their gesture segment ended.
    gestureActive = false

    // three-stdlib dispatches 'end' on EVERY pointerup, not only the last one
    // (its dispatch sits outside the `pointers.length === 0` branch), so a
    // pinch fires it twice. Grade only once the last finger is up: a verdict
    // on the first lift reads the second as a TAP and cancels the hold the
    // pinch just earned. Re-arming meanwhile keeps the hold alive.
    if (downAt.size) return armResume()

    if (claimed) {
      claimed = false
      // Re-arm from the release of the finger, not from the claim.
      armResume()
      return
    }
    // A tap. It hands the camera straight back — but only its OWN: a hold
    // still running belongs to an earlier real gesture, and a stray tap
    // inside it must not cut that short.
    if (idleTimer) return
    userHasControl = false
    resume()
  }

  const onPointerDown = (event: PointerEventLike) => {
    lastPointerAt = Date.now()
    downAt.set(event.pointerId, { x: event.clientX, y: event.clientY })
  }

  const onPointerMove = (event: PointerEventLike) => {
    const from = downAt.get(event.pointerId)
    if (!from) return
    lastPointerAt = Date.now()
    // Movement inside a claimed gesture keeps the hold fresh, so a drag longer
    // than the hold is never resumed out from under the finger driving it.
    if (claimed) return armResume()
    if (!gestureActive) return
    if (Math.hypot(event.clientX - from.x, event.clientY - from.y) > CAMERA_DRAG_SLOP_PX) claim()
  }

  const onPointerUp = (event: PointerEventLike) => {
    lastPointerAt = Date.now()
    downAt.delete(event.pointerId)
  }

  // A wheel or trackpad zoom has no travel to measure — its camera move only
  // lands on the next update(), after OrbitControls has already dispatched
  // 'end' — so the wheel itself is the signal. Reading it here rather than
  // inferring "no pointer is down" at 'start' keeps the verdict independent of
  // event ordering between the two surfaces.
  const onWheel = () => claim()

  controls.addEventListener('start', onControlsStart)
  controls.addEventListener('end', onControlsEnd)

  // Where each listener goes matters. OrbitControls never takes pointer
  // capture, so once a finger moves off the canvas its pointermove/up land on
  // whatever is under it — an overlay chip, the roster rail — and travel read
  // from the CANVAS would stop, grading a real rotate as a tap. three-stdlib
  // binds its own move/up to `ownerDocument` for exactly this reason; match
  // it. pointerdown and wheel stay on the canvas: a gesture only counts as a
  // camera grab if it STARTED on the board. Capture phase throughout, so the
  // bookkeeping runs before OrbitControls dispatches 'start'/'end'.
  const pointerHost = controls.domElement
  const travelHost = pointerHost?.ownerDocument ?? pointerHost
  const POINTER_OPTIONS = { capture: true, passive: true }
  if (pointerHost && travelHost) {
    pointerHost.addEventListener('pointerdown', onPointerDown, POINTER_OPTIONS)
    pointerHost.addEventListener('wheel', onWheel, POINTER_OPTIONS)
    travelHost.addEventListener('pointermove', onPointerMove, POINTER_OPTIONS)
    travelHost.addEventListener('pointerup', onPointerUp, POINTER_OPTIONS)
    travelHost.addEventListener('pointercancel', onPointerUp, POINTER_OPTIONS)
  }

  const frameOn = (point: Vector3, frameOptions: FrameOptions = {}) => {
    lastPoint = new Vec3().copy(point)
    if (held()) {
      pendingFocus = { point: lastPoint, mode: 'frame', options: frameOptions }
      return
    }
    // The shot belongs to the player now — track, never re-frame. A commanding
    // beat is the exception: it is a scripted moment, not a follow-cam, and
    // silently degrading it to a translation is how the gate punch-in went
    // missing for every player who had touched the board.
    if (cameraTaken && !frameOptions.commanding) return follow(point)

    // This aim supersedes anything banked: a step held behind a sweep that
    // this call is about to kill (a gate's push-in over a walk's sweep) would
    // otherwise be replayed by THIS sweep's onComplete, sliding the camera off
    // the tile it just framed.
    pendingFocus = undefined

    const distance = (frameOptions.tiles ?? FRAME_TILES) * (options.spacing?.() ?? DEFAULT_SPACING)
    const seconds = (frameOptions.durationMs ?? WALK_FRAME_MS) / 1000
    const ease = frameOptions.ease ?? EASE.cross

    const direction = new Vec3().subVectors(camera.position, controls.target).normalize()
    // Keep a pleasant oblique angle even if the current one is shallow
    direction.y = Math.max(direction.y, 0.55)
    direction.normalize()

    const cameraDestination = new Vec3().copy(point).addScaledVector(direction, distance)

    if (prefersReducedMotion()) {
      controls.target.copy(point)
      camera.position.copy(cameraDestination)
      controls.update()
      return
    }

    killTweens()
    const targetTween = gsap.to(controls.target, {
      x: point.x,
      y: point.y,
      z: point.z,
      duration: seconds,
      ease,
    })
    const positionTween = gsap.to(camera.position, {
      x: cameraDestination.x,
      y: cameraDestination.y,
      z: cameraDestination.z,
      duration: seconds,
      ease,
      onComplete() {
        frameTweens.clear()
        // A step banked behind the sweep applies the instant it lands.
        if (!held() && pendingFocus) resume()
      },
      // A kill from outside this module would otherwise leave the set full and
      // every later follow banking against a sweep that no longer exists.
      onInterrupt() {
        frameTweens.clear()
      },
    })
    tweens.add(targetTween)
    tweens.add(positionTween)
    frameTweens.add(targetTween)
    frameTweens.add(positionTween)
  }

  /** What the tracker is aiming at right now; `undefined` disengages. */
  let trackSource: (() => Vector3 | undefined) | undefined
  /** The smoothed aim point. Re-primed from the live target after every
   *  framing sweep, so the tracker glides on from wherever the sweep left the
   *  rig (and absorbs a sweep's tile-centre → pawn-slot offset). */
  const trackAim = new Vec3()
  let trackPrimed = false
  const ticker = options.ticker ?? gsap.ticker
  let tickAttached = false

  // Deliberately does NOT stand down for held(): pan is off, so a rigid
  // translation cannot fight any gesture the player can express — and tracking
  // through a live drag is what makes orbiting a walking pawn possible.
  const onTick = (_time: number, deltaMs: number) => {
    const point = trackSource?.()
    if (!point) return
    if (framingInFlight()) {
      trackPrimed = false
      return
    }
    if (!trackPrimed) {
      trackAim.copy(controls.target)
      trackPrimed = true
    }
    if (prefersReducedMotion()) {
      trackAim.copy(point)
    } else {
      const dt = deltaMs / 1000
      trackAim.x = MathUtils.damp(trackAim.x, point.x, TRACK_DAMP_XZ, dt)
      trackAim.z = MathUtils.damp(trackAim.z, point.z, TRACK_DAMP_XZ, dt)
      trackAim.y = MathUtils.damp(trackAim.y, point.y, TRACK_DAMP_Y, dt)
    }
    // Translate camera and target together — the same offset-preserving
    // invariant follow() keeps, so a mid-walk zoom or drag survives.
    camera.position.x += trackAim.x - controls.target.x
    camera.position.y += trackAim.y - controls.target.y
    camera.position.z += trackAim.z - controls.target.z
    controls.target.copy(trackAim)
  }

  const track = (source?: () => Vector3 | undefined) => {
    trackSource = source
    trackPrimed = false
    if (source && !tickAttached) {
      ticker.add(onTick)
      tickAttached = true
    } else if (!source && tickAttached) {
      ticker.remove(onTick)
      tickAttached = false
    }
  }

  const follow = (point: Vector3) => {
    lastPoint = new Vec3().copy(point)
    // The tracker owns translation while engaged. Returning HERE (before the
    // banking below) keeps a stale one-shot aim from ever being replayed over
    // it — frameOn's cameraTaken degrade and resume()'s lastPoint fallback
    // both route through this and would otherwise yank the target to a tile
    // centre the pawn has left.
    if (trackSource) return
    if (held()) {
      pendingFocus = { point: lastPoint, mode: 'follow' }
      return
    }
    // A framing sweep introduces the walk its own first steps would otherwise
    // shoot down: bank the step and let the sweep finish.
    if (framingInFlight()) {
      pendingFocus = { point: lastPoint, mode: 'follow' }
      return
    }
    // Executing: this aim is the current one, so nothing banked survives it.
    pendingFocus = undefined

    if (prefersReducedMotion()) {
      // No tween to carry the offset across: snap both ends at once.
      const delta = new Vec3().subVectors(camera.position, controls.target)
      controls.target.copy(point)
      camera.position.copy(point).add(delta)
      controls.update()
      return
    }

    // The rig's own last target, so a frame can tell ITS translation apart from
    // the player's. Re-read every frame rather than captured once: a wheel-zoom
    // landing mid-step moves camera.position, and a fixed delta overwrote that
    // on the very next frame — the zoom sprang back and the pawn kept being
    // framed at the old distance.
    const carried = controls.target.clone()

    killTweens()
    tweens.add(
      // The step cadence, not a longer guess: a 600ms tween re-killed by the
      // next step every 400ms never completed, so the camera trailed the pawn
      // for the whole walk.
      gsap.to(controls.target, {
        x: point.x,
        y: point.y,
        z: point.z,
        duration: STEP_INTERVAL_MS / 1000,
        ease: 'power2.out',
        onUpdate() {
          // Translate the camera by however far the TARGET moved this frame,
          // preserving whatever offset the player currently holds.
          camera.position.x += controls.target.x - carried.x
          camera.position.y += controls.target.y - carried.y
          camera.position.z += controls.target.z - carried.z
          carried.copy(controls.target)
        },
      })
    )
  }

  return {
    frameOn,
    follow,
    track,
    takeOver() {
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = undefined
      userHasControl = false
      cameraTaken = false
      pendingFocus = undefined
    },
    dispose() {
      track(undefined)
      killTweens()
      if (idleTimer) clearTimeout(idleTimer)
      controls.removeEventListener('start', onControlsStart)
      controls.removeEventListener('end', onControlsEnd)
      if (!pointerHost || !travelHost) return
      pointerHost.removeEventListener('pointerdown', onPointerDown, POINTER_OPTIONS)
      pointerHost.removeEventListener('wheel', onWheel, POINTER_OPTIONS)
      travelHost.removeEventListener('pointermove', onPointerMove, POINTER_OPTIONS)
      travelHost.removeEventListener('pointerup', onPointerUp, POINTER_OPTIONS)
      travelHost.removeEventListener('pointercancel', onPointerUp, POINTER_OPTIONS)
    },
  }
}
