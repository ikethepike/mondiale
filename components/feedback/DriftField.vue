<template>
  <div class="drift-field" aria-hidden="true">
    <div
      v-for="(column, index) in columns"
      :key="index"
      class="column ambient-loop"
      :style="column.style"
    >
      <template v-for="pass in 2" :key="pass">
        <img
          v-for="tile in column.tiles"
          :key="`${pass}-${tile.key}`"
          class="tile"
          :src="tile.src"
          :style="tile.style"
          alt=""
          decoding="async"
        />
      </template>
    </div>
  </div>
</template>
<script lang="ts" setup>
import { sampleMany } from '~~/lib/arrays'
import { seededRandom } from '~~/lib/random'

/**
 * A slow sea of marks behind an announcement — the album-wall idiom: stacked
 * columns at a slight tilt, drifting in alternating directions, dimmed and
 * desaturated so the words in front stay the subject.
 *
 * Two things are load-bearing. The card lives about four seconds, so the field
 * opens MID-DRIFT (a negative animation-delay) rather than easing up from
 * rest — a field that starts still reads as a static image for the only
 * seconds anyone sees it. And the motion is pure CSS on transform, carrying
 * `.ambient-loop` — the shared rule in _motion.scss stops it under reduced
 * motion while the tiles stay VISIBLE. That is the point: this is the page's
 * ground, not a flourish, and a backdrop that vanishes for the motion-averse
 * is just a blank card. (ContourRipple sets opacity 0 in both CSS and JS, so
 * it disappears entirely — correct for a flourish, wrong for a backdrop.)
 */
const props = withDefaults(
  defineProps<{
    /** Every mark the field may draw from. Sampled, never drawn whole. */
    tiles: { src: string; ratio?: number }[]
    /** Same seed, same wall — every seat at the table sees one layout. */
    seed: number
    /** Columns across the viewport. Phones want fewer and larger. */
    columns?: number
    /** Marks per column, per pass. */
    perColumn?: number
    /** Seconds for one full column traversal. Slower reads as ambient. */
    driftSeconds?: number
  }>(),
  { columns: 9, perColumn: 7, driftSeconds: 52 }
)

const columns = computed(() => {
  const random = seededRandom(props.seed)
  const count = Math.max(1, props.columns)
  return Array.from({ length: count }, (_, index) => {
    const picked = sampleMany(props.tiles, props.perColumn, random)
    const reverse = index % 2 === 1
    const offset = -props.driftSeconds * (0.15 + random() * 0.7)
    return {
      style: {
        '--drift-seconds': `${props.driftSeconds}s`,
        '--drift-delay': `${offset}s`,
        '--drift-direction': reverse ? 'reverse' : 'normal',
      } as Record<string, string>,
      tiles: picked.map((tile, tileIndex) => ({
        key: `${index}-${tileIndex}-${tile.src}`,
        src: tile.src,
        style: {
          aspectRatio: `${tile.ratio && tile.ratio > 0 ? tile.ratio : 1}`,
          width: `${Math.round(84 + random() * 16)}%`,
          opacity: `${(0.5 + random() * 0.5).toFixed(2)}`,
          transform: `rotate(${(random() * 5 - 2.5).toFixed(2)}deg)`,
        } as Record<string, string>,
      })),
    }
  })
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.drift-field {
  inset: 0;
  z-index: 0;
  display: flex;
  gap: 1.2%;
  overflow: hidden;
  position: absolute;
  padding: 0 0.6%;
  pointer-events: none;
  opacity: 0.22;
  filter: saturate(0.3);
  transform: rotate(-8deg) scale(1.35);
  mask-image: radial-gradient(ellipse 52% 46% at 50% 50%, transparent 42%, black 85%);
}

.column {
  flex: 1;
  gap: 1.1rem;
  display: flex;
  min-width: 0;
  flex-flow: column nowrap;
  animation: drift-column var(--drift-seconds) linear infinite;
  animation-delay: var(--drift-delay);
  animation-direction: var(--drift-direction);
  will-change: transform;
}

.tile {
  width: 100%;
  height: auto;
  object-fit: contain;
  flex: none;
  mix-blend-mode: multiply;
}

@keyframes drift-column {
  from {
    transform: translate3d(0, 0, 0);
  }
  to {
    transform: translate3d(0, -50%, 0);
  }
}
</style>
