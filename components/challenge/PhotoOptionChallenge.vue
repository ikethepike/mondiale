<template>
  <div class="photo-option-challenge">
    <h1 class="map-caption">{{ caption }}</h1>
    <!-- A fixed-size stage that fits ANY photo aspect ratio, with click/scroll
         and pinch to zoom + pan so players can inspect the detail. -->
    <div class="photo-stage">
      <ZoomableImage :src="image" :alt="alt" />
    </div>
    <div class="options card-options">
      <button
        v-for="option in options"
        :key="option"
        class="option card-option"
        type="button"
        @click="emit('pick', option)"
      >
        <CountryFlag class="option-flag" :country="getCountry(option)" mode="background" />
        <span>{{ countryName(option) }}</span>
      </button>
    </div>
  </div>
</template>
<script lang="ts" setup>
import CountryFlag from '~/components/country/CountryFlag.vue'
import ZoomableImage from '~/components/challenge/ZoomableImage.vue'
import { countryName, getCountry } from '~~/lib/country'
import type { ISOCountryCode } from '~~/types/geography.types'

withDefaults(
  defineProps<{
    image: string
    caption: string
    options: ISOCountryCode[]
    alt?: string
  }>(),
  { alt: 'A photo to identify' }
)

const emit = defineEmits<{ pick: [iso: ISOCountryCode] }>()
</script>
<style lang="scss" scoped>
.photo-option-challenge {
  display: flex;
  flex-direction: column;
  align-items: center;
}

// A consistent stage that any photo aspect ratio sits inside cleanly;
// ZoomableImage renders the framed, zoom/pan-able photo within.
.photo-stage {
  margin-top: 0.6rem;
  width: min(38rem, 86vw);
  height: min(26rem, 42vh);
}

@media (max-width: 640px) {
  .photo-stage {
    width: 92vw;
    height: 34vh;
  }
}

.card-options {
  gap: 1.4rem;
  display: grid;
  margin-top: 1.4rem;
  pointer-events: auto;
  grid-template-columns: repeat(2, minmax(16rem, 24rem));
}

.card-option {
  cursor: pointer;
  padding: 1.2rem;
  gap: 1rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;
  border-radius: 1.2rem;
  color: var(--dark-blue);
  backdrop-filter: blur(0.5rem);
  background: hsla(36, 100%, 98%, 0.88);
  border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.25);
  transition:
    transform var(--motion-quick) var(--ease-out-expressive),
    border-color var(--motion-quick) var(--ease-out-expressive);

  &:hover {
    transform: translateY(-0.3rem);
    border-color: var(--dark-blue);
  }

  .option-flag {
    width: 100%;
    height: 8rem;
    border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.25);
  }
}

@media (max-width: 640px) {
  .card-options {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
