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
</style>
