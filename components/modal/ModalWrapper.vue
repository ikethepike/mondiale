<template>
  <div class="modal-wrapper">
    <slot />
  </div>
</template>
<style lang="scss" scoped>
.modal-wrapper {
  width: 100%;
  display: flex;
  height: var(--viewport-height);
  overflow-y: auto;
  position: absolute;
  pointer-events: auto;
  padding: var(--safe-top) var(--safe-right) var(--safe-bottom) var(--safe-left);
}

// Phones: the wrapper (the clipping container) extends to the LARGE viewport
// so modal cards run beneath the translucent URL bar instead of being sheared
// off above it. Cards keep their own tail padding to hold controls in clear
// air — inner scrolling never retracts the bar.
@media screen and (max-width: 640px) {
  .modal-wrapper {
    height: 100lvh;
  }
}
</style>
