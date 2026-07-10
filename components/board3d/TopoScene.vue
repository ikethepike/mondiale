<template>
  <TresPerspectiveCamera
    ref="cameraRef"
    :position="cameraPosition"
    :fov="42"
    :near="0.5"
    :far="600"
  />
  <!-- Terrain and tiles are unlit; only the toon-shaded pawns respond to these -->
  <TresAmbientLight :intensity="1.9" />
  <TresDirectionalLight :position="LIGHT_POSITION" :intensity="1.6" />
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
import { Mesh, MeshBasicMaterial, RingGeometry, Vector3 } from 'three'
import type { Group, PerspectiveCamera } from 'three'
import {
  type BoardBuild,
  buildPawn,
  disposePawn,
  getBoardBuild,
} from '~~/lib/board3d/board-builder'
import { spawnCheerSprite } from '~~/lib/board3d/cheer-sprite'
import { BOARD_COLORS } from '~~/lib/board3d/colors'
import type { TileTransform } from '~~/lib/board3d/path'
import { type BoardCamera, createBoardCamera } from '~~/lib/board3d/use-board-camera'
import { createPawnMover, type PawnMover } from '~~/lib/board3d/use-pawn-movement'
import { prefersReducedMotion } from '~~/lib/motion'
import { useGameStore } from '~~/store/game.store'
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

// Allocated per instance: the board camera mutates `camera.position` in place
// (see use-board-camera's flyTo), so this vector must not be shared across
// mounts or the starting framing would drift.
const cameraPosition = shallowRef(new Vector3(0, 105, 88))
// Safe to share — the directional light is never animated.
const LIGHT_POSITION = new Vector3(60, 120, 80)

const cameraRef = shallowRef()
const controlsRef = shallowRef()
const board = shallowRef<BoardBuild>()

const pawns = new Map<string, Group>()
const stuckTweens = new Map<string, gsap.core.Tween>()
let mover: PawnMover | undefined
let boardCamera: BoardCamera | undefined
let hasFlownIn = false

const tileFor = (index: number): TileTransform | undefined => board.value?.transforms[index]

const gameStore = useGameStore()

// Whose pawn the auto-camera tracks: the spectate target when set (an explicit
// act, so it wins even while the own pawn walks), otherwise the own pawn.
const cameraTargetId = computed(() => gameStore.board.spectateTargetId ?? props.playerId)

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
  gsap.fromTo(
    material.uniforms.uRippleProgress,
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
  if (playerId === cameraTargetId.value) {
    boardCamera?.flyTo(tile.position, (board.value?.spacing ?? 8) * 3.2)
  }
}

// --- Path preview: rings over the tiles the local pawn is about to walk ----
// Overlaid meshes rather than instance-color edits: the board build is cached
// across mounts and must stay untouched.
const pathMarkers = new Map<number, Mesh<RingGeometry, MeshBasicMaterial>>()

const retirePathMarker = (index: number, fade: boolean) => {
  const marker = pathMarkers.get(index)
  if (!marker) return
  pathMarkers.delete(index)

  const remove = () => {
    board.value?.group.remove(marker)
    marker.geometry.dispose()
    marker.material.dispose()
  }
  if (!fade || prefersReducedMotion()) return remove()
  gsap.to(marker.material, { opacity: 0, duration: 0.4, ease: 'power1.out', onComplete: remove })
}

const clearPathPreview = () => {
  for (const index of [...pathMarkers.keys()]) retirePathMarker(index, false)
}

const syncPathPreview = () => {
  const build = board.value
  const own = props.game.players[props.playerId]
  if (!build || !own) return clearPathPreview()

  const target = own.moves[own.moves.length - 1]?.endTile.position
  if (target === undefined) return clearPathPreview()

  const walked = displayPositionFor(own)
  const gates = new Set(own.moves.filter(move => move.challenge).map(move => move.endTile.position))

  for (const index of [...pathMarkers.keys()]) {
    if (index <= walked || index > target) retirePathMarker(index, true)
  }

  const radius = build.spacing * 0.42
  for (let index = walked + 1; index <= target; index++) {
    if (pathMarkers.has(index)) continue
    const tile = tileFor(index)
    if (!tile) continue

    const marker = new Mesh(
      new RingGeometry(radius * 0.62, radius * 0.8, 24),
      new MeshBasicMaterial({
        color: gates.has(index) ? BOARD_COLORS.hiorAnge : BOARD_COLORS.warmSand,
        transparent: true,
        opacity: 0.85,
      })
    )
    marker.rotation.x = -Math.PI / 2
    marker.position.set(tile.position.x, tile.position.y + 0.75, tile.position.z)
    pathMarkers.set(index, marker)
    build.group.add(marker)
  }
}

watch(
  () => {
    const own = props.game.players[props.playerId]
    if (!own) return ''
    const moves = own.moves
      .map(move => `${move.endTile.position}${move.challenge ? '!' : ''}`)
      .join(',')
    return `${own.currentPosition}|${moves}`
  },
  () => syncPathPreview()
)

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
  clearPathPreview()

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
      if (playerId === cameraTargetId.value) boardCamera?.follow(tile.position)
    },
  })

  syncPawns()
  syncPathPreview()
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
      if (playerId === cameraTargetId.value) {
        const tile = tileFor(position)
        if (tile) boardCamera?.follow(tile.position)
      }
    }
  }
)

// Emoji cheers: spawn a floating sprite over the target pawn for each new
// broadcast entry. Sprites self-clean; the sets exist for unmount teardown.
// Bursts fan out: the slot is the number of cheers currently in flight on
// that pawn, freed again when a sprite finishes.
const seenCheers = new Set<string>()
const cheerCleanups = new Set<() => void>()
const cheersInFlight = new Map<string, number>()

watch(
  () => gameStore.board.cheers,
  cheers => {
    const build = board.value
    if (!build) return

    for (const cheer of cheers) {
      if (seenCheers.has(cheer.entryId)) continue
      seenCheers.add(cheer.entryId)
      // Skip stale entries replayed into a freshly mounted scene
      if (cheer.at < Date.now() - 3000) continue

      const pawn = pawns.get(cheer.targetPlayerId)
      if (!pawn) continue

      const targetId = cheer.targetPlayerId
      const slot = cheersInFlight.get(targetId) ?? 0
      cheersInFlight.set(targetId, slot + 1)
      cheerCleanups.add(
        spawnCheerSprite(pawn, cheer.emoji, build.spacing, slot, () => {
          cheersInFlight.set(targetId, Math.max(0, (cheersInFlight.get(targetId) ?? 1) - 1))
        })
      )
    }
  }
)

// Spectate lifecycle: fly to the chosen pawn on set, back to the own pawn on
// clear, and auto-release when the target finishes, disappears, or we unmount.
const SPECTATE_RELEASE_PHASES = ['movement-summary', 'victory']

watch(
  () => gameStore.board.spectateTargetId,
  () => {
    const focus = props.game.players[cameraTargetId.value]
    const tile = focus ? tileFor(displayPositionFor(focus)) : undefined
    if (tile) boardCamera?.flyTo(tile.position, (board.value?.spacing ?? 8) * 5.5)
  }
)

watch(
  () => {
    const targetId = gameStore.board.spectateTargetId
    if (!targetId) return ''
    const target = props.game.players[targetId]
    if (!target) return 'gone'
    return SPECTATE_RELEASE_PHASES.includes(target.phase) ? 'done' : 'active'
  },
  state => {
    if (state === 'gone') {
      gameStore.board.spectateTargetId = undefined
    } else if (state === 'done') {
      // Let the final follow land before handing the camera back
      setTimeout(() => {
        const targetId = gameStore.board.spectateTargetId
        const phase = targetId ? props.game.players[targetId]?.phase : undefined
        if (phase && SPECTATE_RELEASE_PHASES.includes(phase)) {
          gameStore.board.spectateTargetId = undefined
        }
      }, 1000)
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
  const wrapper = value as {
    instance?: unknown
    value?: unknown
    update?: unknown
    isCamera?: boolean
  }
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

  boardCamera = createBoardCamera(camera, controls, {
    // A grab means "I'll drive" — spectating shouldn't wrestle back after idle
    onUserGrab: () => {
      gameStore.board.spectateTargetId = undefined
    },
  })

  // Entry framing: hold the overview a beat, then settle on the tracked pawn
  // (a spectate target chosen before the camera existed is honoured here)
  if (!hasFlownIn) {
    hasFlownIn = true
    const spacing = board.value?.spacing ?? 8
    setTimeout(() => {
      const focus = props.game.players[cameraTargetId.value]
      const tile = focus ? tileFor(displayPositionFor(focus)) : undefined
      if (tile) boardCamera?.flyTo(tile.position, spacing * 5.5)
    }, 400)
  }
})

onMounted(() => emit('ready'))

onUnmounted(() => {
  gameStore.board.spectateTargetId = undefined
  mover?.dispose()
  boardCamera?.dispose()
  clearPathPreview()
  // Cheer sprites before pawn disposal — disposePawn won't reach their materials
  cheerCleanups.forEach(cleanup => cleanup())
  cheerCleanups.clear()
  removePawns()
  // The board build itself stays alive in the module cache for the next round
})
</script>
