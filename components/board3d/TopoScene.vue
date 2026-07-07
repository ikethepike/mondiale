<template>
  <TresPerspectiveCamera ref="cameraRef" :position="[0, 105, 88]" :fov="42" :near="0.5" :far="600" />
  <!-- Terrain and tiles are unlit; only the toon-shaded pawns respond to these -->
  <TresAmbientLight :intensity="1.9" />
  <TresDirectionalLight :position="[60, 120, 80]" :intensity="1.6" />
  <OrbitControls
    ref="controlsRef"
    make-default
    enable-damping
    :damping-factor="0.08"
    :min-distance="16"
    :max-distance="170"
    :min-polar-angle="0.12"
    :max-polar-angle="1.32"
  />
  <primitive v-if="board" :object="board.group" />
</template>
<script lang="ts" setup>
import { OrbitControls } from '@tresjs/cientos'
import { gsap } from 'gsap'
import type { Group, PerspectiveCamera } from 'three'
import {
  type BoardBuild,
  buildPawn,
  disposePawn,
  getBoardBuild,
} from '~~/lib/board3d/board-builder'
import { BOARD_COLORS } from '~~/lib/board3d/colors'
import type { TileTransform } from '~~/lib/board3d/path'
import { type BoardCamera, createBoardCamera } from '~~/lib/board3d/use-board-camera'
import { createPawnMover, type PawnMover } from '~~/lib/board3d/use-pawn-movement'
import { prefersReducedMotion } from '~~/lib/motion'
import type { Game } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'

const props = defineProps({
  game: {
    type: Object as PropType<Game>,
    required: true,
  },
  playerId: {
    type: String,
    required: true,
  },
})

const emit = defineEmits<{ ready: [] }>()

const cameraRef = shallowRef()
const controlsRef = shallowRef()
const board = shallowRef<BoardBuild>()

const pawns = new Map<string, Group>()
const stuckTweens = new Map<string, gsap.core.Tween>()
let mover: PawnMover | undefined
let boardCamera: BoardCamera | undefined
let hasFlownIn = false

const tileFor = (index: number): TileTransform | undefined => board.value?.transforms[index]

/**
 * A pawn blocked by an individual challenge sits at endTile - 1 in server
 * data (it must beat the challenge to pass). Visually that reads as "stuck
 * one tile short", so we display blocked pawns ON the challenge tile; a
 * failed challenge clears the move and the pawn visibly bounces back.
 */
const isBlockedByChallenge = (player: Player) => {
  const move = player.moves[0]
  return Boolean(move?.challenge && move.endTile.position === player.currentPosition + 1)
}

const displayPositionFor = (player: Player) =>
  isBlockedByChallenge(player) ? player.moves[0].endTile.position : player.currentPosition

const triggerRipple = (tile: TileTransform, tone: 'success' | 'alert' = 'success') => {
  const material = board.value?.contourMaterial
  if (!material) return

  material.uniforms.uRippleColor.value.set(
    tone === 'alert' ? BOARD_COLORS.hiorAnge : BOARD_COLORS.softMint
  )
  material.uniforms.uRippleCenter.value.set(tile.position.x, tile.position.z)
  gsap.fromTo(material.uniforms.uRippleProgress,
    { value: 0 },
    {
      value: 1,
      duration: tone === 'alert' ? 1.4 : 1.1,
      ease: 'power1.out',
      onComplete() {
        material.uniforms.uRippleProgress.value = -1
      },
    }
  )
}

/** A pawn slamming into a challenge tile recoils — a hard, readable "blocked!". */
const knockPawn = (playerId: string) => {
  const pawn = pawns.get(playerId)
  if (!pawn || prefersReducedMotion()) return

  gsap.fromTo(
    pawn.rotation,
    { z: 0 },
    { z: -0.28, duration: 0.09, ease: 'power2.out', yoyo: true, repeat: 3, overwrite: 'auto' }
  )
  gsap.fromTo(
    pawn.scale,
    { y: pawn.scale.x * 0.7 },
    { y: pawn.scale.x, duration: 0.4, ease: 'elastic.out(1, 0.45)', overwrite: 'auto' }
  )
}

/** One challenge-hit moment per blocked episode: coral ripple, knock, push-in. */
const challengeAlerted = new Set<string>()
const playChallengeHit = (playerId: string, tile: TileTransform) => {
  if (challengeAlerted.has(playerId)) return
  challengeAlerted.add(playerId)

  triggerRipple(tile, 'alert')
  knockPawn(playerId)
  if (playerId === props.playerId) {
    boardCamera?.flyTo(tile.position, (board.value?.spacing ?? 8) * 3.2)
  }
}

const removePawns = () => {
  stuckTweens.forEach(tween => tween.kill())
  stuckTweens.clear()
  pawns.forEach(pawn => {
    board.value?.group.remove(pawn)
    disposePawn(pawn)
  })
  pawns.clear()
}

const syncPawns = () => {
  const build = board.value
  if (!build || !mover) return

  const players = Object.values(props.game.players)
  const liveIds = new Set(players.map(player => player.id))

  // Remove pawns for departed players
  for (const [playerId, pawn] of pawns) {
    if (liveIds.has(playerId)) continue
    build.group.remove(pawn)
    disposePawn(pawn)
    pawns.delete(playerId)
  }

  for (const player of players) {
    const existing = pawns.get(player.id)
    if (existing) continue

    const pawn = buildPawn(player.color, build.spacing * 0.85)
    pawns.set(player.id, pawn)
    build.group.add(pawn)
    // restore() replays any steps taken while the board was unmounted
    // (challenge-win leaps, walks begun before the scene finished loading)
    mover.restore(player.id, displayPositionFor(player))
  }
}

const rebuild = () => {
  mover?.dispose()
  removePawns()

  // Cached across mounts — the board reappears every round
  const build = getBoardBuild(props.game.id, props.game.tiles)
  board.value = build

  mover = createPawnMover({
    pawnFor: playerId => pawns.get(playerId),
    tileFor,
    memoryKey: props.game.id,
    slotRadius: build.spacing * 0.19,
    hopHeight: build.spacing * 0.35,
    onLand(playerId, tile) {
      const player = props.game.players[playerId]
      if (player && isBlockedByChallenge(player)) {
        playChallengeHit(playerId, tile)
        return
      }

      triggerRipple(tile, 'success')
      if (playerId === props.playerId) boardCamera?.follow(tile.position)
    },
  })

  syncPawns()
}

watch(() => [props.game.id, props.game.tiles.length], rebuild, { immediate: true })

// New players joining / colors changing
watch(
  () =>
    Object.values(props.game.players)
      .map(player => `${player.id}:${player.color}`)
      .join('|'),
  syncPawns
)

// Server-driven movement: one socket update per 500ms step
watch(
  () =>
    Object.fromEntries(
      Object.values(props.game.players).map(player => [player.id, displayPositionFor(player)])
    ),
  positions => {
    for (const [playerId, position] of Object.entries(positions)) {
      mover?.moveTo(playerId, position)
      if (playerId === props.playerId) {
        const tile = tileFor(position)
        if (tile) boardCamera?.follow(tile.position)
      }
    }
  }
)

// Stuck-at-a-challenge wobble: a slow, repeating rock while blocked
watch(
  () =>
    Object.values(props.game.players)
      .filter(isBlockedByChallenge)
      .map(player => player.id)
      .sort()
      .join('|'),
  blockedSignature => {
    const blocked = new Set(blockedSignature ? blockedSignature.split('|') : [])

    for (const [playerId, tween] of stuckTweens) {
      if (blocked.has(playerId)) continue
      tween.kill()
      stuckTweens.delete(playerId)
      challengeAlerted.delete(playerId)
      const pawn = pawns.get(playerId)
      if (pawn) gsap.to(pawn.rotation, { z: 0, duration: 0.25, ease: 'power2.out' })
    }

    // A pawn that STARTS its turn already blocked (no landing hop to fire
    // onLand) still deserves the challenge-hit moment. Only pawns settled on
    // the challenge tile qualify — walkers get theirs from onLand. Delayed a
    // beat so it plays after the movement interstitial clears.
    for (const playerId of blocked) {
      const player = props.game.players[playerId]
      const pawn = pawns.get(playerId)
      const tile = player ? tileFor(displayPositionFor(player)) : undefined
      if (!player || !pawn || !tile || challengeAlerted.has(playerId)) continue

      const spacing = board.value?.spacing ?? 8
      const settled = pawn.position.distanceTo(tile.position) < spacing * 0.6
      if (!settled) continue

      const settledPlayerId = playerId
      const settledTile = tile
      setTimeout(() => {
        const current = props.game.players[settledPlayerId]
        if (current && isBlockedByChallenge(current)) {
          playChallengeHit(settledPlayerId, settledTile)
        }
      }, 2900)
    }

    if (prefersReducedMotion()) return

    for (const playerId of blocked) {
      if (stuckTweens.has(playerId)) continue
      const pawn = pawns.get(playerId)
      if (!pawn) continue

      stuckTweens.set(
        playerId,
        gsap.fromTo(
          pawn.rotation,
          { z: -0.07 },
          // Delay lets the landing hop settle before the struggle starts
          { z: 0.07, duration: 0.9, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 0.6 }
        )
      )
    }
  },
  { immediate: true }
)

/** Template refs may hand back the three object directly or an { instance } wrapper. */
const resolveThree = <T,>(value: unknown): T | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const wrapper = value as { instance?: unknown; value?: unknown; update?: unknown; isCamera?: boolean }
  if (wrapper.isCamera || typeof wrapper.update === 'function') return value as T
  if (wrapper.instance) return resolveThree(wrapper.instance)
  if (wrapper.value) return resolveThree(wrapper.value)
  return value as T
}

watch([cameraRef, controlsRef, board], () => {
  if (boardCamera) return

  const camera = resolveThree<PerspectiveCamera>(cameraRef.value)
  const controls = resolveThree<Parameters<typeof createBoardCamera>[1]>(controlsRef.value)
  if (!camera?.isCamera || !controls || typeof controls.update !== 'function') return

  boardCamera = createBoardCamera(camera, controls)

  // Entry framing: hold the overview a beat, then settle on the player's pawn
  if (!hasFlownIn) {
    hasFlownIn = true
    const spacing = board.value?.spacing ?? 8
    setTimeout(() => {
      const own = props.game.players[props.playerId]
      const tile = own ? tileFor(displayPositionFor(own)) : undefined
      if (tile) boardCamera?.flyTo(tile.position, spacing * 5.5)
    }, 400)
  }
})

onMounted(() => emit('ready'))

onUnmounted(() => {
  mover?.dispose()
  boardCamera?.dispose()
  removePawns()
  // The board build itself stays alive in the module cache for the next round
})
</script>
