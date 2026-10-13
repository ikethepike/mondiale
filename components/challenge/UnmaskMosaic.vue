<template>
  <div class="unmask-mosaic" :class="{ unmasked: !!photo }" :style="{ '--tiles': grid?.size ?? 1 }">
    <div v-if="grid" :key="grid.size" class="tiles" aria-hidden="true">
      <span
        v-for="(tile, index) in grid.tiles"
        :key="index"
        class="tile"
        :style="{ '--from': tile.from, '--to': tile.to, '--delay': `${tile.delay}ms` }"
      />
    </div>
    <span v-else class="blank" aria-hidden="true" />
    <Transition name="unmask">
      <span
        v-if="photo"
        class="photo"
        :style="{ backgroundImage: `url(${photo})` }"
        role="img"
        :aria-label="photoLabel"
      />
    </Transition>
    <span v-if="grid && !photo" class="resolution">{{ grid.size }} × {{ grid.size }}</span>
  </div>
</template>
<script lang="ts" setup>
import { decodePixels } from '~~/lib/unmask'
import { prefersReducedMotion } from '~~/lib/motion'

/** A leader's portrait as a tile mosaic that splits each tile into four as
 *  the next tier lands, then lifts away to the photograph at the reveal. */
const props = defineProps<{
  tiers: { size: number; pixels: string }[]
  photo?: string
  photoLabel?: string
}>()

/** The whole sweep, centre to corner, whatever the tier. */
const SWEEP_MS = 900
const INK = 'hsl(215.7 76.4% 21.6%)'

const rgb = (bytes: Uint8Array, index: number) =>
  `rgb(${bytes[index * 3]} ${bytes[index * 3 + 1]} ${bytes[index * 3 + 2]})`

const grid = computed(() => {
  const latest = props.tiers.at(-1)
  if (!latest) return undefined
  const previous = props.tiers.at(-2)
  const bytes = decodePixels(latest.pixels)
  const parent = previous ? decodePixels(previous.pixels) : undefined
  const ratio = previous ? latest.size / previous.size : 1
  const centre = (latest.size - 1) / 2
  const reach = Math.hypot(centre, centre) || 1
  const still = prefersReducedMotion()
  return {
    size: latest.size,
    tiles: Array.from({ length: latest.size * latest.size }, (_, index) => {
      const x = index % latest.size
      const y = Math.floor(index / latest.size)
      const from =
        parent && previous
          ? rgb(parent, Math.floor(y / ratio) * previous.size + Math.floor(x / ratio))
          : INK
      return {
        from,
        to: rgb(bytes, index),
        delay: still ? 0 : Math.round((Math.hypot(x - centre, y - centre) / reach) * SWEEP_MS),
      }
    }),
  }
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.unmask-mosaic {
  position: relative;
  aspect-ratio: 1;
  width: 100%;
  overflow: hidden;
  border-radius: 0.6rem;
  background: ink();
  box-shadow: 0 0.4rem 1.6rem ink(0.3);
}

.tiles {
  inset: 0;
  display: grid;
  position: absolute;
  grid-template-columns: repeat(var(--tiles), 1fr);
  gap: clamp(0.5px, calc(12% / var(--tiles)), 3px);
  padding: clamp(0.5px, calc(12% / var(--tiles)), 3px);
}

.tile {
  border-radius: calc(18% + 1px);
  background: var(--to);
  animation: tile-split var(--motion-slow) var(--ease-out-expressive) var(--delay) both;
}

@keyframes tile-split {
  from {
    background: var(--from);
    scale: 1.5;
  }
  to {
    background: var(--to);
    scale: 1;
  }
}

.blank {
  inset: 0;
  position: absolute;
  background: repeating-linear-gradient(
    -45deg,
    ink(),
    ink() 0.6rem,
    ink(0.9) 0.6rem,
    ink(0.9) 1.2rem
  );
}

.photo {
  inset: 0;
  position: absolute;
  background-size: cover;
  background-position: center top;
}

.unmask-enter-active {
  transition:
    opacity var(--motion-slow) var(--ease-smooth),
    clip-path calc(var(--motion-slow) * 2) var(--ease-out-expressive);
}

.unmask-enter-from {
  opacity: 0;
  clip-path: inset(0 0 100% 0);
}

.resolution {
  right: 0.6rem;
  bottom: 0.6rem;
  position: absolute;
  padding: 0.1rem 0.6rem;
  font-size: 1.1rem;
  letter-spacing: 0.06em;
  border-radius: 0.4rem;
  color: milk();
  background: ink(0.7);
  font-variant-numeric: tabular-nums;
}
</style>
