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
  <!-- Pan is OFF on purpose. OrbitControls pans by writing straight into
       `controls.target`, which is the ONE thing `follow` owns: a pan slid the
       orbit centre off the pawn, so a zoom (which dollies toward the target)
       converged on empty terrain, and the next walk step snapped the target
       back and undid the pan. Orbit + zoom only means the shot is always
       centred on the followed pawn, and zoom always pushes toward it. -->
  <OrbitControls
    ref="controlsRef"
    make-default
    enable-damping
    :enable-pan="false"
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
  HIGHLIGHT_RING_LIFT,
  PATH_MARKER_LIFT,
  TILE_RADIUS_RATIO,
} from '~~/lib/board3d/board-builder'
import { summitClimbAnchor } from '~~/lib/board3d/summit'
import { spawnCheerSprite } from '~~/lib/board3d/cheer-sprite'
import { BOARD_COLORS } from '~~/lib/board3d/colors'
import type { TileTransform } from '~~/lib/board3d/path'
import {
  ALERT_TILES,
  type BoardCamera,
  createBoardCamera,
  FRAME_TILES,
  type FrameOptions,
  USER_IDLE_RESUME_MS,
} from '~~/lib/board3d/use-board-camera'
import { createPawnMover, type PawnMover } from '~~/lib/board3d/use-pawn-movement'
import { EASE, prefersReducedMotion } from '~~/lib/motion'
import {
  ARRIVAL_RIPPLE_MS,
  GATE_PUNCH_MS,
  MOVE_INTERSTITIAL_TOTAL_MS,
  WALK_FRAME_MS,
  WALK_RESUME_FRAME_MS,
} from '~~/lib/round-beats'
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
  // False while the persistent stage is hidden: live movement holds (the
  // sync-on-show pass replays it) and idle tweens pause with the render loop.
  active: {
    type: Boolean,
    default: true,
  },
})

// Allocated per instance: the board camera mutates `camera.position` in place
// (see use-board-camera's frameOn), so this vector must not be shared across
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

const tileFor = (index: number): TileTransform | undefined => board.value?.transforms[index]

const gameStore = useGameStore()

// Whose pawn the auto-camera tracks: the spectate target when set (an explicit
// act, so it wins even while the own pawn walks), otherwise the own pawn.
const cameraTargetId = computed(() => gameStore.board.spectateTargetId ?? props.playerId)

// The booth (a latecomer watcher or a finisher in the spectate view) has no
// own pawn to release the camera to — the followed pawn IS home, so the
// auto-release below is skipped and a manual grab only holds the follow-cam
// off temporarily instead of unfollowing for good. The hold itself belongs to
// the rig (one mechanism, two lengths — see `resumeDelayMs`).
const boothMode = computed(() => gameStore.isSpectator || gameStore.spectating)

/**
 * A pawn blocked by an individual challenge sits at endTile - 1 in server
 * data (it must beat the challenge to pass). Visually that reads as "stuck
 * one tile short", so blocked pawns display ON the challenge tile — a
 * DELIBERATE display rule (Isaac's call, 2026-08-08): a failed gate clears
 * the move and the pawn visibly bounces back one; the won-gate half of the
 * unwinding is held by the mover's retreat guard. This is the only place
 * display and `currentPosition` may disagree.
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
      duration: tone === 'alert' ? ARRIVAL_RIPPLE_MS / 1000 : 1.1,
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

/**
 * The gate punch-in: a hard, short push onto the pawn that just slammed into a
 * challenge tile. `commanding` is what makes it a beat rather than a
 * suggestion — a routine frame is retired for good by the player's first drag,
 * which quietly deleted this moment for anyone who had ever touched the board.
 * The ease is an entrance curve, not a cross-fade: it attacks and settles.
 *
 * Aims at the PAWN, not the tile centre it stands on: a pawn sits a slot radius
 * off centre, and at this distance that offset both reads as bad framing and
 * drifts — the walk tracker is aimed at the same live object and stands down
 * only while a frame is in flight, so a tile-centre punch got dragged onto the
 * pawn the moment its sweep completed. Sharing `pawns` with the tracker is what
 * keeps the two agreeing by construction. The tile is the fallback for a pawn
 * that has not been built.
 *
 * Both gate beats (the block on arrival, and a failed gate's verdict) push in
 * identically, so the shot lives here once.
 */
const punchInOn = (playerId: string, tile: TileTransform) => {
  boardCamera?.frameOn(pawns.get(playerId)?.position ?? tile.position, {
    tiles: ALERT_TILES,
    durationMs: GATE_PUNCH_MS,
    ease: EASE.enter,
    commanding: true,
  })
}

/** One challenge-hit moment per blocked episode: coral ripple, knock, push-in. */
const challengeAlerted = new Set<string>()
const playChallengeHit = (playerId: string, tile: TileTransform) => {
  // A hidden stage must not CONSUME the moment: skip without latching, and
  // the show pass's beat sync plays it when there is someone to see it.
  if (!props.active) return
  if (challengeAlerted.has(playerId)) return
  challengeAlerted.add(playerId)

  // All three fire together — the punch is part of the impact, not a follow-up
  // to it. The arrival hold (BOARD_TO_CHALLENGE_HOLD_MS) is sized to cover the
  // whole flourish, so sequencing them would only push the ripple past it.
  triggerRipple(tile, 'alert')
  knockPawn(playerId)
  if (playerId === cameraTargetId.value) punchInOn(playerId, tile)
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
    const radius = build.spacing * TILE_RADIUS_RATIO
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

  const tile = tileFor(displayPositionFor(own))
  if (tile)
    highlightRing.position.set(
      tile.position.x,
      tile.position.y + HIGHLIGHT_RING_LIFT,
      tile.position.z
    )
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

  const radius = build.spacing * TILE_RADIUS_RATIO
  for (let index = walked + 1; index <= target; index++) {
    if (pathMarkers.has(index)) continue
    const tile = tileFor(index)
    if (!tile) continue

    const marker = acquirePathMarker(radius)
    marker.material.color.set(gates.has(index) ? BOARD_COLORS.hiorAnge : BOARD_COLORS.warmSand)
    marker.position.set(tile.position.x, tile.position.y + PATH_MARKER_LIFT, tile.position.z)
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

// --- Final-gauntlet climb: the finale massif makes progress physical -------
// Gauntlet progress rides the public snapshot (moves[0].challenge), so every
// client can stand a challenger's pawn on the ledge matching their cleared
// count. The mover never fights this: position only changes on entry (its
// own hop) and on knockout/victory, where the display position shifts and
// its tween takes over from wherever the pawn stands. Boards that dealt no
// massif (no open ground behind the final tile, or the seeded roll) keep the
// pawn at the arch — the checkered gate alone carries the finale there.
const gauntletFor = (player: Player) => {
  const challenge = player.moves[0]?.challenge
  return challenge?._type === 'final-challenge' ? challenge : undefined
}

const syncClimbs = () => {
  const build = board.value
  if (!build?.summit) return
  const finalIndex = props.game.tiles.length - 1

  for (const player of Object.values(props.game.players)) {
    const pawn = pawns.get(player.id)
    if (!pawn || displayPositionFor(player) !== finalIndex) continue
    const gauntlet = gauntletFor(player)
    const victor = player.phase === 'victory'
    if (!gauntlet && !victor) continue

    // World-space ledge anchors, precomputed by the build for this board's
    // difficulty — copied straight onto the pawn, no tile transform.
    const anchor = victor
      ? summitClimbAnchor(build.summit, 1, 1)
      : summitClimbAnchor(build.summit, gauntlet!.answeredCorrect, gauntlet!.totalCount)
    if (!anchor) continue

    if (prefersReducedMotion()) {
      pawn.position.copy(anchor)
    } else {
      gsap.to(pawn.position, {
        x: anchor.x,
        y: anchor.y,
        z: anchor.z,
        duration: 0.7,
        ease: 'power2.inOut',
        overwrite: 'auto',
      })
    }
  }
}

watch(
  () =>
    Object.values(props.game.players)
      .map(player => {
        const gauntlet = gauntletFor(player)
        if (player.phase === 'victory') return `${player.id}:peak`
        return gauntlet ? `${player.id}:${gauntlet.answeredCorrect}/${gauntlet.totalCount}` : ''
      })
      .filter(Boolean)
      .join('|'),
  syncClimbs
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

  // Remove pawns for departed players — the MOVER too: its occupancy state
  // is per-game now, and a kicked seat's ghost otherwise shrinks and orbits
  // every pawn that later shares its tile.
  for (const [playerId, pawn] of pawns) {
    if (liveIds.has(playerId)) continue
    build.group.remove(pawn)
    disposePawn(pawn)
    pawns.delete(playerId)
    mover.remove(playerId)
  }

  for (const player of players) {
    const existing = pawns.get(player.id)
    if (existing) continue

    const pawn = buildPawn(player.color, build.spacing * 0.85)
    pawns.set(player.id, pawn)
    build.group.add(pawn)
    // Straight to truth: the scene is persistent, so a NEW pawn has no
    // missed movement to replay — the sync-on-show pass owns catch-up.
    mover.place(player.id, displayPositionFor(player))
  }

  syncCrowns()
}

const rebuild = () => {
  mover?.dispose()
  removePawns()
  clearPathPreview()
  disposeHighlight()

  // Cached across mounts — the board reappears every round
  const build = getBoardBuild(props.game.id, props.game.tiles, props.game.difficulty)
  board.value = build

  mover = createPawnMover({
    pawnFor: playerId => pawns.get(playerId),
    tileFor,
    // A short backward display delta is the on-gate stance unwinding, and
    // only a LOSS may play it: the round's blocked record — stamped by the
    // failed gate AND the gauntlet knockout — is the license. A won gate's
    // short leap (a hint-drained pot can be zero) carries no record and
    // holds instead of hopping backward off a tile it just cleared.
    retreatAllowedFor: playerId => Boolean(latestRound(props.game)?.playerTurns[playerId]?.blocked),
    slotRadius: build.spacing * 0.19,
    hopHeight: build.spacing * 0.35,
    onLand(playerId, tile) {
      const player = props.game.players[playerId]
      if (player && isBlockedByChallenge(player)) {
        playChallengeHit(playerId, tile)
        return
      }

      triggerRipple(tile, 'success')
    },
  })

  syncPawns()
  syncPathPreview()
  syncHighlight()
  // After placement: a rebuild mid-gauntlet must put the climber back on
  // their ledge, not on the tile top
  syncClimbs()
}

// Fingerprint the tile types: with seeded gate rhythm, same-length boards
// differ — a count-based key would serve a stale build after regeneration
watch(() => boardBuildKey(props.game.id, props.game.tiles, props.game.difficulty), rebuild, {
  immediate: true,
})

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

// The scene's subject can change in place now (a director cut, a status-
// panel spectate): the highlight ring and path preview key off the OWN pawn
// and must re-aim, or they sit under the previous subject for the shot.
watch(
  () => props.playerId,
  () => {
    syncHighlight()
    syncPathPreview()
  }
)

// --- The camera's framing beat ---------------------------------------------
// The one shot that RE-FRAMES: `follow` only translates the rig, so without
// this nothing ever resets the distance and a walk plays out at whatever shot
// the camera has held since the game began (the persistent stage means that
// is one shot for the whole game).

/** Whether this camera has framed anything yet on this stage. */
let hasFramed = false
/** The announce this camera has already framed. */
let framedAnnounce: string | undefined

/**
 * Subject + walk generation + LEGS LEFT: stable across a walk's steps (a
 * moveset only changes at a gate boundary) and different for every announce,
 * so the sync can re-run on the show pass without replaying a beat and can
 * never re-fire mid-walk. `currentPosition` must stay OUT of it — a gauntlet
 * knockout descends with an empty moveset and would re-frame on every step.
 */
const announceTokenFor = (subject: Player | undefined) =>
  subject?.phase === 'moving'
    ? `${subject.id}:${subject.walkSeq ?? 0}:${subject.moves.length}`
    : undefined

const subjectTile = () => {
  const subject = props.game.players[cameraTargetId.value]
  return subject ? tileFor(displayPositionFor(subject)) : undefined
}

/**
 * The framing shot. Synchronous on purpose: latch and sweep in the same tick,
 * so a beat can never be marked played and then dropped. (A scheduled lead
 * did exactly that — a hide inside the delay skipped the sweep while the latch
 * stood, and the show pass then read the beat as already played.)
 */
const frameSubject = (options: FrameOptions) => {
  const tile = subjectTile()
  if (!boardCamera || !tile) return false

  hasFramed = true
  framedAnnounce = announceTokenFor(props.game.players[cameraTargetId.value]) ?? framedAnnounce
  boardCamera.frameOn(tile.position, options)
  return true
}

/**
 * A named sync, not just a watcher body, for the same reason as the stuck and
 * blocked beats: a hidden stage must not CONSUME the shot — it holds without
 * latching and the show pass re-runs this, so the sweep plays where it can be
 * seen. Lengths come from the server's announce leads (round-beats): a
 * turn-opening walk sweeps behind the "On the move!" beat, a between-gates
 * resume re-frames inside the short resume lead.
 */
const syncCameraFraming = () => {
  if (!props.active || !boardCamera) return false

  const subject = props.game.players[cameraTargetId.value]
  // First time the board is actually ON SCREEN: sweep off the entry overview.
  if (!hasFramed) return frameSubject({ tiles: FRAME_TILES, durationMs: WALK_FRAME_MS })

  const token = announceTokenFor(subject)
  if (!token || token === framedAnnounce) return false

  return frameSubject({
    tiles: FRAME_TILES,
    durationMs: subject?.walkIntro ? WALK_FRAME_MS : WALK_RESUME_FRAME_MS,
  })
}

watch(
  () => {
    const subject = props.game.players[cameraTargetId.value]
    return subject
      ? `${subject.id}:${subject.phase}:${subject.walkSeq ?? 0}:${subject.moves.length}`
      : ''
  },
  () => syncCameraFraming(),
  { immediate: true }
)

// Server-driven movement: one socket update per STEP_INTERVAL_MS step. String signature
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
    // Hidden stage: hold — snapshots keep landing, but the movement they
    // carry belongs to the sync-on-show pass, where it plays as a visible
    // catch-up instead of hopping behind a challenge view.
    if (!props.active) return
    const previous = new Map(positionSignatureEntries(previousSignature ?? ''))
    for (const [playerId, position] of positionSignatureEntries(signature)) {
      const before = previous.get(playerId)
      if (before === position) continue
      mover?.moveTo(playerId, position)
      if (playerId === props.playerId) syncHighlight()
    }
  }
)

// The show moment: replay whatever the hold above banked (win leaps, steps
// taken behind a view) — the mover fast-forwards true resets — and nudge the
// camera back onto its subject. gsap's global ticker keeps running while the
// render loop is parked, so idle loops (highlight pulse, stuck wobble) pause
// with the stage instead of burning frames nobody sees.
watch(
  () => props.active,
  active => {
    if (active) {
      for (const player of Object.values(props.game.players)) {
        mover?.moveTo(player.id, displayPositionFor(player))
      }
      syncHighlight()
      syncPathPreview()
      syncClimbs()
      // One-shot beats the hold skipped (a blocked opponent's knock, a
      // forfeit's ripple) play now, on screen, instead of never.
      syncStuckBeats()
      syncBlockedBeats()
      highlightTween?.play()
      stuckTweens.forEach(tween => tween.play())
      // A framing shot owed to a walk announced behind a challenge view plays
      // HERE, on screen; the tracker re-converges on the subject either way.
      syncCameraFraming()
    } else {
      highlightTween?.pause()
      stuckTweens.forEach(tween => tween.pause())
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
      const cleanup: () => void = spawnCheerSprite(pawn, cheer.emoji, build.spacing, slot, () => {
        cheersInFlight.set(targetId, Math.max(0, (cheersInFlight.get(targetId) ?? 1) - 1))
        // Finished sprites leave the teardown set — it otherwise grows one
        // retained closure per cheer for the whole session.
        cheerCleanups.delete(cleanup)
      })
      cheerCleanups.add(cleanup)
    }
  }
)

// Spectate lifecycle: fly to the chosen pawn on set, back to the own pawn on
// clear, and auto-release when the target finishes, disappears, or we unmount.
const SPECTATE_RELEASE_PHASES = ['movement-summary', 'victory']

watch(
  () => gameStore.board.spectateTargetId,
  targetId => {
    // A SET is an explicit act (a pin, a director cut) and outranks a grab —
    // it takes the camera back and reclaims automatic framing. A CLEAR must
    // not: a racer's drag clears the target from inside onUserGrab, which
    // re-enters this watcher, and taking over there would wrestle the camera
    // out of the hand still dragging it. That clear rides the rig's own hold
    // and lands as a re-aim when it lifts.
    if (targetId) boardCamera?.takeOver()

    // A cut can be set while the stage is hidden — the booth writes
    // stageActive itself (ViewSpectate) and only raises it when the WATCHED
    // seat is on the board, so a director cut to a seat mid-challenge lands
    // here with nothing on screen. (The roster rail can't: it renders only on
    // BOARD_PHASES.) Framing now would sweep off screen and consume the very
    // shot this beat exists to hold; retire the latch and let the show pass
    // frame the new subject when the board returns.
    if (!props.active) {
      framedAnnounce = undefined
      return
    }
    frameSubject({ tiles: FRAME_TILES, durationMs: WALK_FRAME_MS })
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

// Stuck-at-a-challenge wobble: a slow, repeating rock while blocked. A named
// sync (not just a watcher body) because the beat must only ever play ON
// SCREEN: while the stage is hidden the watcher holds without latching, and
// the show pass re-runs the sync so the moment isn't consumed invisibly.
const syncStuckBeats = () => {
  const blocked = new Set(
    Object.values(props.game.players)
      .filter(isBlockedByChallenge)
      .map(player => player.id)
  )

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
    }, MOVE_INTERSTITIAL_TOTAL_MS)
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
}
watch(
  () =>
    Object.values(props.game.players)
      .filter(isBlockedByChallenge)
      .map(player => player.id)
      .sort()
      .join('|'),
  () => {
    if (!props.active) return
    syncStuckBeats()
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
const syncBlockedBeats = () => {
  const round = latestRound(props.game)
  if (!round) return
  const roundKey = props.game.rounds.length - 1

  for (const player of Object.values(props.game.players)) {
    const blockedAt = round.playerTurns[player.id]?.blocked?.atTile
    if (blockedAt === undefined || player.phase !== 'movement-summary') continue
    const key = `${player.id}:${roundKey}`
    if (blockedBeatsPlayed.has(key) || !pawns.get(player.id)) continue

    const beatPlayerId = player.id
    schedule(() => {
      // Latch only when the beat actually PLAYS on an active stage — a hide
      // inside this delay must not consume it (the show pass re-runs the
      // sync); the has() re-check keeps overlapping syncs single-shot.
      if (!props.active || blockedBeatsPlayed.has(key)) return
      blockedBeatsPlayed.add(key)
      const gateTile = tileFor(blockedAt)
      if (!gateTile) return
      triggerRipple(gateTile, 'alert')
      knockPawn(beatPlayerId)
      if (beatPlayerId === cameraTargetId.value) punchInOn(beatPlayerId, gateTile)
    }, 700)
  }
}
watch(
  () =>
    Object.values(props.game.players)
      .map(player => `${player.id}:${player.phase}`)
      .join('|'),
  () => {
    if (!props.active) return
    syncBlockedBeats()
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
    spacing: () => board.value?.spacing ?? 8,
    // A booth grab is a look-around, so it holds the follow-cam off longer
    // (permanently unfollowing left the booth camera lost); a racer's is
    // shorter. One hold, two lengths — the rig owns both.
    resumeDelayMs: () => (boothMode.value ? GRAB_HOLD_MS : USER_IDLE_RESUME_MS),
    // A racer's grab means "I'll drive" — spectating shouldn't wrestle back.
    // Only a CONFIRMED drag reaches here, so a stray tap can no longer unpin
    // a rival the player chose to watch.
    onUserGrab: () => {
      if (!boothMode.value) gameStore.board.spectateTargetId = undefined
    },
  })

  // The walk-follow shot: glue the orbit centre to the followed pawn's LIVE
  // object, not its tile. Re-read per frame, so subject switches and rebuilds
  // need no re-wiring; a hidden stage yields undefined and the tick holds.
  boardCamera.track(() => (props.active ? pawns.get(cameraTargetId.value)?.position : undefined))

  // The rig can be built while the stage is still hidden (it is, every game —
  // the persistent stage mounts on idle behind round 1), which is precisely
  // how the entry sweep used to be consumed off screen. Frame through the
  // sync instead: it holds until the board is actually on screen.
  syncCameraFraming()
})

onUnmounted(() => {
  // NOT spectateTargetId: a context-loss epoch remount unmounts this scene
  // while the booth lives on — clearing the follow target here dropped the
  // HUD and silently reset a racer's spectate. Its owners are the release
  // watcher above, the booth, and BoardStage's teardown.
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
