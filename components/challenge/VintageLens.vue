<template>
  <figure class="vintage-lens">
    <div class="frame">
      <svg :viewBox="region.frame.join(' ')" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
          <clipPath :id="`${uid}-then`">
            <rect :x="x0" :y="region.frame[1]" :width="split" :height="region.frame[3]" />
          </clipPath>
          <clipPath :id="`${uid}-now`">
            <rect
              :x="x0 + split"
              :y="region.frame[1]"
              :width="region.frame[2] - split"
              :height="region.frame[3]"
            />
          </clipPath>
        </defs>
        <g v-for="layer in layers" :key="layer.key" :clip-path="`url(#${uid}-${layer.key})`">
          <path
            v-for="unit in layer.units"
            :key="unit.index"
            class="vintage-unit"
            :class="[`tone-${unit.tone}`, unit.wash ? `wash-${unit.wash}` : '']"
            :data-wash="unit.wash"
            :d="unit.d"
          />
          <path class="borders" :d="layer.borders" />
        </g>
        <g class="badges">
          <g
            v-for="badge in placedBadges"
            :key="badge.n"
            class="badge"
            :class="{ lit: badge.n === highlight }"
            :transform="`translate(${badge.x} ${badge.y})`"
          >
            <circle :r="badgeRadius" />
            <text :font-size="badgeRadius * 1.25" dy="0.35em">{{ badge.n }}</text>
          </g>
        </g>
        <line
          class="divider"
          :x1="x0 + split"
          :x2="x0 + split"
          :y1="region.frame[1]"
          :y2="region.frame[1] + region.frame[3]"
        />
      </svg>
      <input
        v-model.number="share"
        type="range"
        min="0"
        max="100"
        step="1"
        :aria-label="`Slide between ${thenLabel} and ${nowLabel}`"
      />
      <span class="tag then map-caption">{{ thenLabel }}</span>
      <span class="tag now map-caption">{{ nowLabel }}</span>
    </div>
  </figure>
</template>
<script lang="ts" setup>
import { arcPath, finalScene, sceneAt, shapePath, type VintageScene } from '~~/lib/vintage'
import type { VintageRegion } from '~~/types/vintage.types'

/** The scorecard's then-and-now: the dealt map and 2019 in one inset, split
 *  by a divider the reader drags. */
const props = defineProps<{
  region: VintageRegion
  scene: number
  thenLabel: string
  /** Numbered clues, pinned on the old map at their unit's anchor. */
  badges: { n: number; unit: number }[]
  highlight?: number
}>()

const uid = useId()
const share = ref(55)
const x0 = computed(() => props.region.frame[0])
const split = computed(() => (props.region.frame[2] * share.value) / 100)
const nowLabel = '2019'

const layerOf = (key: 'then' | 'now', scene: VintageScene) => ({
  key,
  units: scene.looks.flatMap(([shape, era], index) =>
    shape < 0
      ? []
      : [
          {
            index,
            d: shapePath(props.region, shape),
            tone: props.region.units[index].tone,
            wash: props.region.eras[era].wash,
          },
        ]
  ),
  borders: [...scene.borders].map(arc => arcPath(props.region, arc)).join(''),
})

const thenScene = computed(() => sceneAt(props.region, props.scene))
const layers = computed(() => [
  layerOf('then', thenScene.value),
  layerOf('now', sceneAt(props.region, finalScene(props.region))),
])

const badgeRadius = computed(() => props.region.frame[2] * 0.022)
const placedBadges = computed(() =>
  props.badges.flatMap(({ n, unit }) => {
    const shape = thenScene.value.looks[unit]?.[0] ?? -1
    const now = sceneAt(props.region, finalScene(props.region)).looks[unit]?.[0] ?? -1
    const anchor = props.region.shapes[shape >= 0 ? shape : now]?.anchor
    return anchor ? [{ n, x: anchor[0], y: anchor[1] }] : []
  })
)
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.vintage-lens {
  margin: 0;
}

.frame {
  position: relative;
  border-radius: 0.8rem;
  overflow: hidden;
  background: var(--background-color);
  border: 1px solid ink(0.18);

  svg {
    display: block;
    width: 100%;
    height: auto;
    max-height: 32rem;
  }
}

.borders {
  fill: none;
  stroke: ink(0.75);
  stroke-width: 0.6;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}

.divider {
  stroke: ink(0.95);
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
}

.badge {
  circle {
    fill: var(--background-color);
    stroke: ink(0.9);
    stroke-width: 1.2;
    vector-effect: non-scaling-stroke;
  }

  text {
    fill: ink(0.95);
    text-anchor: middle;
    font-variant-numeric: tabular-nums;
  }

  &.lit circle {
    fill: ink(0.95);
  }

  &.lit text {
    fill: var(--background-color);
  }
}

input[type='range'] {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: ew-resize;
  touch-action: none;
}

.tag {
  position: absolute;
  top: 0.6rem;
  padding: 0.1rem 0.6rem;
  font-size: 1.2rem;
  pointer-events: none;

  &.then {
    left: 0.6rem;
  }

  &.now {
    right: 0.6rem;
  }
}
</style>
