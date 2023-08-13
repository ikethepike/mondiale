<template>
  <div class="test-page">
    <PlayerNewPawn />

    <Board />
  </div>
</template>
<style lang="scss" scoped>
@import '~/assets/scss/rules/breakpoints';

.test-page {
  z-index: 3000;
  min-height: 100vh;
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
