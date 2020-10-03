<template>
  <div id="card-view"></div>
</template>
<script lang="ts">
import Vue from 'vue'
export default Vue.extend({
  props: {
    cardsInView: {
      type: Number,
      default: 5,
    },
  },
})
</script>
