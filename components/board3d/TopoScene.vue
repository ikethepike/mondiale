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
  boardBuildKey,
  buildCrown,
  buildPawn,
  type CrownVariant,
  disposePawn,
  getBoardBuild,
} from '~~/lib/board3d/board-builder'
import { spawnCheerSprite } from '~~/lib/board3d/cheer-sprite'
import { BOARD_COLORS } from '~~/lib/board3d/colors'
import type { TileTransform } from '~~/lib/board3d/path'
import { type BoardCamera, createBoardCamera } from '~~/lib/board3d/use-board-camera'
import { createPawnMover, type PawnMover } from '~~/lib/board3d/use-pawn-movement'
import { prefersReducedMotion } from '~~/lib/motion'
import { GRAB_HOLD_MS } from '~~/lib/spectate'
import { compareStandings } from '~~/lib/player'
import { latestRound } from '~~/lib/rounds'
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

// Every deferred beat goes through here so unmount can cancel the lot —
// a bare setTimeout would fire against a torn-down scene.
const pendingTimers = new Set<ReturnType<typeof setTimeout>>()
const schedule = (callback: () => void, delay: number) => {
  const id = setTimeout(() => {
    pendingTimers.delete(id)
    callback()
  }, delay)
  pendingTimers.add(id)
}
let mover: PawnMover | undefined
let boardCamera: BoardCamera | undefined
let hasFlownIn = false

const tileFor = (index: number): TileTransform | undefined => board.value?.transforms[index]

const gameStore = useGameStore()

// Whose pawn the auto-camera tracks: the spectate target when set (an explicit
// act, so it wins even while the own pawn walks), otherwise the own pawn.
const cameraTargetId = computed(() => gameStore.board.spectateTargetId ?? props.playerId)

// The booth (a latecomer watcher or a finisher in the spectate view) has no
// own pawn to release the camera to — the followed pawn IS home, so the
// auto-release below is skipped and a manual grab only holds the follow-cam
// off temporarily instead of unfollowing for good.
const boothMode = computed(() => gameStore.isSpectator || gameStore.spectating)
let grabHeldUntil = 0
const cameraHeld = () => Date.now() < grabHeldUntil

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
// across mounts and must stay untouched. Meshes are pooled — a walk retires
// one ring per step, and create/dispose churn per hop adds up.
const pathMarkers = new Map<number, Mesh<RingGeometry, MeshBasicMaterial>>()
const markerPool: Mesh<RingGeometry, MeshBasicMaterial>[] = []
let markerGeometry: RingGeometry | undefined
let markerRadius = 0

const acquirePathMarker = (radius: number): Mesh<RingGeometry, MeshBasicMaterial> => {
  // The ring size only changes with a new build (spacing is per board)
  if (!markerGeometry || markerRadius !== radius) {
    markerGeometry?.dispose()
    markerGeometry = new RingGeometry(radius * 0.62, radius * 0.8, 24)
    markerRadius = radius
    markerPool.forEach(marker => (marker.geometry = markerGeometry!))
  }

  const marker =
    markerPool.pop() ??
    new Mesh(markerGeometry, new MeshBasicMaterial({ transparent: true, depthWrite: false }))
  gsap.killTweensOf(marker.material)
  marker.geometry = markerGeometry
  marker.material.opacity = 0.85
  marker.rotation.x = -Math.PI / 2
  return marker
}

const retirePathMarker = (index: number, fade: boolean) => {
  const marker = pathMarkers.get(index)
  if (!marker) return
  pathMarkers.delete(index)

  const recycle = () => {
    board.value?.group.remove(marker)
    markerPool.push(marker)
  }
  if (!fade || prefersReducedMotion()) return recycle()
  gsap.to(marker.material, { opacity: 0, duration: 0.4, ease: 'power1.out', onComplete: recycle })
}

const clearPathPreview = () => {
  for (const index of [...pathMarkers.keys()]) retirePathMarker(index, false)
}

const disposePathMarkers = () => {
  clearPathPreview()
  markerPool.forEach(marker => {
    gsap.killTweensOf(marker.material)
    marker.material.dispose()
  })
  markerPool.length = 0
  markerGeometry?.dispose()
  markerGeometry = undefined
}

// --- Current-tile highlight: a soft pulsing ring under the own pawn --------
// Overlay mesh for the same reason as the path preview: the cached build's
// instance colors must stay untouched.
let highlightRing: Mesh<RingGeometry, MeshBasicMaterial> | undefined
let highlightTween: gsap.core.Tween | undefined

const disposeHighlight = () => {
  highlightTween?.kill()
  highlightTween = undefined
  if (!highlightRing) return
  highlightRing.parent?.remove(highlightRing)
  highlightRing.geometry.dispose()
  highlightRing.material.dispose()
  highlightRing = undefined
}

const syncHighlight = () => {
  const build = board.value
  const own = props.game.players[props.playerId]
  if (!build || !own) return

  if (!highlightRing) {
    const radius = build.spacing * 0.42
    highlightRing = new Mesh(
      new RingGeometry(radius * 0.98, radius * 1.16, 32),
      new MeshBasicMaterial({
        color: BOARD_COLORS.softMint,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      })
    )
    highlightRing.rotation.x = -Math.PI / 2
    build.group.add(highlightRing)
    if (!prefersReducedMotion()) {
      highlightTween = gsap.to(highlightRing.scale, {
        x: 1.08,
        y: 1.08,
        z: 1.08,
        duration: 1.4,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
      })
    }
  }

  // 0.68 floats clear of the tile's top face (+0.64) and under the number
  // labels (+0.71) — coplanar overlays z-fight into flickering speckles
  const tile = tileFor(displayPositionFor(own))
  if (tile) highlightRing.position.set(tile.position.x, tile.position.y + 0.68, tile.position.z)
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

    const marker = acquirePathMarker(radius)
    marker.material.color.set(gates.has(index) ? BOARD_COLORS.hiorAnge : BOARD_COLORS.warmSand)
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

const crownVariantFor = (player: Player): CrownVariant | undefined => {
  if (player.phase !== 'victory') return undefined
  const champion = Object.values(props.game.players).sort(compareStandings)[0]
  return champion.id === player.id ? 'champion' : 'finisher'
}

// Victory crowns: gold for the champion, smaller silver for later finishers.
// A crown is a child of the pawn Group, so it rides along with every hop.
const syncCrowns = (animate = false) => {
  const build = board.value
  if (!build) return

  for (const player of Object.values(props.game.players)) {
    const pawn = pawns.get(player.id)
    if (!pawn) continue

    const variant = crownVariantFor(player)
    const current = pawn.getObjectByName('crown') as Group | undefined
    if (current?.userData.variant === variant) continue

    if (current) {
      pawn.remove(current)
      disposePawn(current)
    }
    if (!variant) continue

    const crown = buildCrown(build.spacing * 0.85, variant)
    pawn.add(crown)
    if (animate && !prefersReducedMotion()) {
      gsap.from(crown.scale, { x: 0, y: 0, z: 0, duration: 0.6, ease: 'back.out(2.2)' })
    }
  }
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
    // (challenge-win leaps, walks begun before the scene finished loading),
    // bounded by server truth so it can never re-walk settled ground
    mover.restore(player.id, displayPositionFor(player), { walkSeq: player.walkSeq ?? 0 })
  }

  syncCrowns()
}

const rebuild = () => {
  mover?.dispose()
  removePawns()
  clearPathPreview()
  disposeHighlight()

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
      if (playerId === cameraTargetId.value && !cameraHeld()) boardCamera?.follow(tile.position)
    },
  })

  syncPawns()
  syncPathPreview()
  syncHighlight()
}

// Fingerprint the tile types: with seeded gate rhythm, same-length boards
// differ — a count-based key would serve a stale build after regeneration
watch(() => boardBuildKey(props.game.id, props.game.tiles), rebuild, { immediate: true })

// New players joining / colors changing
watch(
  () =>
    Object.values(props.game.players)
      .map(player => `${player.id}:${player.color}`)
      .join('|'),
  syncPawns
)

// Crowns pop in the moment a player's phase flips to victory
watch(
  () =>
    Object.values(props.game.players)
      .map(player => `${player.id}:${player.phase}`)
      .join('|'),
  () => syncCrowns(true)
)

// Server-driven movement: one socket update per 500ms step. String signature
// (like the sibling watchers) so the callback runs only when a position
// actually changes — an object getter re-fires on every reactive touch of the
// game and each fire rebuilt the camera-follow tween.
const positionSignatureEntries = (signature: string) =>
  signature
    ? signature.split('|').map(entry => {
        const split = entry.lastIndexOf(':')
        return [entry.slice(0, split), Number(entry.slice(split + 1))] as const
      })
    : []

watch(
  () =>
    Object.values(props.game.players)
      .map(player => `${player.id}:${displayPositionFor(player)}`)
      .join('|'),
  (signature, previousSignature) => {
    const previous = new Map(positionSignatureEntries(previousSignature ?? ''))
    for (const [playerId, position] of positionSignatureEntries(signature)) {
      if (previous.get(playerId) === position) continue
      mover?.moveTo(playerId, position)
      if (playerId === cameraTargetId.value && !cameraHeld()) {
        const tile = tileFor(position)
        if (tile) boardCamera?.follow(tile.position)
      }
      if (playerId === props.playerId) syncHighlight()
    }
  }
)

// Emoji cheers: spawn a floating sprite over the target pawn for each new
// broadcast entry. Sprites self-clean; the sets exist for unmount teardown.
// Bursts fan out: the slot is the number of cheers currently in flight on
// that pawn, freed again when a sprite finishes.
const CHEER_MEMORY = 200
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
      // Bounded memory: evict oldest ids (Sets iterate in insertion order)
      for (const stale of seenCheers) {
        if (seenCheers.size <= CHEER_MEMORY) break
        seenCheers.delete(stale)
      }
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
    // An explicit follow change (pin, director cut) overrides a grab hold
    grabHeldUntil = 0
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
    } else if (state === 'done' && !boothMode.value) {
      // A racer's camera hands back to their own pawn once the show is over.
      // The booth never auto-releases: movement-summary is still the board
      // beat, and there is no own pawn to return to — releasing here aimed
      // the camera at a pawnless id (the between-walks jump cut).
      schedule(() => {
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
      schedule(() => {
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

// A FAILED gate settles the pawn at gate − 1 with nothing left to walk: no
// landing hop fires, `isBlockedByChallenge` is already false, and without a
// beat the forfeit reads as the blocker being ignored. The round record
// (`playerTurns[id].blocked`, stamped by the server on the failed submit)
// carries the fact — play the challenge-hit language at the gate once per
// player per round, delayed a breath so the remount's placement settles.
const blockedBeatsPlayed = new Set<string>()
watch(
  () =>
    Object.values(props.game.players)
      .map(player => `${player.id}:${player.phase}`)
      .join('|'),
  () => {
    const round = latestRound(props.game)
    if (!round) return
    const roundKey = props.game.rounds.length - 1

    for (const player of Object.values(props.game.players)) {
      const blockedAt = round.playerTurns[player.id]?.blocked?.atTile
      if (blockedAt === undefined || player.phase !== 'movement-summary') continue
      const key = `${player.id}:${roundKey}`
      if (blockedBeatsPlayed.has(key) || !pawns.get(player.id)) continue
      blockedBeatsPlayed.add(key)

      const beatPlayerId = player.id
      schedule(() => {
        const gateTile = tileFor(blockedAt)
        if (!gateTile) return
        triggerRipple(gateTile, 'alert')
        knockPawn(beatPlayerId)
        if (beatPlayerId === cameraTargetId.value) {
          boardCamera?.flyTo(gateTile.position, (board.value?.spacing ?? 8) * 3.2)
        }
      }, 700)
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
    // A racer's grab means "I'll drive" — spectating shouldn't wrestle back.
    // A booth grab is a look-around: hold the follow-cam off briefly, then
    // resume following (permanently unfollowing left the booth camera lost).
    onUserGrab: () => {
      if (boothMode.value) {
        grabHeldUntil = Date.now() + GRAB_HOLD_MS
        return
      }
      gameStore.board.spectateTargetId = undefined
    },
  })

  // Entry framing: hold the overview a beat, then settle on the tracked pawn
  // (a spectate target chosen before the camera existed is honoured here)
  if (!hasFlownIn) {
    hasFlownIn = true
    const spacing = board.value?.spacing ?? 8
    schedule(() => {
      const focus = props.game.players[cameraTargetId.value]
      const tile = focus ? tileFor(displayPositionFor(focus)) : undefined
      if (tile) boardCamera?.flyTo(tile.position, spacing * 5.5)
    }, 400)
  }
})

onMounted(() => emit('ready'))

onUnmounted(() => {
  gameStore.board.spectateTargetId = undefined
  pendingTimers.forEach(id => clearTimeout(id))
  pendingTimers.clear()
  mover?.dispose()
  boardCamera?.dispose()
  disposePathMarkers()
  disposeHighlight()
  // Cheer sprites before pawn disposal — disposePawn won't reach their materials
  cheerCleanups.forEach(cleanup => cleanup())
  cheerCleanups.clear()
  removePawns()
  // The board build itself stays alive in the module cache for the next round
})
</script>
