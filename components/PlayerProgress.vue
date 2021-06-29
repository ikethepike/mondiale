<template>
  <div class="progress-wrapper">
    <div class="progress-bar" :style="{ transform: `scaleX(${progress}%)`, background: color }">
      <figure :class="figure"></figure>
    </div>
  </div>
</template>
<script lang="ts">
import Vue from 'vue'
export default Vue.extend({
  props: {
    progress: {
      type: Number,
      required: true,
    },
    color: {
      type: String,
      required: true,
    },
  },
  computed: {
    figure() {
      return ''
    },
  },
})
</script>
<style>
.progress-bar {
  height: 0.5rem;
  transition: 0.4s;
  transform-origin: left;
}

figure {
  display: none;
}
</style>
