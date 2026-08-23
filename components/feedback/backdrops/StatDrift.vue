<template>
  <div class="stat-drift" :style="fieldStyle" aria-hidden="true">
    <div v-for="band in bands" :key="band.key" class="band" :style="band.style">
      <!-- Twice through, so the pan closes on itself with no seam. -->
      <template v-for="pass in 2" :key="pass">
        <img
          v-for="tile in band.tiles"
          :key="`${pass}-${tile.key}`"
          class="glyph"
          :src="tile.src"
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
import { glyphDataUri, STAT_GLYPHS } from '~~/lib/stat-glyphs'
import { useIsPhone } from '~~/lib/use-viewport'

/** Every stat the ranking round can ask about, panning past in bands. */
const props = defineProps<{ seed: number }>()

const isPhone = useIsPhone()

const GLYPHS = Object.values(STAT_GLYPHS).map(glyph => glyphDataUri(glyph))

// Bounded both ways: past 8° the bands read as a diagonal, under 3° the tilt
// reads as a mistake rather than a choice.
const TILT_MIN = 3
const TILT_MAX = 8

const field = computed(() => {
  const random = seededRandom(props.seed)
  const count = isPhone.value ? 11 : 12
  const perBand = isPhone.value ? 11 : 28
  const tilt = (random() < 0.5 ? -1 : 1) * (TILT_MIN + random() * (TILT_MAX - TILT_MIN))
  return {
    tilt,
    bands: Array.from({ length: count }, (_, index) => ({
      key: `band-${index}`,
      tiles: sampleMany(GLYPHS, perBand, random).map((src, tile) => ({
        key: `${index}-${tile}`,
        src,
      })),
      style: {
        '--pan-seconds': `${Math.round(46 + random() * 26)}s`,
        '--pan-delay': `-${(random() * 40).toFixed(1)}s`,
        '--pan-direction': index % 2 ? 'reverse' : 'normal',
      } as Record<string, string>,
    })),
  }
})

const bands = computed(() => field.value.bands)
const fieldStyle = computed(() => ({ '--field-tilt': `${field.value.tilt.toFixed(2)}deg` }))
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/backdrop' as *;
@use '~/assets/scss/rules/breakpoints' as *;

.stat-drift {
  @include backdrop-field(0.32, 1.04);
  display: flex;
  overflow: hidden;
  align-items: flex-start;
  flex-flow: column nowrap;
  justify-content: space-around;
  // Scaled past the tilt: at TILT_MAX the card's corners still sit inside.
  transform: rotate(var(--field-tilt)) scale(1.3);
}

.band {
  display: flex;
  // Two passes, each exactly the field's width, so the pan below lands pass
  // two where pass one stood — and a band always spans the field, whatever
  // its head start.
  width: 200%;
  animation: band-pan var(--pan-seconds) linear infinite;
  animation-delay: var(--pan-delay);
  animation-direction: var(--pan-direction);
  will-change: transform;
}

.glyph {
  height: 2.4rem;
  flex: 1 1 0;
  min-width: 0;
  object-fit: contain;
}

@media screen and (max-width: $phone) {
  .glyph {
    height: 2rem;
  }
}

@keyframes band-pan {
  from {
    transform: translate3d(0, 0, 0);
  }
  to {
    transform: translate3d(-50%, 0, 0);
  }
}
</style>
