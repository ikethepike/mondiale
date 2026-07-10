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

// NOTE: the wrapper must stay dvh-sized. An lvh scroller cannot scroll when
// its content fits (no overflow = no travel), stranding whatever sits behind
// the URL bar. Under-bar bleed and inner scrolling are mutually exclusive.
</style>
