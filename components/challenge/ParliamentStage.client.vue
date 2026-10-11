<template>
  <canvas ref="canvas" class="parliament-stage" aria-hidden="true" />
</template>

<script setup lang="ts">
import {
  AmbientLight,
  BackSide,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
} from 'three'
import { BOARD_COLORS } from '~~/lib/board3d/colors'
import { outlineOf } from '~~/lib/board3d/ink-outline'
import { seatDots } from '~~/lib/hemicycle'
import { prefersLightMotion, prefersReducedMotion } from '~~/lib/motion'
import {
  buildParliament,
  seatPositions,
  type PartGroup,
  type PartMotion,
} from '~~/lib/parliament3d/building'
import {
  PARLIAMENT,
  PARLIAMENT_POSES,
  SEAT_TONES,
  WALL_SECTION,
  approach,
  bandShift,
  chamberTones,
  fitDistance,
  orbitPosition,
  type ParliamentPhase,
  type SeatGroup,
} from '~~/lib/parliament3d/scene'

/** The Government round's 3D parliament: it builds itself, comes apart to show its chamber, and paints it as the round moves. */
const props = withDefaults(
  defineProps<{
    phase: ParliamentPhase
    totalSeats: number
    groups: readonly SeatGroup[]
    flagColor?: string
    /** The stretch of the canvas (CSS px from its top) the building is framed in. */
    band?: { top: number; bottom: number }
    /** Changes whenever a beat's verdict lands — the camera nods. */
    verdictKey?: string
  }>(),
  { flagColor: BOARD_COLORS.darkBlue, band: undefined, verdictKey: undefined }
)
const emit = defineEmits<{ failed: [] }>()

const FOV = 32
const OUTLINE_WIDTH = 0.032
const BUILD_MS = 2600
const AMBIENT_FPS = 30
const RATES = { camera: 1.9, roof: 1.1, roofGone: 1.6, facade: 1.3, walls: 1.6, seats: 1.3 }
/** After a phase change each channel waits its turn, so the building comes apart in order. */
const LEADS_MS = { roof: 0, camera: 140, facade: 260, walls: 520, roofGone: 900, seats: 1000 }
/** The camera pulls back, then dives in, on every phase change. */
const SWOOP_MS = 1700
const SWOOP_DEPTH = 0.18
const SEAT_SWEEP_MS = 700
const SEAT_COLOR_RATE = 7
const SEAT_HOP_MS = 420
const SEAT_HOP = 0.11
/** A part spends this share of its channel moving; the rest is its stagger. */
const MOTION_SPAN = 0.6

const canvas = ref<HTMLCanvasElement>()

let renderer: WebGLRenderer | undefined
let scene: Scene | undefined
let camera: PerspectiveCamera | undefined
let resizeObserver: ResizeObserver | undefined
let frame = 0
const disposables: { dispose: () => void }[] = []

interface AnimatedPart {
  mesh: Mesh
  anchor: Vector3
  order: number
  motion?: PartMotion
  materials: (MeshToonMaterial | MeshBasicMaterial)[]
}
const animated: AnimatedPart[] = []
const partGroups: Partial<Record<PartGroup, Group>> = {}
let flag: AnimatedPart | undefined
let flagMaterial: MeshToonMaterial | undefined
let flagRest: Float32Array | undefined

let seatMesh: InstancedMesh | undefined
let seatOutline: InstancedMesh | undefined
let seatHome: [number, number, number][] = []
let seatColor = new Float32Array()
let seatTarget = new Float32Array()
let seatChangeAt = new Float64Array()

const pose = PARLIAMENT_POSES[props.phase]
/** A stage that opens on the briefing raises the building; one joined mid-round finds it standing. */
let intro = props.phase === 'briefing'
const current = {
  build: intro ? 0 : 1,
  roof: pose.roof,
  roofGone: pose.roofGone,
  facade: pose.facade,
  walls: pose.walls,
  seats: pose.seats,
  azimuth: pose.azimuth + (intro ? 0.5 : 0),
  elevation: pose.elevation + (intro ? 0.12 : 0),
  fit: pose.fit * (intro ? 1.25 : 1),
  tx: pose.target[0],
  ty: pose.target[1],
  tz: pose.target[2],
  sway: pose.drift > 0 ? 1 : 0,
  shift: 0,
  share: 1,
}
const startsAt = { roof: 0, roofGone: 0, camera: 0, facade: 0, walls: 0, seats: 0 }
let swoopStart = -Infinity
let introStart = 0
let elapsed = 0
let lastFrame = 0
let lastRender = 0
const flagHex = new Color(props.flagColor)
const flagGoal = new Color()

const reduced = () => prefersReducedMotion()

const sharedToon = new Map<string, MeshToonMaterial>()
const toonFor = (color: string, own: boolean) => {
  if (own) {
    const material = new MeshToonMaterial({ color, transparent: true })
    disposables.push(material)
    return material
  }
  let material = sharedToon.get(color)
  if (!material) {
    material = new MeshToonMaterial({ color })
    sharedToon.set(color, material)
    disposables.push(material)
  }
  return material
}
/** Hulls are pushed back in depth so a hull always loses a tie with the surface it outlines. */
const inkOptions = {
  color: BOARD_COLORS.ink,
  side: BackSide,
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 2,
}
const inkMaterial = new MeshBasicMaterial(inkOptions)
disposables.push(inkMaterial)

const buildScene = () => {
  if (!scene) return
  const model = buildParliament()
  const groupNames: PartGroup[] = ['plinth', 'chamber', 'spine', 'hall', 'facade', 'roof']
  for (const name of groupNames) {
    const group = new Group()
    partGroups[name] = group
    scene.add(group)
  }
  partGroups.hall!.position.y = PARLIAMENT.plinth.height

  for (const part of model.parts) {
    const geometry = part.geometry
    geometry.computeBoundingBox()
    const bounds = geometry.boundingBox!
    const anchor = new Vector3(
      (bounds.min.x + bounds.max.x) / 2,
      bounds.min.y,
      (bounds.min.z + bounds.max.z) / 2
    )
    geometry.translate(-anchor.x, -anchor.y, -anchor.z)
    if (part.group === 'hall') anchor.y -= PARLIAMENT.plinth.height

    const own = part.group === 'roof' || !!part.motion?.fade
    const body = toonFor(part.color, own)
    if (part.doubleSided) body.side = DoubleSide
    const materials: AnimatedPart['materials'] = own ? [body] : []
    const mesh = new Mesh(geometry, body)
    if (part.outline !== false) {
      const inkGeometry = outlineOf(geometry, OUTLINE_WIDTH, true)
      const ink = own ? new MeshBasicMaterial({ ...inkOptions, transparent: true }) : inkMaterial
      if (own) {
        materials.push(ink)
        disposables.push(ink)
      }
      mesh.add(new Mesh(inkGeometry, ink))
      disposables.push(inkGeometry)
    }
    disposables.push(geometry)
    mesh.position.copy(anchor)
    partGroups[part.group]!.add(mesh)
    animated.push({ mesh, anchor, order: part.order, motion: part.motion, materials })
  }

  const flagGeometry = new PlaneGeometry(0.62, 0.38, 10, 1)
  flagGeometry.translate(0.31, -0.19, 0)
  flagRest = Float32Array.from(flagGeometry.attributes.position!.array as Float32Array)
  flagMaterial = new MeshToonMaterial({ color: flagHex, side: DoubleSide, transparent: true })
  const flagMesh = new Mesh(flagGeometry, flagMaterial)
  const flagAnchor = new Vector3(...model.flagAnchor)
  flagMesh.position.copy(flagAnchor)
  partGroups.roof!.add(flagMesh)
  flag = {
    mesh: flagMesh,
    anchor: flagAnchor,
    order: 0.98,
    motion: model.flagMotion,
    materials: [flagMaterial],
  }
  animated.push(flag)
  disposables.push(flagGeometry, flagMaterial, model.seatGeometry)

  buildSeats(model.seatGeometry)
}

let seatGeometryRef: BufferGeometry | undefined
let seatInkGeometry: BufferGeometry | undefined
const seatMaterial = new MeshToonMaterial({ color: '#ffffff' })
disposables.push(seatMaterial)

const buildSeats = (geometry: BufferGeometry) => {
  if (!scene) return
  seatGeometryRef = geometry
  const dots = seatDots(props.totalSeats)
  seatHome = seatPositions(dots)
  if (seatMesh) {
    scene.remove(seatMesh, seatOutline!)
    seatMesh.dispose()
    seatOutline?.dispose()
  }
  seatInkGeometry ??= outlineOf(geometry, OUTLINE_WIDTH * 0.6, true)
  seatMesh = new InstancedMesh(geometry, seatMaterial, Math.max(1, dots))
  seatOutline = new InstancedMesh(seatInkGeometry, inkMaterial, Math.max(1, dots))
  seatMesh.count = dots
  seatOutline.count = dots
  seatColor = new Float32Array(dots * 3)
  seatTarget = new Float32Array(dots * 3)
  seatChangeAt = new Float64Array(dots).fill(-Infinity)
  seatMesh.instanceColor = new InstancedBufferAttribute(seatColor, 3)
  scene.add(seatMesh, seatOutline)
  paintSeats(true)
}

const scratchColor = new Color()
const paintSeats = (snap: boolean) => {
  const dots = seatHome.length
  const tones = chamberTones(dots, props.groups)
  const now = performance.now()
  for (let index = 0; index < dots; index++) {
    scratchColor.set(SEAT_TONES[tones[index] ?? 'ghost'])
    const offset = index * 3
    const changed =
      seatTarget[offset] !== scratchColor.r ||
      seatTarget[offset + 1] !== scratchColor.g ||
      seatTarget[offset + 2] !== scratchColor.b
    seatTarget[offset] = scratchColor.r
    seatTarget[offset + 1] = scratchColor.g
    seatTarget[offset + 2] = scratchColor.b
    if (snap) {
      seatColor[offset] = scratchColor.r
      seatColor[offset + 1] = scratchColor.g
      seatColor[offset + 2] = scratchColor.b
    } else if (changed) {
      seatChangeAt[index] = now + (index / Math.max(1, dots)) * SEAT_SWEEP_MS
    }
  }
  if (seatMesh?.instanceColor) seatMesh.instanceColor.needsUpdate = true
}

const smooth = (value: number) => value * value * (3 - 2 * value)
const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const overshoot = (value: number) => {
  const pull = 1.70158
  const shifted = value - 1
  return 1 + (pull + 1) * shifted ** 3 + pull * shifted ** 2
}

const placeParts = () => {
  const roofOpacity = 1 - smooth(clamp01(current.roofGone))
  for (const { mesh, anchor, order, motion, materials } of animated) {
    const grown = clamp01((current.build - order * 0.72) / 0.28)
    const rise = grown >= 1 ? 1 : overshoot(grown)
    mesh.scale.set(0.9 + grown * 0.1, Math.max(0.0001, rise), 0.9 + grown * 0.1)

    let opacity = 1
    let gone = false
    if (motion) {
      const channel = motion.channel === 'roof' ? current.roof : current.facade
      const local = smooth(clamp01((channel - motion.delay) / MOTION_SPAN))
      mesh.position.set(
        anchor.x + motion.offset[0] * local,
        anchor.y + motion.offset[1] * local,
        anchor.z + motion.offset[2] * local
      )
      const spin = motion.spin ?? [0, 0, 0]
      mesh.rotation.set(spin[0] * local, spin[1] * local, spin[2] * local)
      if (motion.channel === 'roof') opacity = roofOpacity
      else if (motion.fade) opacity = 1 - smooth(clamp01((local - 0.25) / 0.75))
      else gone = local > 0.985
    }
    for (const material of materials) material.opacity = opacity
    mesh.visible = grown > 0.001 && opacity > 0.01 && !gone
  }

  partGroups.hall!.scale.y = 1 - (1 - WALL_SECTION) * smooth(clamp01(current.walls))

  const spine = partGroups.spine!
  spine.scale.z = Math.max(0.0001, smooth(clamp01((current.seats - 0.4) / 0.6)))
  spine.position.z = PARLIAMENT.chamber.center[2] * (1 - spine.scale.z)
}

const seatDummy = new Object3D()
const placeSeats = (now: number, dt: number) => {
  if (!seatMesh || !seatOutline) return false
  const dots = seatHome.length
  let moving = false
  const still = reduced()
  const colorStep = still ? 1 : approach(dt, SEAT_COLOR_RATE)
  for (let index = 0; index < dots; index++) {
    const [x, y, z] = seatHome[index]!
    const delay = (index / Math.max(1, dots)) * 0.45
    const rise = smooth(clamp01((current.seats - delay) / 0.4))
    const since = now - seatChangeAt[index]!
    const hop =
      !still && since >= 0 && since < SEAT_HOP_MS
        ? Math.sin((since / SEAT_HOP_MS) * Math.PI) * SEAT_HOP
        : 0
    if (hop) moving = true
    seatDummy.position.set(x, y - (1 - rise) * 0.3 + hop, z)
    seatDummy.scale.setScalar(Math.max(0.0001, rise))
    seatDummy.updateMatrix()
    seatMesh.setMatrixAt(index, seatDummy.matrix)
    seatOutline.setMatrixAt(index, seatDummy.matrix)

    if (since < 0) {
      moving = true
      continue
    }
    const offset = index * 3
    for (let channel = 0; channel < 3; channel++) {
      const gap = seatTarget[offset + channel]! - seatColor[offset + channel]!
      if (Math.abs(gap) > 0.002) {
        seatColor[offset + channel] = seatColor[offset + channel]! + gap * colorStep
        moving = true
      } else {
        seatColor[offset + channel] = seatTarget[offset + channel]!
      }
    }
  }
  seatMesh.instanceMatrix.needsUpdate = true
  seatOutline.instanceMatrix.needsUpdate = true
  if (seatMesh.instanceColor) seatMesh.instanceColor.needsUpdate = true
  seatMesh.visible = current.seats > 0.001
  seatOutline.visible = seatMesh.visible
  return moving
}

const waveFlag = () => {
  if (!flag || !flagRest) return
  const positions = flag.mesh.geometry.attributes.position!
  const array = positions.array as Float32Array
  const still = reduced() || prefersLightMotion()
  for (let index = 0; index < positions.count; index++) {
    const x = flagRest[index * 3]!
    array[index * 3 + 2] = still ? 0 : Math.sin(elapsed * 4.2 - x * 9) * 0.045 * (x / 0.62)
  }
  positions.needsUpdate = true
}

const swoopAt = (now: number) => {
  if (reduced()) return 0
  const progress = (now - swoopStart) / SWOOP_MS
  return progress > 0 && progress < 1 ? Math.sin(progress * Math.PI) * SWOOP_DEPTH : 0
}

const placeCamera = (now: number) => {
  if (!camera || !canvas.value) return
  const { clientWidth: width, clientHeight: height } = canvas.value
  if (!width || !height) return
  const sway = Math.sin(elapsed * 0.35) * 0.32 * current.sway
  const fit = current.fit * (1 + swoopAt(now))
  const distance = fitDistance(fit, FOV, width / height, current.share)
  const target: [number, number, number] = [current.tx, current.ty, current.tz]
  camera.position.set(...orbitPosition(target, current.azimuth + sway, current.elevation, distance))
  camera.lookAt(...target)
  camera.setViewOffset(width, height, 0, current.shift, width, height)
}

const bandTargets = () => {
  const height = canvas.value?.clientHeight ?? 0
  if (!props.band || !height) return { shift: 0, share: 1 }
  return {
    shift: bandShift(height, props.band),
    share: Math.max(0.15, (props.band.bottom - props.band.top) / height),
  }
}

const tick = (now: number) => {
  frame = requestAnimationFrame(tick)
  const dt = Math.min(0.1, lastFrame ? (now - lastFrame) / 1000 : 0)
  lastFrame = now
  elapsed += dt

  const target = PARLIAMENT_POSES[props.phase]
  const snap = reduced()
  let changed = false
  const step = (key: keyof typeof current, goal: number, rate: number, after = 0) => {
    const previous = current[key]
    if (snap) current[key] = goal
    else if (now >= after) {
      current[key] += (goal - current[key]) * approach(dt, rate)
      if (Math.abs(goal - current[key]) < 1e-4) current[key] = goal
    }
    if (current[key] !== previous) changed = true
  }

  if (intro && current.build < 1) {
    if (!introStart) introStart = now
    current.build = snap ? 1 : clamp01((now - introStart) / BUILD_MS)
    changed = true
  } else {
    current.build = target.build
  }
  step('roof', target.roof, RATES.roof, startsAt.roof)
  step('roofGone', target.roofGone, RATES.roofGone, startsAt.roofGone)
  step('facade', target.facade, RATES.facade, startsAt.facade)
  step('walls', target.walls, RATES.walls, startsAt.walls)
  step('seats', target.seats, RATES.seats, startsAt.seats)
  step('azimuth', target.azimuth, RATES.camera, startsAt.camera)
  step('elevation', target.elevation, RATES.camera, startsAt.camera)
  step('fit', target.fit, RATES.camera, startsAt.camera)
  step('tx', target.target[0], RATES.camera, startsAt.camera)
  step('ty', target.target[1], RATES.camera, startsAt.camera)
  step('tz', target.target[2], RATES.camera, startsAt.camera)
  step('sway', snap || prefersLightMotion() ? 0 : target.drift > 0 ? 1 : 0, 0.8)
  const band = bandTargets()
  step('shift', band.shift, 6)
  step('share', band.share, 6)
  if (swoopAt(now)) changed = true

  flagGoal.set(props.flagColor)
  flagHex.lerp(flagGoal, snap ? 1 : approach(dt, 4))
  flagMaterial?.color.copy(flagHex)

  const seatsMoving = placeSeats(now, dt)
  const ambient = current.sway > 0.001 || (!!flag?.mesh.visible && !snap)
  const due = now - lastRender >= 1000 / AMBIENT_FPS
  if (!changed && !seatsMoving && !(ambient && due) && lastRender) return

  placeParts()
  waveFlag()
  placeCamera(now)
  if (renderer && scene && camera) renderer.render(scene, camera)
  lastRender = now
}

const onContextLost = (event: Event) => {
  event.preventDefault()
  cancelAnimationFrame(frame)
  emit('failed')
}

onMounted(() => {
  const element = canvas.value
  if (!element) return
  try {
    renderer = new WebGLRenderer({
      canvas: element,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    })
  } catch {
    emit('failed')
    return
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setClearColor(0x000000, 0)
  element.addEventListener('webglcontextlost', onContextLost)

  scene = new Scene()
  scene.add(new AmbientLight('#ffffff', 1.9))
  const sun = new DirectionalLight('#ffffff', 1.6)
  sun.position.set(6, 12, 8)
  scene.add(sun)
  camera = new PerspectiveCamera(FOV, 1, 0.1, 200)

  buildScene()

  const resize = () => {
    if (!renderer || !camera) return
    const { clientWidth, clientHeight } = element
    if (!clientWidth || !clientHeight) return
    renderer.setSize(clientWidth, clientHeight, false)
    camera.aspect = clientWidth / clientHeight
    camera.updateProjectionMatrix()
    lastRender = 0
  }
  resize()
  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(element)
  frame = requestAnimationFrame(tick)
})

watch(
  () => props.phase,
  phase => {
    if (phase === 'briefing') {
      intro = true
      introStart = 0
      current.build = 0
    }
    const now = performance.now()
    for (const key of Object.keys(LEADS_MS) as (keyof typeof LEADS_MS)[]) {
      startsAt[key] = now + LEADS_MS[key]
    }
    swoopStart = now
  }
)

watch(
  () => props.groups,
  () => paintSeats(reduced()),
  { deep: true }
)

watch(
  () => props.totalSeats,
  () => seatGeometryRef && buildSeats(seatGeometryRef)
)

watch(
  () => props.verdictKey,
  key => {
    if (key && !reduced()) current.elevation += 0.07
  }
)

onUnmounted(() => {
  cancelAnimationFrame(frame)
  resizeObserver?.disconnect()
  canvas.value?.removeEventListener('webglcontextlost', onContextLost)
  seatMesh?.dispose()
  seatOutline?.dispose()
  seatInkGeometry?.dispose()
  for (const item of disposables) item.dispose()
  renderer?.dispose()
})
</script>

<style lang="scss" scoped>
.parliament-stage {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
