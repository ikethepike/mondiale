<template>
  <ButtonBase class="line">
    <slot />
  </ButtonBase>
</template>
<style lang="scss" scoped>
.line {
  background-color: transparent;
  border: 0.1rem solid var(--black);
}
</style>
