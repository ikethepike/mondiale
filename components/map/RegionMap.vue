<template>
  <div ref="host" class="region-map">
    <component :is="REGION_MAP_COMPONENTS[variant]" />
  </div>
</template>
<script lang="ts" setup>
/**
 * The one host for the hand-drawn region maps: picks the variant's SVG,
 * runs the parallax jitter, and carries the shared sizing styles — the six
 * Map*.vue files are pure SVG templates with no logic of their own.
 */
import { useAnimatedGameMap } from '~~/lib/animations'
import type { GameVariant } from '~~/types/game.types'
import { REGION_MAP_COMPONENTS } from './region-maps'

const props = defineProps<{ variant: GameVariant }>()

const host = ref<HTMLElement>()

/** Asia's dense archipelagos read as noise at the default jitter. */
const MOVEMENT: Partial<Record<GameVariant, number>> = { asia: 0.01 }

useAnimatedGameMap(MOVEMENT[props.variant] ?? 0.1, () => host.value?.querySelector('svg'))
</script>
<style lang="scss" scoped>
.region-map {
  display: contents;
}

:deep(svg) {
  width: 100%;
  display: block;
  max-height: 100%;
}

:deep(svg > *) {
  pointer-events: none;
}
</style>
