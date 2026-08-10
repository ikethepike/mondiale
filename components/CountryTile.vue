<template>
  <div class="country-tile" :data-iso="country.isoCode">
    <CountryPinwheel class="flag-pinwheel" :country="country" />
    <article>
      <header>
        <h3>{{ countryName(country) }}</h3>
        <p class="subtitle">{{ country.geography.capital.name }}</p>
      </header>

      <div class="flag-wrapper">
        <CountryFlag class="flag" :country="country" />
      </div>
    </article>

    <div class="drag-zone" />
  </div>
</template>
<script lang="ts" setup>
import { countryName } from '~~/lib/country'
import type { Country } from '~~/types/geography.types'

defineProps({
  country: {
    type: Object as PropType<Country>,
    required: true,
  },
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;
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
    display: block;
  }
  .country-tile article {
    width: 100%;
    height: 100%;
    display: grid;
    align-items: center;
    padding: 0.6rem 1.6rem;
    grid-template-columns: 60% 40%;
    border-radius: 0.6rem 0 0 0.6rem;
    border-right: 0.4rem solid var(--black);
  }
  .subtitle {
    display: none;
  }
  .flag-wrapper {
    border: none;
    display: flex;
    justify-content: flex-end;
  }
  .flag :deep(svg) {
    max-height: 5rem;
    border: 0.1rem solid var(--black);
  }
}

@media screen and (min-width: $tablet) {
  .country-tile {
    // The tile is the responsive unit, not the viewport: hands deal 4/5/6
    // tiles by difficulty, so the same screen width leaves very different
    // tracks. Everything inside scales off the tile's own inline size.
    container: country-tile / inline-size;
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
    padding: clamp(0.8rem, 7cqw, 2rem);
    border-radius: 1.9rem 1.9rem 0 0;
    border-bottom: 0.6rem solid #000;
  }
  header {
    text-align: center;
    margin-bottom: clamp(0.3rem, 3cqw, 1rem);

    h3 {
      line-height: 1.2;
      font-size: clamp(1.3rem, 9cqw, 1.9rem);
      // Never clip a name against the card edge — long ones (Liechtenstein,
      // Bosnia and Herzegovina) wrap instead.
      overflow-wrap: break-word;
    }
  }
  .subtitle {
    font-size: clamp(1.1rem, 6.5cqw, 1.6rem);
  }

  // On the narrowest tracks (6-tile hands at intermediate widths) the
  // capital yields before the country name has to.
  @container country-tile (max-width: 130px) {
    .subtitle {
      display: none;
    }
  }

  // country exceptions
  .country-tile {
    &[data-iso='NP'] :deep(svg) {
      margin: auto;
      max-height: clamp(6rem, 60cqw, 14rem);
    }
    &[data-iso='CH'] .flag {
      background: #d52b1e;
      :deep(svg) {
        margin: auto;
        max-height: clamp(6rem, 60cqw, 14rem);
      }
    }
  }
}
</style>
<style lang="scss"></style>
