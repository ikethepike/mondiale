<template>
  <div>
    <Nuxt />
  </div>
</template>

<style>
* {
  box-sizing: border-box;
}

html,
body,
h1,
h2,
h3,
h4,
h5,
h6 {
  margin: 0;
  padding: 0;
}

/* Palette */
:root {
  --text-color-dark: #f1b982;
  --text-color-light: #0d2f61;

  --dark-blue: #0d2f61;
  --soft-blue: #3481a1;
  --soft-mint: #90bcb5;
  --warm-sand: #f1b982;
  --hior-ange: #ec6247;
}

.line-button {
  width: 100%;
  border: none;
  display: block;
  padding: 1.625rem 0;
  background: transparent;
  border-top: 1px solid var(--dark-blue);
}
</style>
