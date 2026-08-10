<template>
  <TresCanvas clear-color="#fffaf5" antialias>
    <TresPerspectiveCamera :position="cameraPosition" :fov="42" :near="0.5" :far="600" />
    <TresAmbientLight :intensity="1.9" />
    <TresDirectionalLight :position="LIGHT_POSITION" :intensity="1.6" />
    <OrbitControls
      make-default
      enable-damping
      :damping-factor="0.08"
      :min-polar-angle="polar.min"
      :max-polar-angle="polar.max"
    />
    <primitive :object="stage" />
  </TresCanvas>
</template>
<script lang="ts" setup>
import { OrbitControls } from '@tresjs/cientos'
import { TresCanvas } from '@tresjs/core'
import { gsap } from 'gsap'
import {
  BackSide,
  CanvasTexture,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three'
import {
  markerBerthFor,
  markerFitFactor,
  markerPartsFor,
  type MarkerType,
  TILE_RADIUS_RATIO,
  TILE_RIM_HEIGHT,
  TILE_TOP_INSET,
} from '~~/lib/board3d/board-builder'
import { BOARD_COLORS, TILE_TOP_TINTS } from '~~/lib/board3d/colors'
import { outlineOf } from '~~/lib/board3d/ink-outline'
import { individualChallengeAccessors } from '~~/types/challenges/individual-challenge.type'

// Marker workbench: every gate marker under the exact lighting, camera fov
// and polar clamps of the real scene (TopoScene.vue), rebuilt live as the
// /test-markers controls change. No production merge here on purpose — the
// board merges parts by color as a draw-call optimization; the lab needs
// per-marker groups for the turntable and labels.
const props = defineProps({
  outlineWidthRatio: {
    type: Number,
    required: true,
  },
  cameraPreset: {
    type: String as PropType<'board' | 'path' | 'free'>,
    required: true,
  },
  turntable: {
    type: Boolean,
    required: true,
  },
  variants: {
    type: Object as PropType<Partial<Record<MarkerType, string>>>,
    required: true,
  },
  finalStages: {
    type: Number,
    required: true,
  },
  /** Reproduce the board's real placement: neighbouring discs a chord away,
   *  the marker berthed beside its tile at its fitted scale. Off, this is the
   *  old showroom grid — good for judging a shape, useless for judging where
   *  it stands. */
  productionPlacement: {
    type: Boolean,
    required: true,
  },
})

const SPACING = 8
const PITCH = SPACING * 2.2
/** Tiles sit a CHORD apart, not `spacing` (the curve's average arc length).
 *  Measured at 0.84–0.92 across every board length and seed — the tight end
 *  is what a marker has to survive, so the lab previews it. */
const LIVE_CHORD_RATIO = 0.87
const MARKER_TYPES: MarkerType[] = [...individualChallengeAccessors, 'final']
const LIGHT_POSITION = new Vector3(60, 120, 80)
// Markers stand with local +z along the path; a quarter turn lays the path
// left-right so the default framing is the side-on view the game is played
// from, not the down-the-path one.
const BASE_YAW = Math.PI / 2

const stage = new Group()
const markerGroups: Group[] = []

const cameraPosition = shallowRef(new Vector3(0, 52, 45))
watch(
  () => props.cameraPreset,
  preset => {
    if (preset === 'board') cameraPosition.value = new Vector3(0, 52, 45)
    if (preset === 'path') cameraPosition.value = new Vector3(0, 7, 52)
  }
)

// board/path keep TopoScene's polar clamps; free lifts them for underside checks
const polar = computed(() =>
  props.cameraPreset === 'free' ? { min: 0, max: Math.PI / 2 + 0.2 } : { min: 0.12, max: 1.32 }
)

const labelTexture = (text: string): CanvasTexture => {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const context = canvas.getContext('2d')!
  context.fillStyle = BOARD_COLORS.darkBlue
  context.font = '600 44px system-ui, sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(text, canvas.width / 2, canvas.height / 2)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

const disposeStage = () => {
  stage.traverse(child => {
    if (child instanceof Mesh) {
      child.geometry.dispose()
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      materials.forEach(material => {
        if ('map' in material && material.map) material.map.dispose()
        material.dispose()
      })
    }
  })
  stage.clear()
  markerGroups.length = 0
}

const spinTweens: gsap.core.Tween[] = []
const stopSpin = () => {
  spinTweens.forEach(tween => tween.kill())
  spinTweens.length = 0
  markerGroups.forEach(group => (group.rotation.y = BASE_YAW))
}
const startSpin = () => {
  stopSpin()
  markerGroups.forEach(group =>
    spinTweens.push(
      gsap.to(group.rotation, { y: `+=${Math.PI * 2}`, duration: 12, ease: 'none', repeat: -1 })
    )
  )
}

/** A plain neighbouring disc, so the berth can be judged against what it has
 *  to clear. Only drawn in production-placement mode. */
const neighbourDisc = (tileRadius: number) => {
  const disc = new Group()
  const rim = new Mesh(
    new CylinderGeometry(tileRadius, tileRadius, TILE_RIM_HEIGHT, 28),
    new MeshBasicMaterial({ color: BOARD_COLORS.ink })
  )
  rim.position.y = TILE_RIM_HEIGHT / 2
  const top = new Mesh(
    new CylinderGeometry(tileRadius * 0.9, tileRadius * 0.9, TILE_RIM_HEIGHT, 28),
    new MeshBasicMaterial({ color: BOARD_COLORS.sourMilk })
  )
  top.position.y = TILE_RIM_HEIGHT / 2 + TILE_TOP_INSET
  disc.add(rim, top)
  return disc
}

const rebuild = () => {
  disposeStage()

  // Production spaces tiles a CHORD apart, which runs ~0.88 of `spacing`. The
  // lab used to sit every marker alone in a 2.2x-pitch grid, centred on its
  // disc and standing on the top face — a preview the game never renders, and
  // the reason the old tangent placement's disc overlaps were reviewed and
  // passed. In production mode the neighbours, the berth and the pawn's own
  // tile are all real.
  const live = props.productionPlacement
  const tileRadius = SPACING * TILE_RADIUS_RATIO
  const outlineWidth = SPACING * props.outlineWidthRatio
  const chord = SPACING * LIVE_CHORD_RATIO
  const gap = Math.max(0, chord - tileRadius * 2)
  const pitch = live ? Math.max(PITCH, chord * 2.4) : PITCH

  MARKER_TYPES.forEach((type, index) => {
    const slot = new Group()
    slot.position.set(((index % 3) - 1) * pitch, 0, (Math.floor(index / 3) - 1) * pitch)

    const rim = new Mesh(
      new CylinderGeometry(tileRadius, tileRadius, TILE_RIM_HEIGHT, 28),
      new MeshBasicMaterial({ color: BOARD_COLORS.ink })
    )
    rim.position.y = TILE_RIM_HEIGHT / 2
    const top = new Mesh(
      new CylinderGeometry(tileRadius * 0.9, tileRadius * 0.9, TILE_RIM_HEIGHT, 28),
      new MeshBasicMaterial({
        color: type === 'final' ? BOARD_COLORS.hiorAnge : TILE_TOP_TINTS[type],
      })
    )
    top.position.y = TILE_RIM_HEIGHT / 2 + TILE_TOP_INSET
    slot.add(rim, top)

    // The tiles ahead and behind — what a too-deep marker actually fouls.
    // BASE_YAW lays the path along world X (the side-on view the game is
    // played from), so the neighbours sit either side on X.
    if (live) {
      for (const sign of [1, -1]) {
        const neighbour = neighbourDisc(tileRadius)
        neighbour.position.x = chord * sign
        slot.add(neighbour)
      }
    }

    const parts = markerPartsFor(type, SPACING, props.variants[type], props.finalStages)
    const fit = type === 'final' ? 1 : markerFitFactor(parts, tileRadius, gap, outlineWidth)

    const marker = new Group()
    marker.position.y = TILE_RIM_HEIGHT + TILE_TOP_INSET
    marker.rotation.y = BASE_YAW
    if (live) {
      // Berthed BESIDE the tile, exactly as the builder does it, so the pawn's
      // own tile stays clear. BASE_YAW maps the marker's own side axis (local
      // +x) onto world -z, so the berth is applied there — the same offset the
      // builder makes along the path's normal.
      marker.scale.setScalar(fit)
      if (type !== 'final') {
        marker.position.z = -markerBerthFor(parts, tileRadius, fit, outlineWidth)
      }
    }
    for (const part of parts) {
      const geometry = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry
      if (geometry !== part.geometry) part.geometry.dispose()
      if (part.outline !== false) {
        marker.add(
          new Mesh(
            outlineOf(geometry, outlineWidth),
            new MeshBasicMaterial({ color: BOARD_COLORS.ink, side: BackSide })
          )
        )
      }
      marker.add(new Mesh(geometry, new MeshToonMaterial({ color: part.color })))
    }
    markerGroups.push(marker)
    slot.add(marker)

    const label = new Mesh(
      new PlaneGeometry(9, 2.25),
      new MeshBasicMaterial({ map: labelTexture(type), transparent: true })
    )
    label.rotation.x = -Math.PI / 2
    label.position.set(0, 0.05, tileRadius + 2)
    slot.add(label)

    stage.add(slot)
  })

  if (props.turntable) startSpin()
}

watch(
  () => [
    props.outlineWidthRatio,
    props.finalStages,
    props.productionPlacement,
    JSON.stringify(props.variants),
  ],
  rebuild,
  { immediate: true }
)

watch(
  () => props.turntable,
  spinning => (spinning ? startSpin() : stopSpin())
)

onUnmounted(() => {
  stopSpin()
  disposeStage()
})
</script>
