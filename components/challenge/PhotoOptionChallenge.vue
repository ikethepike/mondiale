<template>
  <div class="photo-option-challenge">
    <h1 class="map-caption">{{ caption }}</h1>
    <!-- A fixed-size stage that fits ANY photo aspect ratio: the image is
         `contain`ed (never cropped), and a blurred copy of the same photo
         fills the letterbox gaps so the frame never looks empty. -->
    <div class="photo-stage">
      <template v-if="!broken">
        <div class="photo-backdrop" :style="{ backgroundImage: `url('${image}')` }" aria-hidden="true" />
        <img class="photo" :src="image" :alt="alt" @error="broken = true" />
      </template>
      <div v-else class="photo-missing" aria-hidden="true">?</div>
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
const broken = ref(false)
</script>
<style lang="scss" scoped>
.photo-option-challenge {
  display: flex;
  flex-direction: column;
  align-items: center;
}

// A consistent stage that any photo aspect ratio sits inside cleanly.
.photo-stage {
  position: relative;
  overflow: hidden;
  margin-top: 0.6rem;
  width: min(38rem, 86vw);
  height: min(26rem, 42vh);
  border-radius: 1.2rem;
  border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.2);
  background: hsla(215.7, 76.4%, 21.6%, 0.06);
}

// Blurred, darkened copy fills the letterbox gaps around an off-ratio photo.
.photo-backdrop {
  position: absolute;
  inset: -2rem;
  background-size: cover;
  background-position: center;
  filter: blur(1.6rem) brightness(0.7);
  transform: scale(1.1);
}

.photo {
  position: relative;
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain; // the WHOLE photo, never cropped
  object-position: center;
}

.photo-missing {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 5rem;
  color: hsla(215.7, 76.4%, 21.6%, 0.3);
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
