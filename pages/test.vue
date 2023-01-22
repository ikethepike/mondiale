<template>
  <div class="test-page">
    <!-- <pre>{{ groupings }}</pre> -->
    <GameMap :country-groupings="Object.values(COLOR_CODED_REGIONS)" />
  </div>
</template>
<script lang="ts" setup>
// import { objectExpression } from '@babel/types'
// import { COUNTRIES } from '~~/data/countries.gen'
import { COLOR_CODED_REGIONS } from '~~/lib/challenges/final-challenge'
// import { CountryColorGrouping } from '~~/types/map.type'

// const groupings = computed<CountryColorGrouping[]>(() => {
//   const countries = Object.values(COUNTRIES)
//   const colors = ['teal', 'red', 'tomato', 'magenta', 'crimson', 'yellow', '#252525']

//   const regions: { [key: string]: CountryColorGrouping } = {}

//   for (const country of countries) {
//     if (!regions[country.region]) {
//       regions[country.region] = {
//         color: colors.shift() || 'maroon',
//         countries: [],
//       }
//     }

//     regions[country.region].countries.push(country.isoCode)
//   }

//   return Object.values(regions)
// })
</script>
<style lang="scss" scoped>
@import '~/assets/scss/rules/breakpoints';

.test-page {
  z-index: 3000;
  position: relative;
  background: aliceblue;
}

// .test-wrapper {
//   // display: grid;
//   // grid-template-rows: max-content;
// }

// @media screen and (min-width: $tablet) {
//   .test-wrapper {
//     width: 100%;
//     bottom: 0;
//     display: grid;
//     position: absolute;
//     align-items: stretch;
//     grid-template-columns: repeat(auto-fill, minmax(15vw, 1fr));
//   }
// }
</style>
