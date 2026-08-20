<template>
  <div class="flag-drift" aria-hidden="true">
    <span v-for="band in bands" :key="band.key" class="band ambient-loop" :style="band.style" />
  </div>
</template>
<script lang="ts" setup>
import { ISOCountryCodes } from '~~/data/iso-codes.gen'
import { sampleMany } from '~~/lib/arrays'
import { flagSwatches } from '~~/lib/audio-palette'
import { seededRandom } from '~~/lib/random'

/**
 * The flags card's ground: the colours flags are made of, not the flags.
 *
 * Drawing actual flags here would be wrong twice over — they are the round's
 * subject (a wall of them is a wall of answers), and inlining many at once
 * trips the id-collision hazard CountryFlag exists to defend against. Bands of
 * real national palettes carry the register without carrying a single answer.
 */
const props = defineProps<{ seed: number }>()

const BANDS = 26

const bands = computed(() => {
  const random = seededRandom(props.seed)
  // flagSwatches already collapses a crest-heavy flag's hundred near-identical
  // shades down to the few colours a person would actually name.
  const palettes = sampleMany([...ISOCountryCodes], 14, random)
    .map(isoCode => flagSwatches(isoCode))
    .filter(swatches => swatches.length > 1)
  const colors = palettes.flat()
  if (!colors.length) return []
  return Array.from({ length: BANDS }, (_, index) => {
    const color = colors[Math.floor(random() * colors.length)] as string
    const height = 3 + random() * 9
    return {
      key: `${index}-${color}`,
      style: {
        top: `${(index / BANDS) * 118 - 9}%`,
        height: `${height}%`,
        background: color,
        opacity: (0.16 + random() * 0.26).toFixed(2),
        animationDelay: `${(-random() * 40).toFixed(2)}s`,
        animationDuration: `${(34 + random() * 26).toFixed(2)}s`,
        animationDirection: index % 2 ? 'reverse' : 'normal',
      } as Record<string, string>,
    }
  })
})
</script>
<style lang="scss" scoped>
.flag-drift {
  inset: 0;
  z-index: 0;
  overflow: hidden;
  position: absolute;
  pointer-events: none;
  opacity: 0.5;
  transform: rotate(-6deg) scale(1.3);
  mask-image: radial-gradient(ellipse 50% 44% at 50% 50%, transparent 36%, black 80%);
}

.band {
  left: -60%;
  width: 220%;
  display: block;
  position: absolute;
  border-radius: 999px;
  filter: blur(14px);
  animation: band-slide 42s linear infinite;
}

@keyframes band-slide {
  from {
    transform: translate3d(-14%, 0, 0);
  }
  to {
    transform: translate3d(14%, 0, 0);
  }
}
</style>
