<template>
  <div>
    <Nuxt />
  </div>
</template>

<style lang="scss">
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

// Typography
@font-face {
  font-family: 'Sweden Sans';
  src: url('~assets/fonts/sweden/SwedenSans.woff2') format('woff2'),
    url('~assets/fonts/sweden/SwedenSans.woff') format('woff');
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}

body {
  font-family: 'Sweden Sans', monospace;
}

.line-button {
  width: 100%;
  border: none;
  display: block;
  color: inherit;
  padding: 1.625rem 0;
  background: transparent;
  font-family: inherit;
  border-top: 1px solid currentColor;
}

label {
  display: block;
}

.modal-wrapper {
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  position: fixed;
}
.modal-background {
  width: 100%;
  height: 100%;
  position: absolute;
  background: rgba(#fff, 0.3);
}
.modal {
  width: 95%;
  margin: auto;
  max-width: 43rem;
  position: relative;
}
.form-content {
  padding: 1rem;
}

// theme adaptive backgrounds
.theme-gradient {
  background: linear-gradient(
      180deg,
      var(--soft-mint) 0%,
      var(--warm-sand) 100%
    ),
    var(--soft-blue);
}
.theme-background {
  background: #fff;
}
.theme-highlight-background {
  background: var(--hior-ange);
}
.theme-color {
  color: var(--text-color-light);
}

@media (prefers-color-scheme: dark) {
  .theme-gradient {
    background: linear-gradient(
        180deg,
        var(--dark-blue) 0%,
        var(--soft-mint) 100%
      ),
      var(--soft-blue);
  }
  .theme-background {
    background: #020202;
  }
  .theme-color {
    color: var(--text-color-dark);
  }
  .theme-highlight-background {
    background: var(--dark-blue);
  }
}

// Animations
.slide-block {
  position: relative;
  animation-iteration-count: 1;
  animation-name: slide-up;
  &.left {
    animation-name: slide-left;
  }
  &.right {
    animation-name: slide-right;
  }
  &.bottom {
    animation-name: slide-bottom;
  }
}

@for $i from 1 through 20 {
  .slide-block:nth-child(#{$i}) {
    animation-duration: #{$i * 0.33 + s};
  }
}

@keyframes slide-up {
  from {
    transform: translateY(5rem);
  }
  to {
    transform: translateY(0);
  }
}

@keyframes slide-bottom {
  from {
    transform: translateY(-5rem);
  }
  to {
    transform: translateY(0);
  }
}

@keyframes slide-right {
  from {
    transform: translateX(-5rem);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes slide-left {
  from {
    transform: translateX(5rem);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
</style>
