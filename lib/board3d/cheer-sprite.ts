import { gsap } from 'gsap'
import { CanvasTexture, Sprite, SpriteMaterial } from 'three'
import type { Group } from 'three'
import { prefersReducedMotion } from '~~/lib/motion'
import type { CheerEmoji } from '~~/types/events.types'

// One texture per emoji for the app's lifetime — five tiny canvases, shared
// across sprites and never disposed (each sprite disposes only its material).
const textures = new Map<CheerEmoji, CanvasTexture>()

const textureFor = (emoji: CheerEmoji): CanvasTexture => {
  const cached = textures.get(emoji)
  if (cached) return cached

  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (context) {
    context.font = `${Math.round(size * 0.78)}px sans-serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(emoji, size / 2, size / 2 + size * 0.04)
  }

  const texture = new CanvasTexture(canvas)
  textures.set(emoji, texture)
  return texture
}

// Burst layout: centre first, then fan left/right, new row above every five.
const SLOT_COLUMNS = [0, -1, 1, -2, 2]

/**
 * Floats `emoji` up from the pawn's head. Parented to the pawn Group so it
 * rides along mid-hop and always faces the camera (sprites billboard for
 * free — no screen projection needed).
 *
 * `slot` is the count of cheers already in flight on this pawn — bursts fan
 * out into columns instead of overlapping. `onDone` fires exactly once when
 * the sprite is gone (naturally or via early teardown) so callers can free
 * the slot.
 *
 * Returns an idempotent cleanup for early teardown (scene unmount); it runs
 * itself when the float finishes. Required: disposePawn only traverses Mesh,
 * so an orphaned Sprite material would leak.
 */
export const spawnCheerSprite = (
  pawn: Group,
  emoji: CheerEmoji,
  spacing: number,
  slot = 0,
  onDone?: () => void
): (() => void) => {
  const sprite = new Sprite(
    // depthTest off + late renderOrder: the cheer reads like a notification,
    // never clipped by terrain or other pawns whatever the camera angle.
    new SpriteMaterial({
      map: textureFor(emoji),
      transparent: true,
      depthWrite: false,
      depthTest: false,
    })
  )
  sprite.renderOrder = 10
  const scale = spacing * 0.6
  const column = SLOT_COLUMNS[slot % SLOT_COLUMNS.length]
  const row = Math.floor(slot / SLOT_COLUMNS.length)
  const startY = spacing * (1.15 + row * 0.5)
  sprite.position.set(column * spacing * 0.3, startY, 0)

  const tweens: gsap.core.Tween[] = []
  let done = false
  const cleanup = () => {
    if (done) return
    done = true
    tweens.forEach(tween => tween.kill())
    pawn.remove(sprite)
    sprite.material.dispose()
    onDone?.()
  }

  pawn.add(sprite)

  if (prefersReducedMotion()) {
    sprite.scale.set(scale, scale, 1)
    tweens.push(
      gsap.to(sprite.material, {
        opacity: 0,
        duration: 1.6,
        delay: 0.9,
        ease: 'power1.in',
        onComplete: cleanup,
      })
    )
    return cleanup
  }

  // Enter: pop in with a tiny settle-straight wobble
  sprite.scale.set(scale * 0.01, scale * 0.01, 1)
  sprite.material.rotation = column === 0 ? 0.1 : column * 0.06
  tweens.push(
    gsap.to(sprite.scale, { x: scale, y: scale, duration: 0.35, ease: 'back.out(2.2)' }),
    gsap.to(sprite.material, { rotation: 0, duration: 0.5, ease: 'power2.out' }),
    // Drift up, leaning slightly outward so bursts bloom apart
    gsap.to(sprite.position, {
      y: startY + spacing * 0.95,
      x: sprite.position.x + column * spacing * 0.08,
      duration: 2.5,
      ease: 'power1.out',
    }),
    // Exit: shrink a touch while fading, so it dissolves rather than cuts
    gsap.to(sprite.scale, {
      x: scale * 0.75,
      y: scale * 0.75,
      duration: 0.8,
      delay: 1.7,
      ease: 'power1.in',
    }),
    gsap.to(sprite.material, {
      opacity: 0,
      duration: 0.8,
      delay: 1.7,
      ease: 'power1.in',
      onComplete: cleanup,
    })
  )
  return cleanup
}
