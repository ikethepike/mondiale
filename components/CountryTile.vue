<template>
  <div class="country-tile" :data-iso="country.isoCode">
    <CountryPinwheel class="flag-pinwheel" :country="country" />
    <article>
      <header>
        <h3>{{ country.name.english }}</h3>
        <p class="subtitle">{{ country.geography.capital.name }}</p>
      </header>

      <div class="flag-wrapper">
        <div class="flag" v-html="country.flag" />
      </div>
    </article>

    <div class="drag-zone" />
  </div>
</template>
<script lang="ts" setup>
/// <reference types=".vue-global-types/vue_3.5_false.d.ts" />
import type { Country } from '~~/types/geography.types'

defineProps({
  country: {
    type: Object as PropType<Country>,
    required: true,
  },
})
</script>
<style lang="scss" scoped>
@import '~/assets/scss/rules/breakpoints';
$countryTilePadding: 0.4rem;
.country-tile {
  width: 100%;
  height: 100%;
  cursor: move;
  overflow: hidden;
  position: relative;
  display: inline-block;
}

article {
  z-index: 2;
  width: 100%;
  height: 100%;
  padding: 2rem;
  position: relative;
  background: #fffbf5;
  border: 0.1rem solid #000;
}

.subtitle {
  opacity: 0.5;
}
.flag-wrapper {
  border: 0.1rem solid #000;
}
.flag:deep(svg) {
  width: 100%;
  display: block;
}

.flag-pinwheel {
  top: -50%;
  left: -50%;
  opacity: 0;
  width: 200%;
  height: 200%;
  position: absolute;
  pointer-events: none;
  transition: opacity 0.6s;
  animation: rotate 3s linear infinite;
}

@media screen and (max-width: $tablet) {
  .country-tile {
    width: 100%;
  }
  .country-tile article {
    width: 100%;
    display: grid;
    align-items: center;
    grid-template-columns: 60% 40%;
    border-radius: 0.6rem 0 0 0.6rem;
    border-right: 0.4rem solid var(--black);
  }
  .subtitle {
    display: none;
  }
  .flag-wrapper {
    border: none;
  }
  .flag :deep(svg) {
    max-height: 4rem;
    border: 0.1rem solid var(--black);
  }
}

@media screen and (min-width: $tablet) {
  .country-tile {
    padding: $countryTilePadding $countryTilePadding 0 $countryTilePadding;
    border-radius: 1.9rem 1.9rem 0 0;
    &:hover {
      outline: 0.1rem solid #ccc;
      .flag-pinwheel {
        opacity: 0.8;
      }
    }
  }

  article {
    text-align: center;
    border-radius: 1.9rem 1.9rem 0 0;
    border-bottom: 0.6rem solid #000;
  }
  header {
    text-align: center;
    margin-bottom: 1rem;
  }

  // country exceptions
  .country-tile {
    &[data-iso='NP'] :deep(svg) {
      margin: auto;
      max-height: 14rem;
    }
    &[data-iso='CH'] .flag {
      background: #d52b1e;
      :deep(svg) {
        margin: auto;
        max-height: 14rem;
      }
    }
  }
}

@keyframes rotate {
  100% {
    transform: rotate(1turn);
  }
}
</style>
<style lang="scss"></style>
