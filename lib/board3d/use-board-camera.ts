import { gsap } from 'gsap'
import type { PerspectiveCamera, Vector3 } from 'three'
import { Vector3 as Vec3 } from 'three'
import { EASE, prefersReducedMotion } from '~~/lib/motion'

/** The slice of three-stdlib OrbitControls this composable relies on. */
interface OrbitControlsLike {
  target: Vector3
  addEventListener(type: string, listener: () => void): void
  removeEventListener(type: string, listener: () => void): void
  update(): void
}

export interface BoardCamera {
  /** Entry framing: sweep from the overview down to a focus point. */
  flyTo(point: Vector3, distance?: number): void
  /** Track a moving point, preserving the user's chosen angle and zoom. */
  follow(point: Vector3): void
  dispose(): void
}

const USER_IDLE_RESUME_MS = 4000

/**
 * Auto-camera that never fights the player's fingers: any orbit gesture
 * kills the active tweens; following resumes after a few idle seconds.
 * `onUserGrab` fires on every gesture start — callers use it to drop modes
 * (like spectating) that a grab should cancel outright.
 */
export const createBoardCamera = (
  camera: PerspectiveCamera,
  controls: OrbitControlsLike,
  options: { onUserGrab?: () => void } = {}
): BoardCamera => {
  let userHasControl = false
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  const tweens = new Set<gsap.core.Tween>()

  const killTweens = () => {
    tweens.forEach(tween => tween.kill())
    tweens.clear()
  }

  const onUserStart = () => {
    userHasControl = true
    killTweens()
    if (idleTimer) clearTimeout(idleTimer)
    options.onUserGrab?.()
  }

  const onUserEnd = () => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      userHasControl = false
    }, USER_IDLE_RESUME_MS)
  }

  controls.addEventListener('start', onUserStart)
  controls.addEventListener('end', onUserEnd)

  const flyTo = (point: Vector3, distance = 42) => {
    if (userHasControl) return

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
    tweens.add(
      gsap.to(controls.target, {
        x: point.x,
        y: point.y,
        z: point.z,
        duration: 1.2,
        ease: EASE.cross,
      })
    )
    tweens.add(
      gsap.to(camera.position, {
        x: cameraDestination.x,
        y: cameraDestination.y,
        z: cameraDestination.z,
        duration: 1.2,
        ease: EASE.cross,
      })
    )
  }

  const follow = (point: Vector3) => {
    if (userHasControl) return

    const delta = new Vec3().subVectors(camera.position, controls.target)

    if (prefersReducedMotion()) {
      controls.target.copy(point)
      camera.position.copy(point).add(delta)
      controls.update()
      return
    }

    killTweens()
    tweens.add(
      gsap.to(controls.target, {
        x: point.x,
        y: point.y,
        z: point.z,
        duration: 0.6,
        ease: 'power2.out',
        onUpdate() {
          camera.position.copy(controls.target).add(delta)
        },
      })
    )
  }

  return {
    flyTo,
    follow,
    dispose() {
      killTweens()
      if (idleTimer) clearTimeout(idleTimer)
      controls.removeEventListener('start', onUserStart)
      controls.removeEventListener('end', onUserEnd)
    },
  }
}
