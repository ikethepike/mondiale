<template>
  <div>
    <pre class="phase-indicator">{{ player?.phase }}</pre>
    <slot />
    <!-- <small id="copyright" class="theme-color">© Isaac</small> -->
  </div>
</template>
<script lang="ts" setup>
import { useClientEvents } from '~~/lib/events/client-side'

const { player } = useClientEvents()
</script>
<style lang="scss">
// temp!
.phase-indicator {
  top: 0;
  color: #fff;
  z-index: 3000;
  position: absolute;
  mix-blend-mode: difference;
}

.line-button {
  width: 100%;
  border: none;
  display: block;
  color: inherit;
  cursor: pointer;
  font-size: 100%;
  font-family: inherit;
  background: transparent;
  padding: var(--button-padding);
  border-top: 1px solid currentColor;
}

.line-button:disabled {
  cursor: not-allowed;
  text-decoration: line-through;
}

label {
  display: inline-block;
}

input[type='text'],
input[type='email'],
input[type='password'] {
  width: 100%;
  border: none;
  height: 2rem;
  background: #fff;
}

p {
  letter-spacing: 0.5px;
  line-height: 140%;
}

.modal-wrapper {
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 100;
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
  max-width: 56rem;
  position: relative;
}

.form-content {
  padding: 3rem;
}

// theme adaptive backgrounds
.theme-gradient {
  background: linear-gradient(180deg, var(--soft-mint) 0%, var(--warm-sand) 100%), var(--soft-blue);
}

.theme-background {
  background: #fff;
}

.theme-highlight-background {
  transition: fill 0.3s;
  background: var(--hior-ange);
}

.theme-color {
  color: var(--text-color-light);
}

html body .theme-highlight-fill[class] {
  fill: var(--hior-ange);
}

@media (prefers-color-scheme: dark) {
  .theme-gradient {
    background: linear-gradient(180deg, var(--dark-blue) 0%, var(--soft-mint) 100%),
      var(--soft-blue);
  }

  .theme-background {
    background: #252525;
  }

  .theme-color {
    color: var(--text-color-dark);
  }

  .theme-highlight-background {
    background: var(--dark-blue);
  }

  html body .theme-highlight-fill[class] {
    fill: var(--warm-sand);
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
