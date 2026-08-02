<template>
  <div class="photo-option-challenge">
    <h1 class="map-caption">{{ caption }}</h1>
    <!-- A fixed-size stage that fits ANY photo aspect ratio, with click/scroll
         and pinch to zoom + pan so players can inspect the detail. -->
    <div class="photo-stage">
      <ZoomableImage :src="image" :alt="alt" />
      <SourceInfo
        v-if="attributions?.length"
        class="photo-source on-photo"
        label="Photo"
        :attributions="attributions"
        :item-credit="itemCredit"
      />
    </div>
    <div class="options card-options">
      <button
        v-for="option in options"
        :key="option"
        class="option card-option"
        type="button"
        @click="emit('pick', option)"
      >
        <CountryTileFlag class="option-flag" :country="getCountry(option)" />
        <span>{{ countryName(option) }}</span>
      </button>
    </div>
  </div>
</template>
<script lang="ts" setup>
import ZoomableImage from '~/components/challenge/ZoomableImage.vue'
import SourceInfo from '~/components/feedback/SourceInfo.vue'
import { countryName, getCountry } from '~~/lib/country'
import type { Attribution } from '~~/lib/attribution'
import type { ISOCountryCode } from '~~/types/geography.types'

withDefaults(
  defineProps<{
    image: string
    caption: string
    options: ISOCountryCode[]
    alt?: string
    /** The photo's dataset credits; the caller resolves them (the stage only
     *  knows a src). Leave `itemCredit` off while the photographer's line
     *  could name the answer. */
    attributions?: Attribution[]
    itemCredit?: string
  }>(),
  { alt: 'A photo to identify', attributions: undefined, itemCredit: undefined }
)

const emit = defineEmits<{ pick: [iso: ISOCountryCode] }>()
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;
.photo-option-challenge {
  display: flex;
  flex-direction: column;
  align-items: center;
}

// A consistent stage that any photo aspect ratio sits inside cleanly;
// ZoomableImage renders the framed, zoom/pan-able photo within.
// Fluidly sized hero: grows with the viewport between a comfortable floor and a
// slightly larger ceiling, so it scales smoothly instead of snapping at a
// breakpoint. Shares the screen with the option cards below, so height is
// capped against the viewport.
.photo-stage {
  position: relative;
  margin-top: 0.6rem;
  width: clamp(28rem, 62vw, 46rem);
  height: clamp(20rem, 34vh, 32rem);
}

// The photo's provenance rides the frame's top corner — the bottom edge
// belongs to the zoom controls and the gesture hint. Doubled selector so
// SourceInfo's own positioning never wins.
.photo-stage .photo-source {
  top: 0.8rem;
  right: 0.8rem;
  z-index: 3;
  position: absolute;
}

@media (max-width: $tablet) {
  .photo-stage {
    width: min(94vw, 46rem);
    height: min(30dvh, 32rem);
  }
}

.card-options {
  margin-top: 1.4rem;
  grid-template-columns: repeat(2, minmax(16rem, 24rem));
}

.card-option {
  gap: 1rem;
  padding: 1.2rem;
}

@media (max-width: $tablet) {
  .card-options {
    width: 100%;
    padding: 0 1.6rem;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
