<template>
  <div class="modal-wrapper">
    <slot />
  </div>
</template>
<style lang="scss" scoped>
.modal-wrapper {
  width: 100%;
  display: flex;
  height: 100vh;
  overflow-y: auto;
  position: absolute;
  pointer-events: auto;
}
</style>
