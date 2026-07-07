<template>
  <div v-if="challenge" class="sketch-challenge">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1} — Sketch`"
      :title="`Draw ${countryName(challenge.country)} from memory`"
      stakes="One continuous line — the closer your outline matches the real shape, the more points you earn."
      @done="showInterstitial = false"
    />

    <header>
      <div class="prompt">
        <h1 class="map-caption">Draw {{ countryName(challenge.country) }}</h1>
        <span class="map-caption sub">One continuous line — north is up</span>
      </div>
    </header>

    <section class="easel">
      <div class="canvas-frame">
        <canvas
          ref="canvas"
          @pointerdown="startStroke"
          @pointermove="extendStroke"
          @pointerup="endStroke"
          @pointerleave="endStroke"
        />
      </div>
      <nav class="tools">
        <ButtonLine :disabled="!points.length || submitted" @click="clearCanvas">
          <span>Start over</span>
        </ButtonLine>
        <ButtonFilled :disabled="points.length < 12 || submitted" @click="submitSketch">
          <span>Submit Drawing</span>
        </ButtonFilled>
      </nav>
    </section>
  </div>
</template>
<script lang="ts" setup>
import Interstitial from '~/components/feedback/Interstitial.vue'
import { countryName } from '~~/lib/country'
import { useClientEvents } from '~~/lib/events/client-side'
import {
  countryPathData,
  largestRing,
  normalizeOutline,
  type OutlinePoint,
  resampleClosed,
  scoreSketch,
} from '~~/lib/outline'

const { gameStore, update, currentRound, clearBoard } = useClientEvents()

const challenge = computed(() => {
  const roundChallenge = currentRound.value?.round.groupChallenge
  return roundChallenge && '_type' in roundChallenge && roundChallenge._type === 'sketch-challenge'
    ? roundChallenge
    : undefined
})

const showInterstitial = ref(true)
const submitted = ref(false)
const canvas = ref<HTMLCanvasElement>()
const points = ref<OutlinePoint[]>([])
let drawing = false

// Blank map: no reference material while sketching
clearBoard()
gameStore.map.solo = true

const contextOf = () => {
  const element = canvas.value
  const context = element?.getContext('2d')
  if (!element || !context) return undefined
  return { element, context }
}

onMounted(() => {
  const parts = contextOf()
  if (!parts) return
  const { element } = parts
  const scale = window.devicePixelRatio || 1
  element.width = element.clientWidth * scale
  element.height = element.clientHeight * scale
  parts.context.scale(scale, scale)
  parts.context.lineWidth = 3
  parts.context.lineCap = 'round'
  parts.context.lineJoin = 'round'
  parts.context.strokeStyle = 'hsl(215.7, 76.4%, 21.6%)'
})

const canvasPoint = (event: PointerEvent): OutlinePoint | undefined => {
  const element = canvas.value
  if (!element) return undefined
  const rect = element.getBoundingClientRect()
  return [event.clientX - rect.left, event.clientY - rect.top]
}

const startStroke = (event: PointerEvent) => {
  if (submitted.value || showInterstitial.value) return
  drawing = true
  const point = canvasPoint(event)
  if (point) points.value.push(point)
}

const extendStroke = (event: PointerEvent) => {
  if (!drawing || submitted.value) return
  const point = canvasPoint(event)
  const parts = contextOf()
  const previous = points.value[points.value.length - 1]
  if (!point || !parts || !previous) return

  // Thin out ultra-dense pointer samples
  if (Math.hypot(point[0] - previous[0], point[1] - previous[1]) < 2.5) return

  parts.context.beginPath()
  parts.context.moveTo(previous[0], previous[1])
  parts.context.lineTo(point[0], point[1])
  parts.context.stroke()
  points.value.push(point)
}

const endStroke = () => {
  drawing = false
}

const clearCanvas = () => {
  const parts = contextOf()
  if (!parts) return
  parts.context.clearRect(0, 0, parts.element.clientWidth, parts.element.clientHeight)
  points.value = []
}

const submitSketch = () => {
  const active = challenge.value
  if (!active || submitted.value || points.value.length < 12) return
  submitted.value = true

  const pathData = countryPathData(active.country)
  const target = pathData ? largestRing(pathData) : undefined
  const clientScore = target ? scoreSketch(points.value, target, active.maximumPoints) : 0

  // Ship the normalized drawing so everyone's attempt overlays on the reveal
  const normalized = normalizeOutline(resampleClosed(points.value, 96)).map(
    ([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000] as OutlinePoint
  )

  gameStore.map.status = clientScore > active.maximumPoints * 0.4 ? 'correct' : 'incorrect'
  update({
    event: 'submit-group-challenge-answers',
    ranking: [active.country],
    clientScore,
    sketch: normalized,
  })
}

onBeforeUnmount(() => {
  clearBoard()
})
</script>
<style lang="scss" scoped>
.sketch-challenge {
  top: 0;
  left: 0;
  width: 100%;
  height: 100vh;
  display: flex;
  position: absolute;
  flex-flow: column nowrap;
}

header {
  z-index: 2;
  width: 100%;
  text-align: center;
  padding: 2rem 4rem;

  h1 {
    margin: 0;
    font-size: 3.2rem;
  }
  .sub {
    padding: 0.4rem 1.4rem;
  }
  .prompt {
    gap: 1rem;
    display: flex;
    align-items: center;
    flex-flow: column nowrap;
  }
}

.easel {
  flex: 1;
  gap: 1.6rem;
  display: flex;
  min-height: 0;
  align-items: center;
  flex-flow: column nowrap;
  justify-content: center;
  padding-bottom: 2.4rem;
}

.canvas-frame {
  width: min(64rem, 88vw);
  height: min(40rem, 52vh);
  border-radius: 1.2rem;
  pointer-events: auto;
  backdrop-filter: blur(0.5rem);
  background: hsla(36, 100%, 98%, 0.9);
  border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.25);

  canvas {
    width: 100%;
    height: 100%;
    display: block;
    cursor: crosshair;
    touch-action: none;
  }
}

.tools {
  gap: 1.2rem;
  display: flex;
  pointer-events: auto;
}
</style>
