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
})

const SPACING = 8
const PITCH = SPACING * 2.2
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

const rebuild = () => {
  disposeStage()

  const tileRadius = SPACING * TILE_RADIUS_RATIO
  const outlineWidth = SPACING * props.outlineWidthRatio

  MARKER_TYPES.forEach((type, index) => {
    const slot = new Group()
    slot.position.set(((index % 3) - 1) * PITCH, 0, (Math.floor(index / 3) - 1) * PITCH)

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

    const marker = new Group()
    marker.position.y = TILE_RIM_HEIGHT + TILE_TOP_INSET
    marker.rotation.y = BASE_YAW
    for (const part of markerPartsFor(type, SPACING, props.variants[type], props.finalStages)) {
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

watch(() => [props.outlineWidthRatio, props.finalStages, JSON.stringify(props.variants)], rebuild, {
  immediate: true,
})

watch(
  () => props.turntable,
  spinning => (spinning ? startSpin() : stopSpin())
)

onUnmounted(() => {
  stopSpin()
  disposeStage()
})
</script>
