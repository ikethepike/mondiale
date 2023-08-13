<template>
  <div class="rectangle" :style="{ '--height': height, '--width': width, color: color }">
    <div class="side front" />
    <div class="side back" />
    <!-- <div class="side right" /> -->
    <div class="side left" />
    <div class="side top" />
    <!-- <div class="side bottom" /> -->
  </div>
</template>
<script setup lang="ts">
defineProps({
  height: {
    type: String,
    required: true,
  },
  width: {
    type: String,
    required: true,
  },
  shaded: {
    type: Boolean,
    default: true,
  },
  color: {
    type: String,
    default: 'currentColor',
  },
  // colors: {
  //   type: Object as PropType<{
  //     [key in 'left' | 'right' | 'top' | 'bottom' | 'front' | 'back']: string
  //   }>,
  //   required: true,
  // },
})
</script>
<style lang="scss" scoped>
.rectangle {
  width: max(var(--width), var(--height));
  height: max(var(--height), var(--width));
  margin: calc(max(var(--width), var(--height)) / 4) calc(max(var(--width), var(--height)) / 4);
  transform-style: preserve-3d;
  transform: rotate3d(
    -0.666666666666666,
    1,
    -0.25,
    45deg
  ); // Standardize everything at a soft 45deg tilt

  position: relative;
  // bottom: calc((max(var(--width), var(--height)) * 0.25) * -1);
}

.side {
  width: 100%;
  height: 100%;
  position: absolute;
  background: currentColor;
  backface-visibility: inherit;
}

// Rotations
.front {
  width: var(--width);
  height: var(--height);
  transform: translateZ(calc(max(var(--width), var(--height)) / 2));
}
.back {
  transform: rotateY(180deg) translateZ(calc(max(var(--width), var(--height)) / 2));
  height: var(--height);
  width: var(--width);
}
.right {
  transform: rotateY(90deg) translateZ(calc(var(--height) / 2));
}
.left {
  width: var(--width);
  height: var(--height);
  transform: rotateY(-90deg) translateZ(calc(max(var(--width), var(--height)) / 2));
  &::before {
    content: '';
    width: 100%;
    height: 100%;
    position: absolute;
    background: rgba(0, 0, 0, 0.3);
  }
}
.top {
  transform: rotateX(90deg) translateZ(calc(max(var(--width), var(--height)) / 2));
  width: var(--width);
  height: var(--width);
  &::before {
    content: '';
    width: 100%;
    height: 100%;
    position: absolute;
    background: rgba(0, 0, 0, 0.1);
  }
}
.bottom {
  transform: rotateX(-90deg) translateZ(calc((var(--height) * 4) * -1));
}
</style>
